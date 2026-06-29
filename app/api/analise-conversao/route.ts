import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 300

const MODELO = 'claude-opus-4-8'
const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)

async function todos(tab: string, cols: string, f?: (q: any) => any) {
  let out: any[] = [], from = 0
  for (;;) {
    let q: any = supabase.from(tab).select(cols).range(from, from + 999)
    if (f) q = f(q)
    const { data } = await q
    if (!data || !data.length) break
    out.push(...data); if (data.length < 1000) break; from += 1000
  }
  return out
}

const PROMPT = `Você é analista sênior de vendas da Carreira No Digital (cursos presenciais de marketing digital). Recebe conversas REAIS de atendimento (WhatsApp + áudios transcritos com 🎤 + ligações transcritas), cada uma rotulada como GANHO (fechou a venda) ou PERDA (não fechou).

Sua tarefa: extrair o aprendizado prático e ATUAL desses atendimentos. Use SEMPRE exemplos reais (nome do lead + um trecho curto e literal da conversa). Seja específico, no tom da escola.

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, neste formato exato:
{
 "resumo": "<2-3 frases: o que mais separa quem fecha de quem não fecha agora>",
 "o_que_funciona": [{"titulo":"<curto>","descricao":"<o que e por que funciona>","exemplo_lead":"<nome>","exemplo_trecho":"<trecho literal curto>"}],
 "o_que_nao_funciona": [{"titulo":"<curto>","descricao":"<onde travou e o que fazer diferente>","exemplo_lead":"<nome>","exemplo_trecho":"<trecho literal curto>"}],
 "melhor_fluxo": [{"passo":"<nome do passo>","descricao":"<o que fazer nesse passo>"}],
 "frases": ["<frase pronta que fechou venda, literal ou quase>"]
}

Dê VÁRIOS itens em o_que_funciona (5-8), o_que_nao_funciona (5-8) e frases (6-10). O melhor_fluxo deve ter 5-7 passos, do primeiro contato ao fechamento. Tudo baseado nas conversas reais abaixo.`

// monta o corpus de transcrições (texto + áudios + ligações), ganho x perda
async function montarCorpus() {
  const leads = await todos('leads', 'id,nome,whatsapp,etapa,valor_venda,codigo_turma')
  const convs = await todos('wa_conversas', 'id,telefone,lead_id')
  const ganho = leads.filter(l => l.etapa === 'ganho')
  const perda = leads.filter(l => l.etapa === 'perda')
  const alvo = [...ganho, ...perda]
  const alvoIds = new Set(alvo.map(l => l.id))

  // conv ids por lead (lead_id ou telefone)
  const telConv: Record<string, string[]> = {}
  const byLead: Record<string, string[]> = {}
  for (const c of convs) {
    if (c.lead_id) (byLead[c.lead_id] = byLead[c.lead_id] || []).push(c.id)
    const s = suf(c.telefone); if (s.length === 8) (telConv[s] = telConv[s] || []).push(c.id)
  }
  const convIdsDoLead = (l: any) => {
    const s = suf(l.whatsapp)
    return [...new Set([...(byLead[l.id] || []), ...(telConv[s] || [])])]
  }
  const todasConvIds = [...new Set(alvo.flatMap(convIdsDoLead))]

  // mensagens dessas conversas
  const msgsPorConv: Record<string, any[]> = {}
  for (let i = 0; i < todasConvIds.length; i += 200) {
    const chunk = todasConvIds.slice(i, i + 200)
    const { data } = await supabase.from('wa_mensagens').select('conversa_id,direcao,status,texto,criado_em').in('conversa_id', chunk).not('texto', 'is', null)
    for (const m of data || []) (msgsPorConv[m.conversa_id] = msgsPorConv[m.conversa_id] || []).push(m)
  }
  // ligações transcritas desses leads
  const ligPorLead: Record<string, string[]> = {}
  const { data: ligs } = await supabase.from('ligacoes').select('lead_id,metadata').not('metadata', 'is', null)
  for (const lg of ligs || []) {
    const tr = lg.metadata && lg.metadata.transcricao
    if (lg.lead_id && alvoIds.has(lg.lead_id) && tr && tr.trim()) (ligPorLead[lg.lead_id] = ligPorLead[lg.lead_id] || []).push(tr)
  }

  function transcript(l: any) {
    const ids = convIdsDoLead(l)
    let ms = ids.flatMap(id => msgsPorConv[id] || []).sort((a, b) => +new Date(a.criado_em) - +new Date(b.criado_em))
    const linhas: string[] = []
    for (const m of ms) {
      const quem = (m.direcao === 'recebida' || m.status === 'recebida') ? 'CLIENTE' : 'NÓS'
      const c = (m.texto || '').replace(/\s+/g, ' ').trim().slice(0, 350)
      if (c) linhas.push(`${quem}: ${c}`)
    }
    for (const tr of ligPorLead[l.id] || []) linhas.push(`[LIGAÇÃO] ${tr.replace(/\s+/g, ' ').trim().slice(0, 1500)}`)
    return linhas
  }
  function bloco(l: any, tag: string) {
    const t = transcript(l); if (t.length < 4) return ''
    let txt = t.join('\n'); if (txt.length > 3500) txt = txt.slice(0, 3500) + '…'
    return `\n\n===== ${tag} | ${l.nome} | turma:${l.codigo_turma || '-'}${l.etapa === 'ganho' ? ` | VENDA R$${l.valor_venda || '?'}` : ''} =====\n${txt}`
  }
  // pega os com mais diálogo (mais informativos), limita pra controlar custo
  const ordena = (arr: any[]) => arr.map(l => ({ l, n: transcript(l).length })).sort((a, b) => b.n - a.n)
  const topGanho = ordena(ganho).slice(0, 16).map(x => x.l)
  const topPerda = ordena(perda).slice(0, 16).map(x => x.l)

  let corpus = '# CONVERSAS REAIS\n\n## VENDAS GANHAS\n'
  for (const l of topGanho) corpus += bloco(l, 'GANHO')
  corpus += '\n\n\n## PERDAS\n'
  for (const l of topPerda) corpus += bloco(l, 'PERDA')
  return { corpus, nGanho: topGanho.length, nPerda: topPerda.length }
}

export async function GET() {
  // guardamos a última análise em webhook_logs (origem=analise-conversao) pra não exigir tabela nova
  const { data } = await supabase.from('webhook_logs').select('payload, criado_em')
    .eq('origem', 'analise-conversao').order('criado_em', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ ok: true, analise: data ? { dados: data.payload, gerado_em: data.criado_em } : null })
}

export async function POST() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'Falta ANTHROPIC_API_KEY no servidor.' })
  try {
    const { corpus, nGanho, nPerda } = await montarCorpus()
    if (corpus.length < 500) return NextResponse.json({ ok: false, error: 'Poucas conversas com diálogo pra analisar.' })

    const client = new Anthropic({ apiKey: key })
    const resp = await client.messages.create({
      model: MODELO, max_tokens: 4096, system: PROMPT,
      messages: [{ role: 'user', content: corpus }],
    })
    const raw = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
    let dados: any = null
    try { dados = JSON.parse(raw) } catch {
      const a = raw.indexOf('{'), z = raw.lastIndexOf('}')
      if (a >= 0 && z > a) { try { dados = JSON.parse(raw.slice(a, z + 1)) } catch {} }
    }
    if (!dados) return NextResponse.json({ ok: false, error: 'IA não retornou JSON válido.' })

    dados._meta = { ganho: nGanho, perda: nPerda }
    const { data: salvo, error } = await supabase.from('webhook_logs')
      .insert({ origem: 'analise-conversao', evento: 'analise', payload: dados, status: 'processado' })
      .select('payload, criado_em').single()
    if (error) return NextResponse.json({ ok: false, error: error.message })
    return NextResponse.json({ ok: true, analise: { dados: salvo.payload, gerado_em: salvo.criado_em } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' })
  }
}
