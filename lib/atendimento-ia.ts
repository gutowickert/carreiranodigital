import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

// Motor de resposta do atendimento: ANTES de sugerir, busca conversas REAIS onde a gente
// FECHOU (mesmo produto/situação) e responde no nosso tom, seguindo o fluxo que converte.
const MODELO = 'claude-sonnet-4-6'
const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)
const familia = (cod: string) => { const c = (cod || '').toLowerCase(); return c.startsWith('fc') ? 'FC' : c.startsWith('anl') ? 'ANL' : c.startsWith('anlnovohamburgo') ? 'ANL' : '?' }
const produtoDaFamilia = (f: string) => f === 'FC' ? 'Formação Completa em Marketing Digital' : f === 'ANL' ? 'Anúncios para Negócios Locais' : ''

const SYSTEM = `Você é o MELHOR vendedor da Carreira No Digital (escola de marketing digital, cursos presenciais no RS). Seu trabalho: sugerir a próxima mensagem pra um lead no WhatsApp, do jeito que a gente REALMENTE fecha.

REGRA DE OURO: antes de responder, olhe os EXEMPLOS DE VENDAS GANHAS fornecidos e ache o momento/objeção mais parecido com o do lead atual — responda como a gente respondeu nas que FECHARAM. Copie o TOM (humano, direto, caloroso, sem robô), o ritmo e as jogadas que funcionam.

NUNCA invente preço, data ou turma — use só as TURMAS EM VENDAS informadas. Se o lead falou por áudio, o texto vem com 🎤. Se faltar oferta pro caso, diga a próxima ação (ligar, segurar vaga).

Responda APENAS um JSON válido:
{
 "situacao": "<1 frase: onde o lead está / o que ele acabou de dizer>",
 "objecao": "<a barreira atual, ou 'nenhuma'>",
 "etapa_funil": "<ex: descoberta, oferta, objeção de preço, fechamento>",
 "resposta": "<a mensagem PRONTA pra mandar no WhatsApp — nosso tom, curta, humana, 1 a 3 frases; pode sugerir áudio se fizer sentido>",
 "baseado_em": "<em qual venda ganha você se baseou + o que era parecido>",
 "proximo_passo": "<a ação concreta depois dessa mensagem>"
}`

async function carregarMensagens(convIds: string[]) {
  const msgs: Record<string, any[]> = {}
  for (let i = 0; i < convIds.length; i += 100) {
    const chunk = convIds.slice(i, i + 100); let from = 0
    for (; ;) {
      const { data } = await supabase.from('wa_mensagens').select('conversa_id, direcao, status, texto, criado_em').in('conversa_id', chunk).range(from, from + 999)
      if (!data?.length) break
      for (const m of data) (msgs[m.conversa_id] = msgs[m.conversa_id] || []).push(m)
      if (data.length < 1000) break; from += 1000
    }
  }
  return msgs
}
function linhas(convIds: string[], msgs: Record<string, any[]>, max = 40) {
  const ms = convIds.flatMap(id => msgs[id] || []).sort((a, b) => +new Date(a.criado_em) - +new Date(b.criado_em))
  const out: string[] = []
  for (const m of ms) {
    const quem = (m.direcao === 'recebida' || m.status === 'recebida') ? 'CLIENTE' : 'NÓS'
    const c = (m.texto || '').replace(/\s+/g, ' ').trim().slice(0, 300)
    if (c) out.push(`${quem}: ${c}`)
  }
  return out.slice(-max)
}

export async function sugerirAtendimento(input: { leadId?: string; conversaId?: string }): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'falta ANTHROPIC_API_KEY' }

  // 1) lead/conversa atual
  let lead: any = null
  if (input.leadId) {
    const { data } = await supabase.from('leads').select('id, nome, whatsapp, codigo_turma, turma_id, etapa').eq('id', input.leadId).maybeSingle()
    lead = data
  } else if (input.conversaId) {
    const { data: c } = await supabase.from('wa_conversas').select('id, telefone, nome, lead_id').eq('id', input.conversaId).maybeSingle()
    if (c?.lead_id) { const { data } = await supabase.from('leads').select('id, nome, whatsapp, codigo_turma, turma_id, etapa').eq('id', c.lead_id).maybeSingle(); lead = data }
    if (!lead && c) lead = { id: null, nome: c.nome || 'Lead', whatsapp: c.telefone, codigo_turma: null, etapa: '?' }
  }
  if (!lead) return { ok: false, error: 'lead/conversa não encontrado' }

  // 2) mapa de conversas
  const { data: convs } = await supabase.from('wa_conversas').select('id, telefone, lead_id')
  const byLead: Record<string, string[]> = {}, telConv: Record<string, string[]> = {}
  for (const c of (convs || [])) { if (c.lead_id) (byLead[c.lead_id] = byLead[c.lead_id] || []).push(c.id); const s = suf(c.telefone); if (s.length === 8) (telConv[s] = telConv[s] || []).push(c.id) }
  const convIdsDe = (l: any) => [...new Set([...(l.id ? byLead[l.id] || [] : []), ...(telConv[suf(l.whatsapp)] || [])])]

  const fam = familia(lead.codigo_turma || '')
  const produto = produtoDaFamilia(fam)

  // 3) EXEMPLOS DE VENDAS GANHAS (mesmo produto de preferência)
  const { data: wonAll } = await supabase.from('leads').select('id, nome, whatsapp, codigo_turma, valor_venda').eq('etapa', 'ganho')
  let won = (wonAll || []).filter((l: any) => fam === '?' ? true : familia(l.codigo_turma || '') === fam)
  if (won.length < 4) won = wonAll || [] // sem match de produto, usa todos
  won = won.slice(0, 22)
  const convAtual = convIdsDe(lead)
  const convWon = won.map(l => ({ l, ids: convIdsDe(l) }))
  const todosIds = [...new Set([...convAtual, ...convWon.flatMap(x => x.ids)])]
  const msgs = await carregarMensagens(todosIds)

  const atual = linhas(convAtual, msgs, 30)
  if (atual.length < 2) return { ok: false, error: 'conversa atual sem mensagens suficientes' }

  const ganhas = convWon.map(x => ({ nome: x.l.nome, valor: x.l.valor_venda, t: linhas(x.ids, msgs, 30) }))
    .filter(x => x.t.length >= 4).sort((a, b) => b.t.length - a.t.length).slice(0, 6)

  // 4) playbook (análise de conversão) + 5) dossiê (voz do cliente)
  const { data: pb } = await supabase.from('webhook_logs').select('payload').eq('origem', 'analise-conversao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  const playbook = (pb?.payload as any) || {}
  let dossie: any = null
  if (produto) { const { data: d } = await supabase.from('inteligencia_cliente').select('dossie, cidade').eq('produto', produto).limit(1).maybeSingle(); dossie = (d as any)?.dossie || null }

  // 6) turmas em vendas (ofertas reais)
  const { data: tv } = await supabase.from('turmas').select('codigo, preco_venda, data_inicio, data_fim, produtos(nome), cidades(nome)').eq('status', 'em_vendas').limit(30)
  const ofertas = (tv || []).map((t: any) => `${t.produtos?.nome} — ${t.cidades?.nome} — ${t.codigo} — R$${t.preco_venda} — ${t.data_inicio} a ${t.data_fim}`)

  // 7) monta o prompt
  let corpus = `# LEAD ATUAL\nNome: ${lead.nome} | Produto de interesse: ${produto || '(indef)'} | Etapa: ${lead.etapa}\n\n## Conversa até agora (responda à última do CLIENTE):\n${atual.join('\n')}\n\n`
  corpus += `# VENDAS GANHAS SIMILARES (espelhe o TOM e as jogadas que fecharam):\n`
  ganhas.forEach((g, i) => { corpus += `\n--- GANHO ${i + 1}: ${g.nome}${g.valor ? ` (R$${g.valor})` : ''} ---\n${g.t.join('\n').slice(0, 2600)}\n` })
  if (playbook?.o_que_funciona) corpus += `\n# O QUE FUNCIONA (playbook):\n${(playbook.o_que_funciona || []).map((x: any) => `- ${x.titulo}: ${x.descricao}`).join('\n')}\n`
  if (playbook?.melhor_fluxo) corpus += `\n# FLUXO QUE CONVERTE:\n${(playbook.melhor_fluxo || []).map((x: any, i: number) => `${i + 1}. ${x.passo}: ${x.descricao}`).join('\n')}\n`
  if (dossie?.objecoes) corpus += `\n# OBJEÇÕES E CONTORNOS (voz do cliente):\n${JSON.stringify(dossie.objecoes).slice(0, 1500)}\n`
  if (ofertas.length) corpus += `\n# TURMAS EM VENDAS (única fonte de preço/data — não invente):\n${ofertas.join('\n')}\n`

  const client = new Anthropic({ apiKey: key })
  const resp = await client.messages.create({ model: MODELO, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: corpus }] })
  const raw = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
  let dados: any = null
  try { dados = JSON.parse(raw) } catch { const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); if (a >= 0 && z > a) { try { dados = JSON.parse(raw.slice(a, z + 1)) } catch { } } }
  if (!dados) return { ok: false, error: 'IA não retornou JSON' }
  return { ok: true, sugestao: dados, baseado_em_n: ganhas.length }
}
