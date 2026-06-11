import { NextRequest, NextResponse } from 'next/server'
import { getSpend } from '@/lib/meta-ads'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since') || ''
  const until = searchParams.get('until') || ''
  if (!since || !until) {
    return NextResponse.json({ ok: false, total: 0, campaigns: [], error: 'since/until obrigatórios' }, { status: 400 })
  }
  const r = await getSpend(since, until)
  return NextResponse.json(r, { status: 200 })
}