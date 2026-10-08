import { NextResponse } from 'next/server'
import { getFluxo, setFluxo, TITULO_ETAPA } from '@/lib/fluxo'
import { supabaseDoUsuario } from '@/lib/supabase-user'
import { chamadaPermitida } from '@/lib/exigir-login'

// Fluxo comercial (a "gaveta FLUXO" editável). GET = lê; POST = salva as edições da equipe.
export async function GET(req: Request) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
  const f = await getFluxo()
  return NextResponse.json({ ok: true, fluxo: f, titulos: TITULO_ETAPA })
}

export async function POST(req: Request) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
  try {
    const auth = req.headers.get('authorization') || ''
    const { data: { user } } = await supabaseDoUsuario(auth).auth.getUser()
    const email = user?.email || 'equipe'
    const b = await req.json().catch(() => ({}))
    if (!b?.fluxo?.cadencia) return NextResponse.json({ ok: false, error: 'faltou o fluxo' }, { status: 200 })
    await setFluxo(b.fluxo, email)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
