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
  let d = (raw || '').replace(/\D/g, '')
  // tira DDI 55 se veio junto, pra normalizar
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  // remove o nono digito de celular (DDD + 9 + 8 digitos = 11) -> Z-API usa sem o 9 em alguns casos
  // mantém com 9 pro ENVIO (Z-API envia com 9), só re-adiciona DDI
  if (d.length === 10 || d.length === 11) d = '55' + d
  return d
}

export async function enviarTexto(phone: string, message: string) {
  return post('/send-text', { phone: foneZapi(phone), message })
}

// audio: data URI base64 (ex: data:audio/ogg;base64,xxxx) ou URL publica
export async function enviarAudio(phone: string, audio: string) {
  return post('/send-audio', { phone: foneZapi(phone), audio })
}