import { NextRequest, NextResponse } from 'next/server'
import { getSpend } from '@/lib/meta-ads'
import { chamadaPermitida } from '@/lib/exigir-login'

export async function GET(req: NextRequest) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since') || ''
  const until = searchParams.get('until') || ''
  if (!since || !until) {
    return NextResponse.json({ ok: false, total: 0, campaigns: [], error: 'since/until obrigatórios' }, { status: 400 })
  }
  const r = await getSpend(since, until)
  return NextResponse.json(r, { status: 200 })
}