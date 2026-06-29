import { NextResponse } from 'next/server'
import { ultimaAnalise, gerarESalvarAnalise } from '@/lib/analise-conversao'

export const maxDuration = 300

export async function GET() {
  const analise = await ultimaAnalise()
  return NextResponse.json({ ok: true, analise })
}

export async function POST() {
  const r = await gerarESalvarAnalise()
  return NextResponse.json(r)
}
