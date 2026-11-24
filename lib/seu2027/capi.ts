// Seu 2027: a compra vai pra Meta também pelo servidor (API de Conversões), com o MESMO eventID do pixel da página
// (purchase-<código>), pra Meta contar uma vez só. Pixel próprio do produto: SEU2027_PIXEL_ID.
import { createHash } from 'crypto'
import { seu2027 } from './config'

const h = (v?: string | null) => (v && v.trim() ? createHash('sha256').update(v.trim().toLowerCase()).digest('hex') : undefined)

export async function enviaPurchase(p: { codigo: string; valor: number; email?: string; nome?: string; origem?: any }) {
  const pixel = seu2027.pixel(), token = process.env.SEU2027_CAPI_TOKEN || process.env.FB_CAPI_TOKEN || ''
  if (!pixel || !token) return { ok: false, motivo: 'sem pixel ou token' }
  const o = p.origem || {}
  const user_data: any = {}
  if (h(p.email)) user_data.em = [h(p.email)]
  if (h(p.nome?.split(' ')[0])) user_data.fn = [h(p.nome?.split(' ')[0])]
  if (o.fbc) user_data.fbc = o.fbc
  if (o.fbp) user_data.fbp = o.fbp
  if (o.ip) user_data.client_ip_address = o.ip
  if (o.ua) user_data.client_user_agent = o.ua
  user_data.external_id = [h(p.codigo)]
  const body: any = { data: [{ event_name: 'Purchase', event_time: Math.floor(Date.now() / 1000), event_id: 'purchase-' + p.codigo, action_source: 'website',
    event_source_url: seu2027.linkMapa(p.codigo), user_data, custom_data: { currency: 'BRL', value: p.valor, content_ids: ['seu2027'], content_type: 'product' } }] }
  if (process.env.FB_TEST_EVENT_CODE) body.test_event_code = process.env.FB_TEST_EVENT_CODE
  try {
    const r = await fetch(`https://graph.facebook.com/v25.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return r.ok ? { ok: true } : { ok: false, motivo: (await r.text()).slice(0, 200) }
  } catch (e: any) { return { ok: false, motivo: e?.message } }
}
