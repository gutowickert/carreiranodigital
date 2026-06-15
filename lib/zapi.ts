const INSTANCE = process.env.ZAPI_INSTANCE_ID || ''
const TOKEN = process.env.ZAPI_TOKEN || ''
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || ''

const BASE = () => `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}`

async function post(path: string, body: any) {
  if (!INSTANCE || !TOKEN || !CLIENT_TOKEN) {
    return { ok: false, error: 'Faltam ZAPI_INSTANCE_ID/ZAPI_TOKEN/ZAPI_CLIENT_TOKEN' }
  }
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: JSON.stringify(json) }
    return { ok: true, id: json.messageId || json.zaapId || null }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha no envio' }
  }
}

// Normaliza telefone pra formato Z-API: só dígitos, com DDI 55
export function foneZapi(raw: string): string {
  const s = (raw || '').toString()
  if (s.includes('@')) return s // @lid / @g.us — envia como veio (Z-API aceita)
  let d = s.replace(/\D/g, '')
  if (d.length >= 10 && d.length <= 11) d = '55' + d
  return d
}

export async function enviarTexto(phone: string, message: string) {
  return post('/send-text', { phone: foneZapi(phone), message })
}

// audio: data URI base64 (ex: data:audio/ogg;base64,xxxx) ou URL publica
export async function enviarAudio(phone: string, audio: string) {
  return post('/send-audio', { phone: foneZapi(phone), audio })
}
// imagem: data URI base64 ou URL. caption opcional
export async function enviarImagem(phone: string, image: string, caption?: string) {
  return post('/send-image', { phone: foneZapi(phone), image, caption: caption || '' })
}

// documento: precisa da extensao no path. data URI base64 ou URL
export async function enviarDocumento(phone: string, document: string, fileName: string, extension: string) {
  return post(`/send-document/${extension}`, { phone: foneZapi(phone), document, fileName })
}

async function get(path: string) {
  if (!INSTANCE || !TOKEN || !CLIENT_TOKEN) return { ok: false, error: 'Faltam credenciais Z-API', data: null }
  try {
    const res = await fetch(`${BASE()}${path}`, { headers: { 'Client-Token': CLIENT_TOKEN } })
    const json = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: JSON.stringify(json), data: null }
    return { ok: true, data: json }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha', data: null }
  }
}

// Lista os chats da instância (traz o nº de não-lidas reais do WhatsApp)
export async function listarChats(page = 1, pageSize = 100) {
  return get(`/chats?page=${page}&pageSize=${pageSize}`)
}

// Marca um chat como lido no WhatsApp (some o não-lida no celular)
export async function marcarChatLido(phone: string) {
  return post('/chats/read', { phone, action: 'read' })
}