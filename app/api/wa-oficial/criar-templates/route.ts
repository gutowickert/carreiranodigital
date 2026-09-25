import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Cria/submete os templates de follow-up no Meta de uma vez (WhatsApp Business Management API).
// Converte {{nome}} -> {{1}} (posicional, na ordem que aparece) e monta o example que o Meta exige.
const GRAPH = 'https://graph.facebook.com/v25.0'

// valores de exemplo pras variáveis (o Meta pede um exemplo por variável)
const EXEMPLO: Record<string, string> = {
  nome: 'Maria', vendedor: 'Ricardo', cidade: 'Porto Alegre', curso: 'Anúncios para Negócios Locais',
  datas: '11, 12 e 13/08', preco_pix: 'R$797', preco_parcelado: '6x de R$166,17', preco_cartao: '6x de R$166,17',
  prazo: '25/08', condicao_bolsa: 'R$697 à vista',
  // o bom dia do assistente do time
  compromissos: '3', primeiro: '14:00 Moacir: Encontro 2 (sede de Porto Alegre)',
}

// {{nome}} {{cidade}} ... -> {{1}} {{2}} ... + lista de exemplos na ordem
function paraMeta(corpo: string): { texto: string; exemplos: string[] } {
  const ordem: string[] = []
  const texto = (corpo || '').replace(/\{\{(\w+)\}\}/g, (_m, nome) => {
    let i = ordem.indexOf(nome)
    if (i < 0) { ordem.push(nome); i = ordem.length - 1 }
    return `{{${i + 1}}}`
  })
  return { texto, exemplos: ordem.map(n => EXEMPLO[n] || n) }
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    // resolve WABA + token: prefere a conexão de coexistência (quando conectar); senão o número de disparo (env)
    const { data: conta } = await sb.from('wa_oficial_config').select('waba_id, token').eq('org_id', org).eq('ativo', true).not('waba_id', 'is', null).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    const WABA = conta?.waba_id || process.env.WA_OFICIAL_WABA_ID || ''
    const TOKEN = conta?.token || process.env.WA_OFICIAL_TOKEN || ''
    if (!WABA || !TOKEN) return NextResponse.json({ ok: false, error: 'Falta WABA/token oficial (conecte a coexistência ou configure o número de disparo).' }, { status: 200 })

    // ids explícitos (envio 1-a-1 / lote selecionado) ou, sem ids, só os rascunhos (não reenvia o que já foi)
    const b = await req.json().catch(() => ({} as any))
    const ids: string[] | null = Array.isArray(b?.ids) ? b.ids.filter(Boolean) : null
    let q = sb.from('followup_templates').select('*').eq('org_id', org).eq('ativo', true)
    q = (ids && ids.length) ? q.in('id', ids) : q.eq('status', 'rascunho')
    const { data: temps } = await q.order('ordem')
    if (!temps?.length) return NextResponse.json({ ok: true, criados: 0, msg: 'Nenhum template pendente pra submeter.' })

    const resultados: any[] = []
    for (const t of temps) {
      const { texto, exemplos } = paraMeta(t.corpo || '')

      // BOTÕES DE RESPOSTA RÁPIDA, quando o template pedir (coluna `botoes`, separados por |).
      //
      // Serve pra pergunta cuja resposta precisa ser SEM AMBIGUIDADE — a reconfirmação de um
      // encontro é o caso: com texto livre o cliente responde "acho que sim" ou "só se for de
      // manhã", e alguém tem que adivinhar. Numa decisão que custa uma viagem, adivinhar é caro.
      //
      // O clique volta pro webhook como uma mensagem cujo texto é exatamente o rótulo do botão —
      // é assim que o motor sabe o que ele respondeu, sem interpretar nada.
      const botoes = String(t.botoes || '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 3)
      const componentes: any[] = [{
        type: 'BODY',
        text: texto,
        ...(exemplos.length ? { example: { body_text: [exemplos] } } : {}),
      }]
      if (botoes.length) {
        componentes.push({
          type: 'BUTTONS',
          buttons: botoes.map(b => ({ type: 'QUICK_REPLY', text: b.slice(0, 25) })),
        })
      }

      const body: any = {
        name: t.nome_meta,
        language: 'pt_BR',
        category: (t.categoria || 'marketing').toUpperCase(), // MARKETING | UTILITY
        components: componentes,
      }
      const r = await fetch(`${GRAPH}/${WABA}/message_templates`, {
        method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(x => x.json()).catch(() => null)

      const ok = !!(r && r.id)
      // "Já existe conteúdo em Portuguese (BR) para esse modelo" = já está no Meta → trata como sucesso
      const jaExiste = !ok && /j[áa]\s*existe|already exists|conflita|duplicate/i.test(JSON.stringify(r?.error || ''))
      if (ok || jaExiste) {
        await sb.from('followup_templates').update({ status: 'submetido', atualizado_em: new Date().toISOString() }).eq('id', t.id)
      }
      resultados.push({ nome: t.nome_meta, ok: ok || jaExiste, jaExiste, erro: (ok || jaExiste) ? null : (r?.error?.error_user_msg || r?.error?.message || JSON.stringify(r?.error || 'falha')) })
    }
    const enviados = resultados.filter(r => r.ok).length
    return NextResponse.json({ ok: true, criados: enviados, total: resultados.length, resultados })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
