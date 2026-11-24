// Seu 2027: o PDF do mapa, montado na hora a partir do que está guardado no pedido.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/seu2027/db'
import { gerarPdf } from '@/lib/seu2027/pdf'

export async function GET(req: NextRequest) {
  const c = String(req.nextUrl.searchParams.get('c') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  const p = /^S27-/.test(c) ? await db.porCodigo(c).catch(() => null) : null
  if (!p || p.status !== 'pronto') return NextResponse.json({ erro: 'mapa não encontrado' }, { status: 404 })
  const pdf = gerarPdf({ nome: p.nome, foco: p.foco, numeros: p.numeros, textos: p.textos })
  const arq = `seu2027-${p.nome.split(' ')[0].normalize('NFD').replace(/[^\w]/g, '')}.pdf`
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${arq}"`, 'Cache-Control': 'private, no-store' } })
}
