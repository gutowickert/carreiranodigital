import { NextRequest, NextResponse } from 'next/server'
import { getConfigIA, setConfigIA } from '@/lib/ia-config'

// Config da automação (só Guto/Nando/Rick).
const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com', 'tizonmidia@gmail.com']
const ok = (e: string) => PERMITIDOS.includes((e || '').toLowerCase())

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase()
  if (!ok(email)) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
  return NextResponse.json({ ok: true, config: await getConfigIA() })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const email = (b.email || '').toLowerCase()
  if (!ok(email)) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
  const patch: any = {}
  for (const k of ['ativa', 'modo', 'hora_ini', 'hora_fim', 'fallback_horas']) if (b[k] !== undefined) patch[k] = b[k]
  const config = await setConfigIA(patch, email)
  return NextResponse.json({ ok: true, config })
}
