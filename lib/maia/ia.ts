// Maia: as chamadas pra IA (03/11). Messages API direto, com ferramentas (o laço roda aqui) e com imagem quando precisa ver a foto.
export const MODELO = () => process.env.MAIA_MODELO || 'claude-sonnet-5-5'

export type Ferramenta = {
  name: string
  description: string
  input_schema: any
  roda: (entrada: any) => Promise<any>
}

// 06/11: as regras (system) e as ferramentas vão com cache: elas se repetem em toda volta da conversa, e o que vem do cache custa ~10%.
// E cada chamada anota o uso (tokens) em maia_eventos 'uso_ia', pra saber o custo real por conversa.
async function chama(corpo: any) {
  const { uso, ...resto } = corpo
  const c = { model: MODELO(), max_tokens: 2000, ...resto }
  if (typeof c.system === 'string' && c.system) c.system = [{ type: 'text', text: c.system, cache_control: { type: 'ephemeral' } }]
  if (Array.isArray(c.tools) && !c.tools.length) delete c.tools
  if (Array.isArray(c.tools) && c.tools.length) c.tools = c.tools.map((t: any, i: number) => i === c.tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t)
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(c),
    signal: AbortSignal.timeout(90000),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('IA ' + r.status + ' ' + JSON.stringify(j).slice(0, 300))
  anotaUso(c.model, j.usage, uso)
  return j
}

// 08/11 (T11): uso.fase = em que parte do modelo misto foi a chamada ('barato' ou 'refeito'), pra medir o custo de cada uma
type Uso = { tipo?: string; negocio_id?: string | null; conversa_id?: string | null; fase?: string | null }
function anotaUso(modelo: string, u: any, uso?: Uso) {
  if (!u) return
  import('./db').then(({ maiaDb }) => maiaDb.evento('uso_ia', uso?.negocio_id || null, {
    tipo: uso?.tipo || 'outro', conversa_id: uso?.conversa_id || null, modelo, ...(uso?.fase ? { fase: uso.fase } : {}),
    entrada: u.input_tokens || 0, saida: u.output_tokens || 0,
    cache_lido: u.cache_read_input_tokens || 0, cache_gravado: u.cache_creation_input_tokens || 0,
  })).catch(() => { /* anotar o uso nunca derruba a resposta */ })
}

// conversa com ferramentas: a IA pode chamar várias, uma depois da outra, até responder o texto final
const FERRAMENTA_EM_TEXTO = /<\/?(invoke|parameter|function_calls)\b/i
export const limpaFerramentaEmTexto = (t: string) => t
  .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '')
  .replace(/<invoke\b[\s\S]*?<\/invoke>/gi, '')
  .replace(/<\/?(invoke|parameter|function_calls)\b[^>]*>/gi, '')
  .trim()

// op.modelo: outro modelo só pra essa conversa (ex.: o atendimento do cliente num modelo menor); op.uso: o que anotar no custo
// 08/11 (T11): op.antes = olha os pedidos de ferramenta ANTES de rodar; se devolver true, para sem rodar nenhum deles
// (volta { parou: true }: o modelo misto refaz a decisão no modelo mais forte)
export async function comFerramentas(sistema: string, pedido: string | any[], ferramentas: Ferramenta[], maxVoltas = 6, op: { modelo?: string; uso?: Uso; antes?: (pedidos: { name: string; input: any }[]) => boolean } = {}): Promise<{ texto: string; usadas: { nome: string; entrada: any; saida: any }[]; parou?: boolean }> {
  const extra: any = { uso: op.uso, ...(op.modelo ? { model: op.modelo } : {}) }
  const msgs: any[] = [{ role: 'user', content: pedido }]
  const usadas: { nome: string; entrada: any; saida: any }[] = []
  // o texto pode vir junto com o pedido de ferramenta (antes dela) ou só no fim: junta tudo
  const textos: string[] = []
  for (let volta = 0; volta < maxVoltas; volta++) {
    const j = await chama({ ...extra, system: sistema, messages: msgs, tools: ferramentas.map(({ roda, ...f }) => f) })
    msgs.push({ role: 'assistant', content: j.content })
    let t = (j.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
    const pedidos = (j.content || []).filter((c: any) => c.type === 'tool_use')
    // 05/11: às vezes o modelo ESCREVE a chamada de ferramenta como texto (<invoke ...>). Isso nunca pode ir pro cliente:
    // pede de novo, usando a ferramenta de verdade
    // 08/11 (reteste r5): só pede de novo quando veio uma CHAMADA INTEIRA escrita (<invoke name=...>). Tag solta no fim
    // ("</invoke>") só é limpa: pedir de novo fazia a IA explicar o erro ("o que escapou foi uma tag solta...") e isso ia pro dono
    if (FERRAMENTA_EM_TEXTO.test(t)) {
      const chamadaInteira = /<invoke\b[^>]*\bname=/i.test(t)
      if (chamadaInteira && !pedidos.length && volta < maxVoltas - 1) { msgs.push({ role: 'user', content: 'Tu escreveu a chamada da ferramenta como texto. Usa as ferramentas de verdade e depois escreve só a mensagem, no formato pedido. Não comenta sobre isso: o que tu escrever vai direto pra pessoa.' }); continue }
      t = limpaFerramentaEmTexto(t)
    }
    if (t) textos.push(t)
    if (!pedidos.length || j.stop_reason !== 'tool_use') {
      // se a resposta final veio vazia depois das ferramentas, pede o texto
      if (!textos.length && usadas.length) {
        msgs.push({ role: 'user', content: 'Agora escreve a resposta pra mandar, no formato pedido.' })
        const k = await chama({ ...extra, system: sistema, messages: msgs, tools: ferramentas.map(({ roda, ...f }) => f), tool_choice: { type: 'none' } })
        const t2 = (k.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
        if (t2) textos.push(t2)
      }
      // vale o texto da última volta; se ela veio vazia, o último que veio antes (sem repetir os dois)
      return { texto: limpaFerramentaEmTexto(t || textos[textos.length - 1] || ''), usadas }
    }
    if (op.antes && op.antes(pedidos.map((p: any) => ({ name: p.name, input: p.input || {} })))) return { texto: '', usadas, parou: true }
    const respostas: any[] = []
    for (const p of pedidos) {
      const f = ferramentas.find(x => x.name === p.name)
      let saida: any
      try { saida = f ? await f.roda(p.input || {}) : { erro: 'ferramenta não existe' } } catch (e: any) { saida = { erro: String(e?.message || e).slice(0, 300) } }
      usadas.push({ nome: p.name, entrada: p.input, saida })
      respostas.push({ type: 'tool_result', tool_use_id: p.id, content: JSON.stringify(saida ?? { ok: true }).slice(0, 8000) })
    }
    msgs.push({ role: 'user', content: respostas })
  }
  return { texto: '', usadas }
}

// pedido simples que volta em JSON (com fotos opcionais pra ela ver)
export async function emJson<T = any>(sistema: string, pedido: string, imagens: { b64: string; mime: string }[] = [], op: { modelo?: string; uso?: { tipo?: string; negocio_id?: string | null; conversa_id?: string | null } } = {}): Promise<T> {
  const conteudo: any[] = [
    ...imagens.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.b64 } })),
    { type: 'text', text: pedido + '\n\nResponde SÓ com o JSON, sem nada antes ou depois.' },
  ]
  // 13/11 (custo por peça): pedido com foto que não disse o tipo (ou disse 'outro') é a Maia olhando a foto/vídeo do dono pra
  // escolher a mídia da peça (dono.ts descreveFoto/descreveVideo, demo-amostra): vai no tipo 'peca_foto' do custo.ts.
  // Foto de CLIENTE (midia-cliente.ts) diz o tipo 'cliente' e fica de fora disso
  const uso = imagens.length && (!op.uso?.tipo || op.uso.tipo === 'outro') ? { ...(op.uso || {}), tipo: 'peca_foto' } : op.uso
  const j = await chama({ system: sistema, max_tokens: 4000, messages: [{ role: 'user', content: conteudo }], ...(op.modelo ? { model: op.modelo } : {}), uso })
  const txt = (j.content || []).map((c: any) => c.text || '').join('')
  const a = txt.indexOf('{') >= 0 && (txt.indexOf('[') < 0 || txt.indexOf('{') < txt.indexOf('[')) ? txt.indexOf('{') : txt.indexOf('[')
  const b = Math.max(txt.lastIndexOf('}'), txt.lastIndexOf(']'))
  return JSON.parse(txt.slice(a, b + 1))
}

// o jeito da Maia falar, igual em todo lugar
export const JEITO = `Tu és a Maia, uma IA de marketing da Carreira no Digital (RS). Tu és o time de marketing inteiro de pequenos negócios: estrategista, designer, editora de vídeo, social media, gestora de tráfego, vendedora e analista de resultados.
Personalidade: vendedora esperta e focada em resultado, com jeito de colega de trabalho queridona. Séria com dinheiro, preço e número; leve e divertida na hora certa, nunca palhaça.
Fala "tu" (nunca "você"), com jeito gaúcho leve ("ó", "viu?", às vezes "bah"). Mensagens de WhatsApp curtas, uma ideia por mensagem, no máximo 1 emoji. Sem negrito, sem travessão, sem lista longa. Nunca bajula.
Sempre diz que é uma IA se perguntarem. Nunca promete venda ou faturamento. Nunca inventa o que não sabe do negócio: pergunta ou diz que confirma.`
