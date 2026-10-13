// Oito Posts: a cobrança das marcas em espanhol pela Hotmart (13/10). Assinatura mensal de US$ 39, um produto por marca.
// O checkout é o link do produto na Hotmart (OITO_HOTMART_LINK_DIVINO / _SABROSO / _PELUDO); o código do cliente vai no ?sck=
// e volta no webhook (data.purchase.origin.sck), que é como a compra encontra o cliente.
// Webhook: /api/oito/hotmart, conferido pelo hottok (OITO_HOTMART_HOTTOK).
// Cancelar pela API precisa das credenciais (OITO_HOTMART_CLIENT_ID, _SECRET, _BASIC); sem elas, o dono é avisado pra cancelar na mão.
import { oitoConfig as cfg, Marca } from './config'

export function linkCheckout(m: Marca, c: { codigo: string; email?: string; responsavel?: string; nome_negocio?: string; whatsapp?: string }) {
  const base = process.env['OITO_HOTMART_LINK_' + m.toUpperCase()]
  if (!base) return null
  const u = new URL(base.trim())
  u.searchParams.set('sck', c.codigo)
  if (c.email) u.searchParams.set('email', c.email)
  const nome = c.responsavel || c.nome_negocio
  if (nome) u.searchParams.set('name', nome)
  if (c.whatsapp) u.searchParams.set('phonenumber', c.whatsapp)
  u.searchParams.set('checkoutMode', '10')
  return u.toString()
}

export const hottokOk = (h: string | null) => !!h && !!process.env.OITO_HOTMART_HOTTOK && h.trim() === process.env.OITO_HOTMART_HOTTOK.trim().replace(/^"|"$/g, '')

async function token() {
  const id = process.env.OITO_HOTMART_CLIENT_ID, sec = process.env.OITO_HOTMART_CLIENT_SECRET, basic = process.env.OITO_HOTMART_BASIC
  if (!id || !sec || !basic) return null
  const r = await fetch(`https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(sec)}`,
    { method: 'POST', headers: { Authorization: 'Basic ' + basic.replace(/^Basic\s+/i, '') }, signal: AbortSignal.timeout(15000) })
  const j = await r.json().catch(() => ({}))
  return r.ok ? (j.access_token as string) : null
}

export async function cancelaHotmart(assinante: string) {
  const t = await token()
  if (!t) return { ok: false, motivo: 'sem credenciais' }
  const r = await fetch(`https://developers.hotmart.com/payments/api/v1/subscriptions/${encodeURIComponent(assinante)}/cancel`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ send_mail: true }), signal: AbortSignal.timeout(15000) })
  return { ok: r.ok, motivo: r.ok ? '' : 'hotmart ' + r.status }
}

// a marca pela qual a compra entrou (o nome do produto na Hotmart tem o nome da marca), pra quando o sck não vier
export function marcaDoProduto(nome: string): Marca | null {
  const n = String(nome || '').toLowerCase()
  for (const m of ['divino', 'sabroso', 'peludo'] as Marca[]) if (n.includes(cfg.marcas[m].nome.toLowerCase()) || n.includes(m)) return m
  return null
}
