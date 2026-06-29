import { NextRequest, NextResponse } from 'next/server'
import { gerarESalvarAnalise } from '@/lib/analise-conversao'

export const maxDuration = 300

// Disparada pelo agendador da Vercel (cron) todo dia. Aceita só o cron da Vercel
// (user-agent vercel-cron) ou, se CRON_SECRET estiver setado, o Bearer correto.
export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const auth = req.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET
  const ok = ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`)
  if (!ok) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

  const r = await gerarESalvarAnalise()
  return NextResponse.json(r)
}
