// Envio pela API Oficial do WhatsApp (Cloud API / Meta).
// Usado pelos disparos. Atendimento normal continua no Z-API.
const TOKEN = process.env.WA_OFICIAL_TOKEN || ''
const PHONE_ID = process.env.WA_OFICIAL_PHONE_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

// Normaliza telefone: só dígitos, garante DDI 55 (Brasil)
export function foneOficial(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d && !d.startsWith('55') && d.length >= 10 && d.length <= 11) d = '55' + d
  return d
}

// Envia uma mensagem de TEXTO de SESSÃO (resposta livre). Só funciona dentro da
// janela de 24h após a última mensagem do contato; fora disso a Meta recusa e só
// vale TEMPLATE. Usado pela caixa "WhatsApp Disparos" pra responder quem respondeu.
export async function enviarTexto(to: string, body: string): Promise<{ ok: boolean; wamid?: string | null; error?: string }> {
  if (!TOKEN || !PHONE_ID) return { ok: false, error: 'Faltam WA_OFICIAL_TOKEN/WA_OFICIAL_PHONE_ID' }
  try {
    const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: foneOficial(to), type: 'text', text: { preview_url: false, body } }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: JSON.stringify((json && json.error) || json) }
    return { ok: true, wamid: json.messages?.[0]?.id || null }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha no envio' }
  }
}

// ---- MÍDIA (Cloud API é diferente do Z-API: recebe media_id, não URL) ----

// Baixa os bytes de uma mídia recebida (a mensagem traz só o media_id).
export async function baixarMidia(mediaId: string): Promise<{ ok: boolean; buffer?: ArrayBuffer; mime?: string; error?: string }> {
  if (!TOKEN) return { ok: false, error: 'sem token' }
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    const mj = await meta.json().catch(() => ({}))
    if (!meta.ok || !mj.url) return { ok: false, error: JSON.stringify((mj && mj.error) || mj) }
    const bin = await fetch(mj.url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (!bin.ok) return { ok: false, error: 'falha ao baixar bytes da mídia' }
    return { ok: true, buffer: await bin.arrayBuffer(), mime: mj.mime_type || 'application/octet-stream' }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha' }
  }
}

// Faz upload de uma mídia (pra poder enviar) e retorna o media_id.
export async function uploadMidia(buffer: Buffer | Uint8Array, mime: string, filename: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!TOKEN || !PHONE_ID) return { ok: false, error: 'sem credenciais' }
  try {
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('type', mime)
    form.append('file', new Blob([buffer], { type: mime }), filename)
    const res = await fetch(`${GRAPH}/${PHONE_ID}/media`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j.id) return { ok: false, error: JSON.stringify((j && j.error) || j) }
    return { ok: true, id: j.id }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha' }
  }
}

// Envia uma mídia já uploaded (por media_id). tipo = image | audio | video | document.
export async function enviarMidia(to: string, tipo: string, mediaId: string, caption?: string, filename?: string): Promise<{ ok: boolean; wamid?: string | null; error?: string }> {
  if (!TOKEN || !PHONE_ID) return { ok: false, error: 'sem credenciais' }
  const midia: any = { id: mediaId }
  if (caption && (tipo === 'image' || tipo === 'video' || tipo === 'document')) midia.caption = caption
  if (filename && tipo === 'document') midia.filename = filename
  try {
    const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: foneOficial(to), type: tipo, [tipo]: midia }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: JSON.stringify((j && j.error) || j) }
    return { ok: true, wamid: j.messages?.[0]?.id || null }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha' }
  }
}

// Envia uma mensagem de TEMPLATE (único jeito de iniciar conversa na API oficial).
// componentes = variáveis do template (ex: [{ type:'body', parameters:[{type:'text', text:'Guto'}] }])
export async function enviarTemplate(
  to: string,
  template: string,
  idioma = 'pt_BR',
  componentes?: any[]
): Promise<{ ok: boolean; wamid?: string | null; error?: string }> {
  if (!TOKEN || !PHONE_ID) return { ok: false, error: 'Faltam WA_OFICIAL_TOKEN/WA_OFICIAL_PHONE_ID' }
  const body: any = {
    messaging_product: 'whatsapp',
    to: foneOficial(to),
    type: 'template',
    template: { name: template, language: { code: idioma } },
  }
  if (componentes && componentes.length) body.template.components = componentes
  try {
    const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: JSON.stringify((json && json.error) || json) }
    return { ok: true, wamid: json.messages?.[0]?.id || null }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha no envio' }
  }
}
