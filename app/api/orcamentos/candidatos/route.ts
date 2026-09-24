import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temProposta, exigeTurma } from '@/lib/proposta-produtos'
import { turmasDoProduto, rotuloDaTurma } from '@/lib/turma-da-proposta'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 60

// Quem pode virar orçamento: lead que JÁ FALOU alguma coisa — ligação transcrita, conversa de
// WhatsApp, ou as duas. É desse material que saem as objeções; sem ele a proposta seria um modelo
// em branco com o nome da pessoa.
//
// SÓ LEITURA. Esta rota não grava nada.
//
// QUEM VÊ O QUÊ: a mesma regra do resto do sistema (lib/quem-eu-vejo) — eu, quem responde a mim, e
// tudo se eu for dono. Vendedor com escopo "próprios" só enxerga os leads dele. Lead sem vendedor é
// do grupo e aparece pra todos.
//
// ⚠️ ORDEM DAS CONSULTAS IMPORTA. A primeira versão contava as mensagens de TODAS as conversas da
// janela e só depois descobria de quem eram: 9,5 segundos pra uma tela. Agora resolve os leads e a
// permissão primeiro, e conta mensagens só das conversas que vão aparecer.

const DIA = 864e5
const JANELA_DIAS = 30               // material mais velho que isso já não descreve o momento do lead
const MIN_CARACTERES_LIGACAO = 400   // abaixo disso a transcrição é "alô, não posso falar agora"
const MIN_MENSAGENS_CLIENTE = 3      // menos que isso não é conversa, é "bom dia" e endereço
const MAX_CONVERSAS_CONTADAS = 40    // teto de conversas contadas: a tela mostra 40 leads, não adianta contar mais
const LIGACAO_BASTA = 1200           // com uma transcrição desse tamanho, a conversa não muda a decisão

// O rótulo da etapa vem SEMPRE do banco (tabela `etapas`), nunca escrito aqui: cada instalação
// nomeia o funil do jeito dela, e nome de etapa cravado em código é palavra de escola vazando.
async function rotulosDasEtapas(org: string): Promise<Record<string, string>> {
  const { data } = await sb.from('etapas').select('chave, label').eq('org_id', org)
  return Object.fromEntries((data || []).map((e: any) => [e.chave, e.label]))
}

// O QUE DÁ PRA VENDER — vem JUNTO com a lista de leads, e não depois de escolher um.
//
// ⚠️ ANTES O PRODUTO SÓ APARECIA DEPOIS DO LEAD. Quem abria "Gerar orçamento" via uma lista de
// nomes e mais nada: não havia como saber que a tela vende dois produtos, nem qual. O Nando abriu
// procurando o Anúncios para Negócios Locais e não achou — ele existia, escondido um passo adiante.
async function produtosOfertaveis(org: string) {
  const { data: todos } = await sb.from('produtos').select('id, nome, preco_venda').eq('org_id', org).eq('ativo', true).order('nome')
  const ofertaveis = (todos || []).filter(p => temProposta(p.nome))
  return Promise.all(ofertaveis.map(async p => ({
    id: p.id, nome: p.nome, preco_venda: p.preco_venda,
    exige_turma: exigeTurma(p.nome),
    turmas: exigeTurma(p.nome)
      ? (await turmasDoProduto(org, p.id)).map(t => ({ ...t, rotulo: rotuloDaTurma(t) }))
      : [],
  })))
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const { data: perfil } = await sb.from('usuarios_perfil').select('leads_escopo').eq('id', quem.eu.id).maybeSingle()
    const soMeus = perfil?.leads_escopo === 'proprios'
    const podeVer = (vendedorId: string | null) =>
      !vendedorId || (soMeus ? vendedorId === quem.eu.id : quem.visiveis.has(vendedorId))

    const sp = new URL(req.url).searchParams
    const busca = (sp.get('q') || '').trim().toLowerCase()
    const buscaDigitos = busca.replace(/\D/g, '')
    const desde = new Date(Date.now() - JANELA_DIAS * DIA).toISOString()

    // ── 1) ligações com transcrição pronta
    const { data: ligacoes } = await sb.from('ligacoes')
      .select('id, lead_id, duracao, criado_em, metadata')
      .eq('org_id', org).gte('criado_em', desde)
      .order('criado_em', { ascending: false }).limit(400)

    const ligacaoDoLead = new Map<string, { id: string; minutos: number; em: string; caracteres: number }>()
    for (const l of ligacoes || []) {
      const texto = (l.metadata as any)?.transcricao
      if (!l.lead_id || !texto || String(texto).length < MIN_CARACTERES_LIGACAO) continue
      const nova = { id: l.id, minutos: Math.round((l.duracao || 0) / 60), em: l.criado_em, caracteres: String(texto).length }
      const atual = ligacaoDoLead.get(l.lead_id)
      // fica a mais longa: é a que tem conversa de verdade dentro
      if (!atual || nova.caracteres > atual.caracteres) ligacaoDoLead.set(l.lead_id, nova)
    }

    // ── 2) conversas de WhatsApp com movimento na janela (ainda sem contar mensagem)
    const { data: conversas } = await sb.from('wa_conversas')
      .select('id, lead_id, ultima_msg_em')
      .eq('org_id', org).not('lead_id', 'is', null).gte('ultima_msg_em', desde)
      .order('ultima_msg_em', { ascending: false }).limit(200)

    // ── 3) os leads dessas fontes, e a permissão, ANTES de contar qualquer mensagem
    const idsLead = [...new Set([...ligacaoDoLead.keys(), ...(conversas || []).map(c => c.lead_id as string)])]
    if (!idsLead.length) return NextResponse.json({ ok: true, itens: [], produtos: await produtosOfertaveis(org) })

    const leads: any[] = []
    for (let i = 0; i < idsLead.length; i += 200) {
      const { data } = await sb.from('leads')
        .select('id, nome, whatsapp, etapa, vendedor_id, negocio, atualizado_em')
        .eq('org_id', org).in('id', idsLead.slice(i, i + 200))
      leads.push(...(data || []))
    }

    const visiveis = leads
      .filter(l => podeVer(l.vendedor_id))
      // Ganho e perda CONTINUAM na lista, marcados: cliente ganho é candidato a upsell (o segundo
      // produto é a venda mais barata que existe), e proposta é justamente o que reabre uma perda.
      .filter(l => {
        if (!busca) return true
        const achaNome = (l.nome || '').toLowerCase().includes(busca)
        const achaFone = buscaDigitos.length >= 3 && (l.whatsapp || '').replace(/\D/g, '').includes(buscaDigitos)
        return achaNome || achaFone
      })
    const idsVisiveis = new Set(visiveis.map(l => l.id))
    if (!visiveis.length) return NextResponse.json({ ok: true, itens: [], produtos: await produtosOfertaveis(org) })

    // ── 4) agora sim, contar mensagens — só das conversas dos leads que vão aparecer
    const conversasParaContar = (conversas || [])
      .filter(c => idsVisiveis.has(c.lead_id as string))
      // quem já tem transcrição longa não precisa da contagem: o material dele já está resolvido
      .filter(c => (ligacaoDoLead.get(c.lead_id as string)?.caracteres || 0) < LIGACAO_BASTA)
      .slice(0, MAX_CONVERSAS_CONTADAS)

    const contagem = new Map<string, { mensagens: number; doCliente: number; caracteres: number }>()
    const idsConversa = conversasParaContar.map(c => c.id)
    for (let i = 0; i < idsConversa.length; i += 100) {
      const bloco = idsConversa.slice(i, i + 100)
      for (let de = 0; ; de += 1000) {
        // ⚠️ SEM `order`, paginar é loteria: o banco não garante a mesma ordem entre páginas e a
        // mesma mensagem pode voltar duas vezes. Foi o que fez a Dara aparecer com 48 mensagens na
        // lista e 24 na tela de preparar (18/09/2026).
        const { data: msgs } = await sb.from('wa_mensagens')
          .select('conversa_id, direcao, status, texto')
          .in('conversa_id', bloco).order('criado_em').order('id').range(de, de + 999)
        for (const m of msgs || []) {
          const c = contagem.get(m.conversa_id) || { mensagens: 0, doCliente: 0, caracteres: 0 }
          c.mensagens++
          if (m.direcao === 'recebida' || m.status === 'recebida') c.doCliente++
          c.caracteres += (m.texto || '').length
          contagem.set(m.conversa_id, c)
        }
        if (!msgs || msgs.length < 1000) break
      }
    }

    const conversaDoLead = new Map<string, { id: string; mensagens: number; doCliente: number; caracteres: number; em: string }>()
    for (const c of conversasParaContar) {
      const n = contagem.get(c.id)
      if (!n || n.doCliente < MIN_MENSAGENS_CLIENTE) continue
      const nova = { id: c.id, mensagens: n.mensagens, doCliente: n.doCliente, caracteres: n.caracteres, em: c.ultima_msg_em as string }
      const atual = conversaDoLead.get(c.lead_id as string)
      if (!atual || nova.caracteres > atual.caracteres) conversaDoLead.set(c.lead_id as string, nova)
    }

    const rotulo = await rotulosDasEtapas(org)
    const nomeDe: Record<string, string> = Object.fromEntries(quem.pessoas.map((p: any) => [p.id, p.nome]))

    const itens = visiveis
      .map(l => {
        const ligacao = ligacaoDoLead.get(l.id) || null
        const conversa = conversaDoLead.get(l.id) || null
        const caracteres = (ligacao?.caracteres || 0) + (conversa?.caracteres || 0)
        return {
          lead_id: l.id,
          nome: l.nome,
          whatsapp: l.whatsapp,
          etapa: l.etapa,
          etapa_label: rotulo[l.etapa] || l.etapa,
          vendedor: l.vendedor_id ? (nomeDe[l.vendedor_id] || null) : null,
          negocio: l.negocio || null,
          // 'upsell' = já comprou, a proposta é do próximo produto; 'retomada' = perdido, a proposta reabre
          intencao: l.etapa === 'ganho' ? 'upsell' : l.etapa === 'perda' ? 'retomada' : 'venda',
          fontes: { ligacao, conversa },
          // material curto não bloqueia: a tela avisa e deixa gerar mesmo assim, sem página de objeções
          material: caracteres >= 1200 ? 'suficiente' : 'curto',
          ultima_atividade: [ligacao?.em, conversa?.em, l.atualizado_em].filter(Boolean).sort().pop(),
        }
      })
      // lead que entrou só por conversa curta demais sai da lista (ficou sem fonte nenhuma)
      .filter(i => i.fontes.ligacao || i.fontes.conversa)
      .sort((a, b) => {
        if (a.material !== b.material) return a.material === 'suficiente' ? -1 : 1
        return String(b.ultima_atividade).localeCompare(String(a.ultima_atividade))
      })
      .slice(0, 40)

    return NextResponse.json({ ok: true, itens, so_meus: soMeus, produtos: await produtosOfertaveis(org) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
