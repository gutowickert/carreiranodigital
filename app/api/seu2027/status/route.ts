// Seu 2027: a página do mapa pergunta como está o pedido (a cada poucos segundos enquanto espera). Quando pronto, devolve o mapa.
import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/seu2027/db'
import { liberar } from '@/lib/seu2027/entrega'

export const maxDuration = 120
const sem = { headers: { 'Cache-Control': 'no-store' } }

export async function GET(req: NextRequest) {
  const c = String(req.nextUrl.searchParams.get('c') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!/^S27-/.test(c)) return NextResponse.json({ erro: 'código inválido' }, { status: 400 })
  const p = await db.porCodigo(c).catch(() => null)
  if (!p) return NextResponse.json({ erro: 'pedido não encontrado' }, { status: 404 })
  const out: any = { status: p.status, nome: p.nome }
  if (p.status === 'pronto') Object.assign(out, { foco: p.foco, numeros: p.numeros, textos: p.textos, valor: +(p.valor_pago || p.preco) })
  // pago e ainda sem mapa (ou a geração anterior falhou/travou): tenta gerar, sem segurar a resposta
  const travado = p.status === 'gerando' && p.gerando_desde && Date.now() - Date.parse(p.gerando_desde) > 3 * 60e3
  const errouHaPouco = p.status === 'erro' && Date.now() - Date.parse(p.atualizado_em) < 60e3
  if (p.status === 'pago' || travado || (p.status === 'erro' && !errouHaPouco)) after(() => liberar(c).then(() => {}))
  return NextResponse.json(out, sem)
}
