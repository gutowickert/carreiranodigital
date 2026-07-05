import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

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

// Mapa turma_id/codigo -> { produto, cidade }
async function mapaTurmas() {
  const [turmas, produtos, cidades] = await Promise.all([
    todos('turmas', 'id, codigo, produto_id, cidade_id'),
    todos('produtos', 'id, nome'),
    todos('cidades', 'id, nome'),
  ])
  const prod = Object.fromEntries(produtos.map((p: any) => [p.id, p.nome]))
  const cid = Object.fromEntries(cidades.map((c: any) => [c.id, c.nome]))
  const porId: Record<string, { produto: string; cidade: string }> = {}
  const porCodigo: Record<string, { produto: string; cidade: string }> = {}
  for (const t of turmas) {
    const seg = { produto: prod[t.produto_id] || '(sem produto)', cidade: cid[t.cidade_id] || '(sem cidade)' }
    porId[t.id] = seg
    if (t.codigo) porCodigo[t.codigo.toLowerCase()] = seg
  }
  return { porId, porCodigo, produtos: produtos.map((p: any) => p.nome), cidades: cidades.map((c: any) => c.nome) }
}

// Lista os segmentos (produto e produto×cidade) com contagem de ganho/perda.
export async function listarSegmentos() {
  const { porId, porCodigo } = await mapaTurmas()
  const leads = await todos('leads', 'id, etapa, turma_id, codigo_turma', q => q.in('etapa', ['ganho', 'perda']))
  const segOf = (l: any) => porId[l.turma_id] || porCodigo[(l.codigo_turma || '').toLowerCase()] || null
  const porProduto: Record<string, { ganho: number; perda: number; cidades: Record<string, { ganho: number; perda: number }> }> = {}
  for (const l of leads) {
    const s = segOf(l); if (!s) continue
    const p = (porProduto[s.produto] = porProduto[s.produto] || { ganho: 0, perda: 0, cidades: {} })
    p[l.etapa as 'ganho' | 'perda']++
    const c = (p.cidades[s.cidade] = p.cidades[s.cidade] || { ganho: 0, perda: 0 })
    c[l.etapa as 'ganho' | 'perda']++
  }
  // cache existente
  const cache = await todos('inteligencia_cliente', 'produto, cidade, gerado_em, n_ganhos, n_perdas')
  const cacheKey = (p: string, c: string) => `${p}||${c}`
  const cacheMap = new Map(cache.map((r: any) => [cacheKey(r.produto, r.cidade || ''), r]))
  const out: any[] = []
  for (const [produto, d] of Object.entries(porProduto)) {
    out.push({ produto, cidade: '', ganho: d.ganho, perda: d.perda, cache: cacheMap.get(cacheKey(produto, '')) || null })
    for (const [cidade, cc] of Object.entries(d.cidades)) {
      if (cc.ganho + cc.perda < 6) continue // cidade só entra com volume mínimo
      out.push({ produto, cidade, ganho: cc.ganho, perda: cc.perda, cache: cacheMap.get(cacheKey(produto, cidade)) || null })
    }
  }
  return out.sort((a, b) => (b.ganho + b.perda) - (a.ganho + a.perda))
}

const PROMPT = `Você é estrategista de conteúdo e pesquisa de mercado da Carreira No Digital (cursos presenciais de marketing digital no RS). Recebe conversas REAIS de atendimento (WhatsApp + áudios transcritos com 🎤 + ligações), de UM produto (e às vezes uma cidade), cada uma rotulada GANHO (comprou) ou PERDA (não comprou).

Seu objetivo NÃO é ensinar a vender — é destilar a VOZ DO CLIENTE pra alimentar um sistema que gera conteúdo (posts, anúncios, roteiros de vídeo). Quero saber o que o cliente SENTE, DESEJA e FALA — nas palavras dele. Use SEMPRE trechos literais (com o nome do lead). Nunca invente; se não apareceu, deixe a lista curta.

Responda APENAS com um objeto JSON válido, sem texto antes/depois, neste formato exato:
{
 "perfil": "<quem é o cliente desse produto: profissão, tipo de negócio, momento — 2-3 frases>",
 "dores": [{"dor":"<a dor em 1 frase>","fala":"<trecho literal do cliente>","lead":"<nome>"}],
 "desejos": [{"desejo":"<o que ele quer alcançar>","fala":"<trecho literal>","lead":"<nome>"}],
 "frases_reais": [{"categoria":"dor|desejo|objecao|elogio","texto":"<frase literal do cliente, curta>","lead":"<nome>"}],
 "gatilhos_compra": [{"gatilho":"<o que fez fechar>","evidencia":"<trecho de um GANHO>","lead":"<nome>"}],
 "objecoes": [{"objecao":"<a objeção>","frequencia":"alta|media|baixa","mata_venda":true,"contorno":"<o que responder/mostrar no conteúdo pra preemptar>"}],
 "motivos_perda": [{"motivo":"<por que não fechou>","fala":"<trecho de uma PERDA>","lead":"<nome>"}],
 "angulos_conteudo": {
   "organico": ["<ângulo/gancho pra conteúdo orgânico: autoridade, bastidor, transformação, mito a quebrar>"],
   "anuncio": ["<ângulo/gancho direto pra anúncio: dor -> solução -> oferta>"]
 },
 "particularidades_cidade": "<o que muda nessa cidade/região, se houver sinal; senão 'sem sinal claro'>",
 "provas_sociais": [{"texto":"<elogio/resultado literal de quem comprou>","lead":"<nome>"}]
}

Quantidades: dores 5-8, desejos 4-6, frases_reais 10-15, gatilhos_compra 4-6, objecoes 4-7, motivos_perda 4-6, angulos organico 5-8 e anuncio 5-8, provas_sociais 3-6. Tudo ancorado nas conversas reais abaixo.`

async function montarCorpus(produto: string, cidade: string) {
  const { porId, porCodigo } = await mapaTurmas()
  const leads = await todos('leads', 'id, nome, whatsapp, etapa, valor_venda, codigo_turma, turma_id', q => q.in('etapa', ['ganho', 'perda']))
  const segOf = (l: any) => porId[l.turma_id] || porCodigo[(l.codigo_turma || '').toLowerCase()] || null
  const alvo = leads.filter((l: any) => { const s = segOf(l); return s && s.produto === produto && (!cidade || s.cidade === cidade) })
  const ganho = alvo.filter((l: any) => l.etapa === 'ganho')
  const perda = alvo.filter((l: any) => l.etapa === 'perda')
  const alvoIds = new Set(alvo.map((l: any) => l.id))

  const convs = await todos('wa_conversas', 'id, telefone, lead_id')
  const telConv: Record<string, string[]> = {}, byLead: Record<string, string[]> = {}
  for (const c of convs) {
    if (c.lead_id) (byLead[c.lead_id] = byLead[c.lead_id] || []).push(c.id)
    const s = suf(c.telefone); if (s.length === 8) (telConv[s] = telConv[s] || []).push(c.id)
  }
  const convIdsDoLead = (l: any) => [...new Set([...(byLead[l.id] || []), ...(telConv[suf(l.whatsapp)] || [])])]
  const todasConvIds = [...new Set(alvo.flatMap(convIdsDoLead))]

  const msgsPorConv: Record<string, any[]> = {}
  for (let i = 0; i < todasConvIds.length; i += 100) {
    const chunk = todasConvIds.slice(i, i + 100)
    let from = 0
    for (;;) {
      const { data } = await supabase.from('wa_mensagens').select('conversa_id,direcao,status,texto,criado_em,tipo').in('conversa_id', chunk).range(from, from + 999)
      if (!data || !data.length) break
      for (const m of data) (msgsPorConv[m.conversa_id] = msgsPorConv[m.conversa_id] || []).push(m)
      if (data.length < 1000) break
      from += 1000
    }
  }
  const ligPorLead: Record<string, string[]> = {}
  const { data: ligs } = await supabase.from('ligacoes').select('lead_id,metadata')
  for (const lg of ligs || []) {
    if (!lg.lead_id || !alvoIds.has(lg.lead_id)) continue
    const tr = lg.metadata && lg.metadata.transcricao
    if (tr && tr.trim()) (ligPorLead[lg.lead_id] = ligPorLead[lg.lead_id] || []).push(tr)
  }
  const transcript = (l: any) => {
    const ids = convIdsDoLead(l)
    const ms = ids.flatMap(id => msgsPorConv[id] || []).sort((a, b) => +new Date(a.criado_em) - +new Date(b.criado_em))
    const linhas: string[] = []
    for (const m of ms) {
      const quem = (m.direcao === 'recebida' || m.status === 'recebida') ? 'CLIENTE' : 'NÓS'
      const c = (m.texto || '').replace(/\s+/g, ' ').trim().slice(0, 350)
      if (c) linhas.push(`${quem}: ${c}`)
    }
    for (const tr of ligPorLead[l.id] || []) linhas.push(`[LIGAÇÃO] ${tr.replace(/\s+/g, ' ').trim().slice(0, 1200)}`)
    return linhas
  }
  const bloco = (l: any, tag: string) => {
    const t = transcript(l); if (t.length < 4) return ''
    let txt = t.join('\n'); if (txt.length > 3200) txt = txt.slice(0, 3200) + '…'
    return `\n\n===== ${tag} | ${l.nome}${l.etapa === 'ganho' ? ` | VENDA R$${l.valor_venda || '?'}` : ''} =====\n${txt}`
  }
  const ordena = (arr: any[]) => arr.map(l => ({ l, n: transcript(l).length })).sort((a, b) => b.n - a.n).map(x => x.l)
  const topGanho = ordena(ganho).slice(0, 18)
  const topPerda = ordena(perda).slice(0, 18)

  let corpus = `# CONVERSAS REAIS — Produto: ${produto}${cidade ? ` | Cidade: ${cidade}` : ''}\n\n## GANHOS (compraram)\n`
  for (const l of topGanho) corpus += bloco(l, 'GANHO')
  corpus += '\n\n\n## PERDAS (não compraram)\n'
  for (const l of topPerda) corpus += bloco(l, 'PERDA')
  return { corpus, nGanho: topGanho.length, nPerda: topPerda.length }
}

export async function lerDossie(produto: string, cidade: string) {
  const { data } = await supabase.from('inteligencia_cliente').select('*').eq('produto', produto).eq('cidade', cidade || '').maybeSingle()
  return data || null
}

export async function gerarDossie(produto: string, cidade: string) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false as const, error: 'Falta ANTHROPIC_API_KEY no servidor.' }
  const { corpus, nGanho, nPerda } = await montarCorpus(produto, cidade)
  if (corpus.length < 800) return { ok: false as const, error: 'Poucas conversas com diálogo nesse segmento pra destilar.' }

  const client = new Anthropic({ apiKey: key })
  const resp = await client.messages.create({ model: MODELO, max_tokens: 4096, system: PROMPT, messages: [{ role: 'user', content: corpus }] })
  const raw = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
  let dossie: any = null
  try { dossie = JSON.parse(raw) } catch {
    const a = raw.indexOf('{'), z = raw.lastIndexOf('}')
    if (a >= 0 && z > a) { try { dossie = JSON.parse(raw.slice(a, z + 1)) } catch {} }
  }
  if (!dossie) return { ok: false as const, error: 'não consegui destilar o dossiê agora' }

  const agora = new Date().toISOString()
  await supabase.from('inteligencia_cliente').upsert({
    produto, cidade: cidade || '', dossie, n_ganhos: nGanho, n_perdas: nPerda, gerado_em: agora, atualizado_em: agora,
  }, { onConflict: 'produto,cidade' })
  return { ok: true as const, dossie, nGanho, nPerda, gerado_em: agora }
}
