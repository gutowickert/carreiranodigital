// Seu 2027: compra que chegou sem a data de nascimento (comprou direto no link da Kiwify). A página do mapa pede o dado e gera.
import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/seu2027/db'
import { calcular } from '@/lib/seu2027/calculos'
import { liberar, focoOk } from '@/lib/seu2027/entrega'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const b: any = await req.json().catch(() => ({}))
  const c = String(b.c || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  try { calcular(String(b.nascimento || '')) } catch { return NextResponse.json({ erro: 'Confira a data de nascimento.' }, { status: 400 }) }
  const p = /^S27-/.test(c) ? await db.porCodigo(c).catch(() => null) : null
  if (!p || p.status !== 'falta_dados') return NextResponse.json({ erro: 'Este mapa já foi preenchido.' }, { status: 409 })
  const nome = String(b.nome || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || p.nome
  await db.atualiza(`id=eq.${p.id}&status=eq.falta_dados`, { status: 'pago', nascimento: b.nascimento, foco: focoOk(b.foco), nome })
  after(() => liberar(c).then(() => {}))
  return NextResponse.json({ ok: true })
}
