// Recado Encantado: o guia do herói pra família é ENTREGÁVEL (Guto 10/10), não fica aberto no site.
// GET ?c=CÓDIGO -> a página do guia do produto, só se o pedido existe e já foi pago.
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { GUIAS } from '@/lib/recado/guias'

const GUIA_DO_PACOTE: Record<string, string> = { chupeta: 'chupeta', dormir: 'dormir', coragem: 'coragem', recado: 'fada', encanto: 'noel', magico: 'noel' }
const SEM_ACESSO = ['aguardando_pagamento', 'cancelado', 'reembolsado']

export async function GET(req: NextRequest) {
  const c = String(req.nextUrl.searchParams.get('c') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!c) return NextResponse.json({ erro: 'sem código' }, { status: 400 })
  const [p] = await db.busca('pedidos', `codigo=eq.${c}&select=status,pacote`)
  const html = p && !SEM_ACESSO.includes(p.status) && GUIAS[GUIA_DO_PACOTE[p.pacote]]
  if (!html) return NextResponse.json({ erro: 'guia disponível só pra pedido pago' }, { status: 404 })
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
}
