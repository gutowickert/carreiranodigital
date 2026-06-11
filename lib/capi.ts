import { createHash } from 'crypto'

const PIXEL_ID = process.env.FB_PIXEL_ID || ''
const TOKEN = process.env.FB_CAPI_TOKEN || ''
const TEST_CODE = process.env.FB_TEST_EVENT_CODE || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

function sha256(v?: string | null): string | undefined {
  if (!v) return undefined
  const s = v.toString().trim().toLowerCase()
  if (!s) return undefined
  return createHash('sha256').update(s).digest('hex')
}

// Telefone: só dígitos, garante DDI 55 (Brasil), depois hash
function hashPhone(raw?: string | null): string | undefined {
  if (!raw) return undefined
  let d = raw.replace(/\D/g, '')
  if (!d) return undefined
  if (!d.startsWith('55')) d = '55' + d
  return createHash('sha256').update(d).digest('hex')
}

type CapiOpts = {
  eventName: string
  eventId: string
  eventSourceUrl?: string | null
  actionSource?: string
  email?: string | null
  phone?: string | null
  firstName?: string | null
  fbc?: string | null
  fbp?: string | null
  clientIp?: string | null
  userAgent?: string | null
  externalId?: string | null
  customData?: Record<string, any>
}

export async function sendCapiEvent(opts: CapiOpts): Promise<{ ok: boolean; error?: string }> {
  if (!PIXEL_ID || !TOKEN) {
    return { ok: false, error: 'CAPI nao configurado (faltam FB_PIXEL_ID/FB_CAPI_TOKEN)' }
  }

  const user_data: Record<string, any> = {}
  const ph = hashPhone(opts.phone)
  if (ph) user_data.ph = [ph]
  const em = sha256(opts.email)
  if (em) user_data.em = [em]
  const fn = sha256(opts.firstName ? opts.firstName.split(' ')[0] : null)
  if (fn) user_data.fn = [fn]
  if (opts.fbc) user_data.fbc = opts.fbc
  if (opts.fbp) user_data.fbp = opts.fbp
  if (opts.clientIp) user_data.client_ip_address = opts.clientIp
  if (opts.userAgent) user_data.client_user_agent = opts.userAgent
  const ext = sha256(opts.externalId)
  if (ext) user_data.external_id = [ext]

  const event: Record<string, any> = {
    event_name: opts.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId,
    action_source: opts.actionSource || 'website',
    user_data,
  }
  if (opts.eventSourceUrl) event.event_source_url = opts.eventSourceUrl
  if (opts.customData) event.custom_data = opts.customData

  const body: Record<string, any> = { data: [event] }
  if (TEST_CODE) body.test_event_code = TEST_CODE

  try {
    const res = await fetch(`${GRAPH}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: JSON.stringify((json && json.error) || json) }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'fetch falhou' }
  }
}

export async function sendLead(opts: {
  eventId: string
  eventSourceUrl?: string | null
  email?: string | null
  phone?: string | null
  firstName?: string | null
  fbc?: string | null
  fbp?: string | null
  clientIp?: string | null
  userAgent?: string | null
  externalId?: string | null
  codigoTurma?: string | null
}) {
  return sendCapiEvent({
    eventName: 'Lead',
    eventId: opts.eventId,
    eventSourceUrl: opts.eventSourceUrl,
    email: opts.email,
    phone: opts.phone,
    firstName: opts.firstName,
    fbc: opts.fbc,
    fbp: opts.fbp,
    clientIp: opts.clientIp,
    userAgent: opts.userAgent,
    externalId: opts.externalId,
    customData: opts.codigoTurma
      ? { content_ids: [opts.codigoTurma], content_type: 'product' }
      : undefined,
  })
}

export async function sendPurchase(opts: {
  eventId: string
  value: number
  currency?: string
  email?: string | null
  phone?: string | null
  firstName?: string | null
  fbc?: string | null
  fbp?: string | null
  clientIp?: string | null
  userAgent?: string | null
  externalId?: string | null
  codigoTurma?: string | null
  eventSourceUrl?: string | null
}) {
  return sendCapiEvent({
    eventName: 'Purchase',
    eventId: opts.eventId,
    eventSourceUrl: opts.eventSourceUrl,
    actionSource: 'website',
    email: opts.email,
    phone: opts.phone,
    firstName: opts.firstName,
    fbc: opts.fbc,
    fbp: opts.fbp,
    clientIp: opts.clientIp,
    userAgent: opts.userAgent,
    externalId: opts.externalId,
    customData: {
      currency: opts.currency || 'BRL',
      value: opts.value,
      ...(opts.codigoTurma ? { content_ids: [opts.codigoTurma], content_type: 'product' } : {}),
    },
  })
}