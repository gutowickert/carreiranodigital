import { NextResponse } from 'next/server'
import { ultimaAnalise, gerarESalvarAnalise } from '@/lib/analise-conversao'
import { chamadaPermitida } from '@/lib/exigir-login'

export const maxDuration = 300

export async function GET(req: Request) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
  const analise = await ultimaAnalise()
  return NextResponse.json({ ok: true, analise })
}

export async function POST(req: Request) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
  const r = await gerarESalvarAnalise()
  return NextResponse.json(r)
}
