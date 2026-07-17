import { NextResponse } from 'next/server'
import { getFluxo, setFluxo, TITULO_ETAPA } from '@/lib/fluxo'
import { supabaseDoUsuario } from '@/lib/supabase-user'

// Fluxo comercial (a "gaveta FLUXO" editável). GET = lê; POST = salva as edições da equipe.
export async function GET() {
  const f = await getFluxo()
  return NextResponse.json({ ok: true, fluxo: f, titulos: TITULO_ETAPA })
}

export async function POST(req: Request) {
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
