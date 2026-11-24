// Seu 2027: pagamento pela KIWIFY (decisão de 24/11: não usa o Asaas da escola).
//
// Como o pedido se liga à compra (o jeito mais firme):
// 1. Na nossa página a pessoa preenche nome, nascimento, e-mail e o foco ANTES de pagar. Criamos o pedido (status aguardando_pagamento)
//    com um código S27-XXXX e mandamos pro checkout da Kiwify com ?sck=S27-XXXX (a Kiwify devolve o sck no aviso de compra, em
//    TrackingParameters), mais name/email pra já vir preenchido, e as UTMs do anúncio.
// 2. A Kiwify avisa a compra aprovada em /api/seu2027/kiwify. Achamos o pedido pelo sck; se não vier, pelo e-mail (o pedido mais
//    recente aguardando). Se nem assim achar (compra feita direto no link da Kiwify), criamos um pedido "falta_dados" e mandamos
//    e-mail com o link pra completar o nascimento: a página do mapa pede o dado e gera na hora.
//
// Variáveis: KIWIFY_CHECKOUT_URL (link do checkout do produto R$ 37) e KIWIFY_WEBHOOK_TOKEN (o token que a Kiwify mostra ao criar
// o webhook). Nunca no código.
import { createHmac, timingSafeEqual } from 'crypto'

export const KIWIFY_CHECKOUT_PADRAO = 'https://pay.kiwify.com.br/TROCAR-PELO-LINK-DO-PRODUTO'
export const checkoutUrl = () => process.env.KIWIFY_CHECKOUT_URL || KIWIFY_CHECKOUT_PADRAO

// monta o link do checkout com o código do pedido e os dados pra pré-preencher
export function linkCheckout(p: { codigo: string; nome: string; email: string; origem?: any }) {
  const u = new URL(checkoutUrl())
  if (p.codigo) u.searchParams.set('sck', p.codigo)
  if (p.nome) u.searchParams.set('name', p.nome)
  if (p.email) u.searchParams.set('email', p.email)
  const o = p.origem || {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src']) if (o[k]) u.searchParams.set(k, String(o[k]).slice(0, 200))
  return u.toString()
}

// A Kiwify assina cada aviso: ?signature=<HMAC-SHA1 do corpo, com o token do webhook>. Sem token configurado, recusa tudo.
export function assinaturaOk(corpoBruto: string, assinatura: string | null) {
  const token = process.env.KIWIFY_WEBHOOK_TOKEN
  if (!token || !assinatura) return false
  const esperado = createHmac('sha1', token).update(corpoBruto).digest('hex')
  const a = Buffer.from(esperado), b = Buffer.from(String(assinatura).toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b)
}

// o que interessa do aviso da Kiwify
export function lerAviso(c: any) {
  const cust = c?.Customer || {}, tp = c?.TrackingParameters || {}, com = c?.Commissions || {}
  const status = String(c?.order_status || '').toLowerCase()
  const evento = String(c?.webhook_event_type || '').toLowerCase()
  const centavos = (v: any) => (v == null || v === '' ? null : +(+v / 100).toFixed(2))
  return {
    pedidoKiwify: String(c?.order_id || c?.order_ref || ''),
    pago: status === 'paid' || evento === 'order_approved',
    estorno: ['refunded', 'chargedback'].includes(status) || ['order_refunded', 'chargeback'].includes(evento),
    sck: String(tp.sck || '').toUpperCase().replace(/[^A-Z0-9-]/g, ''),
    email: String(cust.email || '').trim().toLowerCase(),
    nome: String(cust.full_name || cust.first_name || '').trim(),
    forma: c?.payment_method || null,
    valor: centavos(com.charge_amount) ?? centavos(c?.Product?.price),
    liquido: centavos(com.my_commission),
    produto: String(c?.Product?.product_name || ''),
    utm: { utm_source: tp.utm_source, utm_medium: tp.utm_medium, utm_campaign: tp.utm_campaign, utm_content: tp.utm_content, utm_term: tp.utm_term, src: tp.src },
  }
}
