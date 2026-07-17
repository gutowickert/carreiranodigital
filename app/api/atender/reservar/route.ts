import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { supabaseDoUsuario } from '@/lib/supabase-user'

// Reserva ATÔMICA de follow-ups pro atendente atual (2+ pessoas sem colisão).
// Chama a função reservar_followups (FOR UPDATE SKIP LOCKED): 2 chamadas simultâneas nunca pegam o mesmo lead.
export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization') || ''
    const org = await orgDaRequest(auth)
    const { data: { user } } = await supabaseDoUsuario(auth).auth.getUser()
    const userId = user?.id
    if (!userId) return NextResponse.json({ ok: false, error: 'sem usuário' }, { status: 200 })
    const b = await req.json().catch(() => ({}))
    const limit = Math.min(Math.max(parseInt(b.limit) || 10, 1), 50)
    const { data, error } = await sb.rpc('reservar_followups', { p_org: org, p_user: userId, p_limit: limit })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    const leadIds = (data || []).map((r: any) => r.lead_id)
    return NextResponse.json({ ok: true, leadIds })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
