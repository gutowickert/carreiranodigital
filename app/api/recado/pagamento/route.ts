// Recado Encantado: aviso da empresa de pagamento (Asaas manda o token no cabeçalho asaas-access-token).
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { recadoGateway as gateway } from '@/lib/recado/gateway'

export async function POST(req: NextRequest) {
  const seg = process.env.RECADO_WEBHOOK_SEGREDO
  if (!seg || (req.nextUrl.searchParams.get('s') !== seg && req.headers.get('asaas-access-token') !== seg)) return new NextResponse(null, { status: 401 })
  try {
    const corpo: any = await req.json()
    let a: any = gateway.lerAviso(corpo)
    if (gateway.nome() === 'mercadopago') {
      if (!a.mp_id) return NextResponse.json({ ok: true })
      const pg: any = await (await fetch('https://api.mercadopago.com/v1/payments/' + a.mp_id, { headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN } })).json()
      a = { codigo: pg.external_reference, pago: pg.status === 'approved', forma: pg.payment_type_id, taxa: (pg.fee_details || []).reduce((s: number, f: any) => s + f.amount, 0) }
    }
    // a conta do Asaas é a da escola: aviso de cobrança que não é do Recado passa direto (responde ok pra não travar a fila do Asaas)
    if (!a.codigo && !a.link) return NextResponse.json({ ok: true })
    let [p] = a.codigo ? await db.busca('pedidos', `codigo=eq.${encodeURIComponent(a.codigo)}&select=id,status`) : []
    if (!p && a.link) [p] = await db.busca('pedidos', `gateway_id=eq.${encodeURIComponent(a.link)}&select=id,status`)
    if (!p) return NextResponse.json({ ok: true })
    await db.evento(p.id, 'aviso_pagamento', { pago: a.pago, forma: a.forma })
    if (a.pago && p.status === 'aguardando_pagamento') {
      await db.atualiza('pedidos', `id=eq.${p.id}`, { status: 'pago', pago_em: new Date().toISOString(), forma_pagamento: a.forma || null, taxa_gateway: a.taxa ?? null })
      await db.evento(p.id, 'pago', { forma: a.forma })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('recado/pagamento', e)
    return new NextResponse(null, { status: 500 })
  }
}
