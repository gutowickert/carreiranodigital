// Maia: as chamadas pra IA (03/11). Messages API direto, com ferramentas (o laço roda aqui) e com imagem quando precisa ver a foto.
export const MODELO = () => process.env.MAIA_MODELO || 'claude-sonnet-5-5'

export type Ferramenta = {
  name: string
  description: string
  input_schema: any
  roda: (entrada: any) => Promise<any>
}

async function chama(corpo: any) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO(), max_tokens: 2000, ...corpo }),
    signal: AbortSignal.timeout(90000),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('IA ' + r.status + ' ' + JSON.stringify(j).slice(0, 300))
  return j
}

// conversa com ferramentas: a IA pode chamar várias, uma depois da outra, até responder o texto final
export async function comFerramentas(sistema: string, pedido: string | any[], ferramentas: Ferramenta[], maxVoltas = 6) {
  const msgs: any[] = [{ role: 'user', content: pedido }]
  const usadas: { nome: string; entrada: any; saida: any }[] = []
  // o texto pode vir junto com o pedido de ferramenta (antes dela) ou só no fim: junta tudo
  const textos: string[] = []
  for (let volta = 0; volta < maxVoltas; volta++) {
    const j = await chama({ system: sistema, messages: msgs, tools: ferramentas.map(({ roda, ...f }) => f) })
    msgs.push({ role: 'assistant', content: j.content })
    const t = (j.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
    if (t) textos.push(t)
    const pedidos = (j.content || []).filter((c: any) => c.type === 'tool_use')
    if (!pedidos.length || j.stop_reason !== 'tool_use') {
      // se a resposta final veio vazia depois das ferramentas, pede o texto
      if (!textos.length && usadas.length) {
        msgs.push({ role: 'user', content: 'Agora escreve a resposta pra mandar, no formato pedido.' })
        const k = await chama({ system: sistema, messages: msgs, tools: ferramentas.map(({ roda, ...f }) => f), tool_choice: { type: 'none' } })
        const t2 = (k.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
        if (t2) textos.push(t2)
      }
      // vale o texto da última volta; se ela veio vazia, o último que veio antes (sem repetir os dois)
      return { texto: t || textos[textos.length - 1] || '', usadas }
    }
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
export async function emJson<T = any>(sistema: string, pedido: string, imagens: { b64: string; mime: string }[] = []): Promise<T> {
  const conteudo: any[] = [
    ...imagens.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.b64 } })),
    { type: 'text', text: pedido + '\n\nResponde SÓ com o JSON, sem nada antes ou depois.' },
  ]
  const j = await chama({ system: sistema, max_tokens: 4000, messages: [{ role: 'user', content: conteudo }] })
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
