import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { enviarPush } from '@/lib/push'

export const maxDuration = 30

// Registra que alguém abriu a proposta. Chamada pela própria página pública, SEM login — é o cliente
// que abre, e ele não tem conta no sistema.
//
// Por que isso é seguro mesmo aberto: só grava (nunca devolve conteúdo), só aceita um endereço que
// exista, e só guarda o tipo de aparelho e de onde veio o clique. Nada de IP nem nome.
//
// Uma abertura por hora por aparelho: o cliente que rola a página pra cima e pra baixo não vira
// "abriu 14 vezes", mas quem volta amanhã conta de novo.

const UMA_HORA = 36e5
// o aviso no celular sai no máximo uma vez por dia por proposta (decisão do Nando em 23/09/2026):
// a primeira abertura sempre avisa; depois, só quando ela VOLTA a ler — que é sinal de decisão.
const UM_DIA = 20 * 36e5   // 20h, e não 24, pra não empurrar o aviso pra cada dia mais tarde

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({} as any))
    const slug = (b.slug || '').toString().slice(0, 40)
    if (!slug) return NextResponse.json({ ok: true })

    const { data: orc } = await sb.from('orcamentos')
      .select('id, org_id, lead_id, avisado_em').eq('slug', slug).maybeSingle()
    if (!orc) return NextResponse.json({ ok: true })

    const ua = req.headers.get('user-agent') || ''
    const dispositivo = /iphone|android|mobile/i.test(ua) ? 'celular' : 'computador'

    // ⚠️ SEGUNDA TRAVA CONTRA ABERTURA DE CASA. A página já não chama esta rota quando o link tem
    // `?eu=1`, mas quem copia o endereço e cola noutra aba perde a marca. Se veio do nosso próprio
    // painel, não é o cliente lendo.
    const de = (b.de || '').toString()
    if (de.includes('/dashboard')) return NextResponse.json({ ok: true, interna: true })

    const { data: ultima } = await sb.from('orcamento_aberturas')
      .select('criado_em').eq('orcamento_id', orc.id).eq('dispositivo', dispositivo)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (ultima && Date.now() - new Date(ultima.criado_em).getTime() < UMA_HORA) return NextResponse.json({ ok: true, repetida: true })

    await sb.from('orcamento_aberturas').insert({
      org_id: orc.org_id,
      orcamento_id: orc.id,
      dispositivo,
      referencia: de.slice(0, 200) || null,
    })

    // ── O AVISO. É o motivo desta rota existir hoje: proposta aberta é a janela mais quente que
    // existe, e ela dura minutos. O push chega em segundos; a tarefa é a rede de segurança pra
    // quando ninguém viu o push.
    const agora = Date.now()
    const jaAvisou = orc.avisado_em ? agora - new Date(orc.avisado_em).getTime() < UM_DIA : false
    if (!jaAvisou) {
      await sb.from('orcamentos').update({ avisado_em: new Date(agora).toISOString() }).eq('id', orc.id)

      const { data: lead } = orc.lead_id
        ? await sb.from('leads').select('id, nome, vendedor_id').eq('id', orc.lead_id).maybeSingle()
        : { data: null as any }
      const nome = lead?.nome || 'O cliente'
      const primeira = !orc.avisado_em

      // o push não pode derrubar a leitura da proposta: ela já está aberta na tela da pessoa
      try {
        await enviarPush(
          primeira ? `${nome} abriu a proposta` : `${nome} voltou na proposta`,
          primeira
            ? `Está lendo agora, no ${dispositivo}. É a melhor hora pra falar.`
            : `Abriu de novo, no ${dispositivo}. Voltar a ler costuma ser sinal de decisão.`,
          lead?.id ? `/dashboard/crm?lead=${lead.id}` : '/dashboard/orcamentos',
        )
      } catch { /* aviso que falha não pode quebrar o registro da abertura */ }

      if (lead?.id) {
        try {
          await sb.from('tarefas_lead').insert({
            org_id: orc.org_id,
            lead_id: lead.id,
            vendedor_id: lead.vendedor_id || null,
            tipo: 'proposta_aberta',
            titulo: `Falar agora — ${nome} abriu a proposta`,
            descricao: primeira
              ? `${nome} acabou de abrir a proposta pela primeira vez, no ${dispositivo}. Ligar enquanto o assunto está na cabeça dele.`
              : `${nome} voltou a abrir a proposta, no ${dispositivo}. Quem relê costuma estar decidindo — vale um toque.`,
            data_vencimento: new Date(agora).toISOString(),
          })
          await sb.from('lead_andamentos').insert({
            lead_id: lead.id,
            tipo: 'observacao',
            observacao: `👀 ${nome} ${primeira ? 'abriu' : 'voltou a abrir'} a proposta (${dispositivo}).`,
          })
        } catch { /* idem */ }
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    // nunca atrapalha a leitura da proposta
    return NextResponse.json({ ok: true })
  }
}
