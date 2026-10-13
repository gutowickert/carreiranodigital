// Oito Posts: o webhook da Hotmart (13/10), pras marcas em espanhol. Cadastrar na Hotmart com a versão 2.0.0.
//   PURCHASE_APPROVED                       → cliente ativo, pago até +1 mês, lote do mês na fila (uma vez por transação)
//   PURCHASE_DELAYED / SUBSCRIPTION overdue → atrasado
//   SUBSCRIPTION_CANCELLATION, PURCHASE_REFUNDED, PURCHASE_CHARGEBACK, PURCHASE_CANCELED → cancelado
// Os outros eventos só ficam registrados. Sempre responde 200 pra Hotmart não repetir à toa (menos hottok errado).
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { hottokOk, marcaDoProduto } from '@/lib/oito/hotmart'
import { garanteLoteDoCiclo, avisaDono } from '@/lib/oito/servico'

export const maxDuration = 60
const maisUmMes = (d: Date) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + 1); return x.toISOString().slice(0, 10) }

export async function POST(req: Request) {
  const b: any = await req.json().catch(() => ({}))
  if (!hottokOk(req.headers.get('x-hotmart-hottok') || b.hottok)) return NextResponse.json({ erro: 'hottok' }, { status: 401 })
  const ev = String(b.event || ''), d = b.data || {}
  const compra = d.purchase || {}, comprador = d.buyer || {}, assin = d.subscription || {}
  const sck = String(compra.origin?.sck || '').toUpperCase()
  const assinante = String(assin.subscriber?.code || d.subscriber?.code || '')
  const tx = String(compra.transaction || '')
  const email = String(comprador.email || d.subscriber?.email || d.user?.email || '').toLowerCase()

  // encontra o cliente: pelo código (sck), pelo assinante já gravado, ou pelo e-mail numa marca da Hotmart
  let c = sck ? await db.um('clientes', { codigo: sck }) : null
  if (!c && assinante) c = await db.um('clientes', { hotmart_assinatura: assinante })
  if (!c && email) {
    const m = marcaDoProduto(d.product?.name || '')
    c = (await db.lista('clientes', { email }, { ordem: 'criado_em', desc: true })).find(x => x.gateway === 'hotmart' && (!m || x.marca === m)) || null
  }
  await db.evento('hotmart', { cliente_id: c?.id || null, marca: c?.marca || null, detalhe: { ev, tx, sck, assinante, status: compra.status || assin.status || null, valor: compra.price?.value ?? null, moeda: compra.price?.currency_value ?? null } })
  if (!c) {
    if (/PURCHASE_APPROVED/.test(ev)) avisaDono('Hotmart: compra sem cliente', `${email || 'sem e-mail'} · ${d.product?.name || ''} · ${tx}`, true)
    return NextResponse.json({ ok: true, cliente: null })
  }
  const campos: any = { gateway: 'hotmart' }
  if (assinante && assinante !== c.hotmart_assinatura) campos.hotmart_assinatura = assinante
  if (email && !c.email) campos.email = email

  if (ev === 'PURCHASE_APPROVED') {
    // a mesma transação pode chegar mais de uma vez: só a primeira conta
    const chave = 'hotmart_tx_' + (tx || Date.now())
    if (await db.um('estado', { chave })) return NextResponse.json({ ok: true, repetido: true })
    await db.insere('estado', { chave, valor: { em: new Date().toISOString(), codigo: c.codigo } })
    const prox = compra.date_next_charge ? new Date(+compra.date_next_charge || compra.date_next_charge).toISOString().slice(0, 10) : null
    const base = c.pago_ate && c.pago_ate > new Date().toISOString().slice(0, 10) ? new Date(c.pago_ate + 'T12:00:00Z') : new Date()
    const pagoAte = prox && prox > new Date().toISOString().slice(0, 10) ? prox : maisUmMes(base)
    Object.assign(campos, { status: 'ativo', pago_ate: pagoAte })
    await db.atualiza('clientes', { id: c.id }, campos)
    await garanteLoteDoCiclo({ ...c, ...campos }, pagoAte)
  } else if (/PURCHASE_DELAYED|PURCHASE_EXPIRED|SUBSCRIPTION_OVERDUE/.test(ev)) {
    if (c.status === 'ativo') campos.status = 'atrasado'
    await db.atualiza('clientes', { id: c.id }, campos)
  } else if (/SUBSCRIPTION_CANCELLATION|PURCHASE_REFUNDED|PURCHASE_CHARGEBACK|PURCHASE_CANCELED/.test(ev)) {
    campos.status = 'cancelado'
    await db.atualiza('clientes', { id: c.id }, campos)
    if (c.status !== 'cancelado') {
      await db.evento('cancelou', { cliente_id: c.id, marca: c.marca, detalhe: { por: 'hotmart', ev } })
      if (!c.exemplo) avisaDono(/REFUND|CHARGEBACK/.test(ev) ? 'reembolso Hotmart' : 'cancelamento', `${cfg.marcas[c.marca as Marca].nome} · ${c.nome_negocio} (${c.cidade})`, /REFUND|CHARGEBACK/.test(ev))
    }
  } else if (Object.keys(campos).length > 1) await db.atualiza('clientes', { id: c.id }, campos)
  return NextResponse.json({ ok: true })
}
