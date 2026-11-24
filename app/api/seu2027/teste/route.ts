// Seu 2027: MODO DE TESTE. Gera um mapa de verdade (contas + IA) sem pagamento e sem banco. Protegido pela chave SEU2027_TESTE_CHAVE
// (cabeçalho x-chave). POST { nome, nascimento: 'AAAA-MM-DD', foco?, formato?: 'json' | 'pdf' }. Custa uns R$ 0,20 de IA por chamada.
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { calcular } from '@/lib/seu2027/calculos'
import { escreverMapa } from '@/lib/seu2027/ia'
import { gerarPdf } from '@/lib/seu2027/pdf'
import { focoOk } from '@/lib/seu2027/entrega'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const chave = process.env.SEU2027_TESTE_CHAVE || '', veio = req.headers.get('x-chave') || ''
  if (!chave || chave.length !== veio.length || !timingSafeEqual(Buffer.from(chave), Buffer.from(veio))) return new NextResponse(null, { status: 401 })
  const b: any = await req.json().catch(() => ({}))
  const nome = String(b.nome || '').trim().slice(0, 80)
  let numeros
  try { numeros = calcular(String(b.nascimento || '')) } catch { return NextResponse.json({ erro: 'data inválida' }, { status: 400 }) }
  if (!nome) return NextResponse.json({ erro: 'falta o nome' }, { status: 400 })
  const foco = focoOk(b.foco)
  const r = await escreverMapa(nome, numeros, foco)
  if (b.formato === 'pdf') return new NextResponse(new Uint8Array(gerarPdf({ nome, foco, numeros, textos: r.textos })), { headers: { 'Content-Type': 'application/pdf' } })
  return NextResponse.json({ nome, foco, numeros, textos: r.textos, modelo: r.modelo, uso: r.uso })
}
