// Recado Encantado: cria o link de pagamento e lê o aviso de "pago". Padrão: Asaas da escola (Pix R$ 0,49).
// Variáveis: ASAAS_API_KEY, RECADO_WEBHOOK_SEGREDO; reservas: INFINITEPAY_HANDLE, MP_ACCESS_TOKEN
import { recadoConfig as cfg } from './config'
const url = (c: string) => cfg.urlSite + c

type Pedido = { codigo: string; preco: number; descricao: string; contato: { responsavel: string; email: string; whatsapp: string } }
type Aviso = { codigo?: string; pago?: boolean; forma?: string | null; taxa?: number | null; mp_id?: string }

const adaptadores: Record<string, { cria: (p: Pedido) => Promise<{ gateway_id: string; checkout_url: string }>; lerAviso: (c: any) => Aviso }> = {
  asaas: {
    async cria(p) {
      const A = { access_token: process.env.ASAAS_API_KEY as string, 'Content-Type': 'application/json' }, base = 'https://api.asaas.com/v3'
      const cli = await (await fetch(base + '/customers', { method: 'POST', headers: A, body: JSON.stringify({ name: p.contato.responsavel, email: p.contato.email, mobilePhone: p.contato.whatsapp }) })).json()
      if (!cli.id) throw new Error('Asaas cliente: ' + JSON.stringify(cli).slice(0, 300))
      const venc = new Date(Date.now() + 86400e3).toISOString().slice(0, 10)
      const c = await (await fetch(base + '/payments', { method: 'POST', headers: A, body: JSON.stringify({ customer: cli.id, billingType: 'UNDEFINED', value: p.preco, dueDate: venc, description: p.descricao, externalReference: p.codigo, callback: { successUrl: url(`/obrigado.html?c=${p.codigo}`), autoRedirect: true } }) })).json()
      if (!c.invoiceUrl) throw new Error('Asaas cobrança: ' + JSON.stringify(c).slice(0, 300))
      return { gateway_id: c.id, checkout_url: c.invoiceUrl }
    },
    lerAviso(corpo) { const pg = corpo.payment || {}; return { codigo: pg.externalReference, pago: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(corpo.event), forma: pg.billingType, taxa: pg.value && pg.netValue ? pg.value - pg.netValue : null } },
  },
  infinitepay: {
    async cria(p) {
      const r = await fetch('https://api.infinitepay.io/invoices/public/checkout/links', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: process.env.INFINITEPAY_HANDLE, order_nsu: p.codigo, redirect_url: url(`/obrigado.html?c=${p.codigo}`), webhook_url: url(`/api/recado/pagamento?s=${process.env.RECADO_WEBHOOK_SEGREDO}`),
          customer: { name: p.contato.responsavel, email: p.contato.email, phone_number: '+' + p.contato.whatsapp }, items: [{ quantity: 1, price: Math.round(p.preco * 100), description: p.descricao }] }) })
      const j = await r.json(); if (!r.ok || !j.url) throw new Error('InfinitePay: ' + JSON.stringify(j).slice(0, 300))
      return { gateway_id: j.slug || p.codigo, checkout_url: j.url }
    },
    lerAviso(corpo) { return { codigo: corpo.order_nsu, pago: !!(corpo.paid_amount || corpo.transaction_nsu), forma: corpo.capture_method, taxa: corpo.paid_amount && corpo.amount ? (corpo.amount - corpo.paid_amount) / 100 : null } },
  },
  mercadopago: {
    async cria(p) {
      const r = await fetch('https://api.mercadopago.com/checkout/preferences', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ title: p.descricao, quantity: 1, unit_price: p.preco, currency_id: 'BRL' }], external_reference: p.codigo, payer: { email: p.contato.email },
          back_urls: { success: url(`/obrigado.html?c=${p.codigo}`) }, auto_return: 'approved', notification_url: url(`/api/recado/pagamento?s=${process.env.RECADO_WEBHOOK_SEGREDO}`) }) })
      const j = await r.json(); if (!j.init_point) throw new Error('Mercado Pago: ' + JSON.stringify(j).slice(0, 300))
      return { gateway_id: j.id, checkout_url: j.init_point }
    },
    lerAviso(corpo) { return { mp_id: corpo.data && corpo.data.id } },
  },
}
export const recadoGateway = { cria: (p: Pedido) => adaptadores[cfg.gateway].cria(p), lerAviso: (c: any) => adaptadores[cfg.gateway].lerAviso(c), nome: () => cfg.gateway }
