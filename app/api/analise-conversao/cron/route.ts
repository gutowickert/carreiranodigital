import { NextRequest, NextResponse } from 'next/server'
import { gerarESalvarAnalise } from '@/lib/analise-conversao'
import { cronOk } from '@/lib/cron-auth'

export const maxDuration = 300

// Disparada pelo agendador da Vercel (cron) todo dia. Aceita só o cron da Vercel
// (Authorization: Bearer CRON_SECRET; desde 07/11 o user-agent vercel-cron NÃO vale mais, ver lib/cron-auth.ts).
export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const auth = req.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET
  const ok = cronOk(req)
  if (!ok) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

  const r = await gerarESalvarAnalise()
  return NextResponse.json(r)
}
