// Recado Encantado: cria o link de pagamento e lê o aviso de "pago". Padrão: Asaas da escola (Pix R$ 0,49).
// Variáveis: ASAAS_API_KEY, RECADO_WEBHOOK_SEGREDO; reservas: INFINITEPAY_HANDLE, MP_ACCESS_TOKEN
import { recadoConfig as cfg } from './config'
const url = (c: string) => cfg.urlSite + c

type Pedido = { codigo: string; preco: number; descricao: string; contato: { responsavel: string; email: string; whatsapp: string } }
type Aviso = { codigo?: string; link?: string; pago?: boolean; forma?: string | null; taxa?: number | null; mp_id?: string }

const adaptadores: Record<string, { cria: (p: Pedido) => Promise<{ gateway_id: string; checkout_url: string }>; lerAviso: (c: any) => Aviso }> = {
  asaas: {
    // link de pagamento (não pede CPF no nosso formulário: a mãe preenche na página do Asaas). Sem aviso por e-mail/SMS em nome da escola.
    // A volta automática pra página do pedido só com o site cadastrado no Asaas (Minha Conta, Informações): ligar com RECADO_ASAAS_VOLTA=1
    async cria(p) {
      const A = { access_token: process.env.ASAAS_API_KEY as string, 'Content-Type': 'application/json' }
      const corpo: any = { name: p.descricao.slice(0, 100), description: 'Recado Encantado · pedido ' + p.codigo, billingType: 'UNDEFINED', chargeType: 'DETACHED', value: p.preco,
        dueDateLimitDays: 1, maxInstallmentCount: 1, notificationEnabled: false, externalReference: p.codigo }
      if (process.env.RECADO_ASAAS_VOLTA === '1') corpo.callback = { successUrl: url(`/obrigado.html?c=${p.codigo}`), autoRedirect: true }
      const l = await (await fetch('https://api.asaas.com/v3/paymentLinks', { method: 'POST', headers: A, body: JSON.stringify(corpo) })).json()
      if (!l.url) throw new Error('Asaas link: ' + JSON.stringify(l).slice(0, 300))
      return { gateway_id: l.id, checkout_url: l.url }
    },
    lerAviso(corpo) { const pg = corpo.payment || {}; return { codigo: pg.externalReference, link: pg.paymentLink, pago: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(corpo.event), forma: pg.billingType, taxa: pg.value && pg.netValue ? pg.value - pg.netValue : null } },
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
