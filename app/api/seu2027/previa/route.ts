// Seu 2027: a prévia grátis da página de venda ("Em 2027 você vive o ano 9"). Só conta, sem IA e sem banco.
import { NextRequest, NextResponse } from 'next/server'
import { previa } from '@/lib/seu2027/calculos'

export async function GET(req: NextRequest) {
  try { return NextResponse.json(previa(String(req.nextUrl.searchParams.get('d') || ''))) }
  catch { return NextResponse.json({ erro: 'data inválida' }, { status: 400 }) }
}
