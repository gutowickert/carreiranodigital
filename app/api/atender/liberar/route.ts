import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { supabaseDoUsuario } from '@/lib/supabase-user'

// Libera as reservas NÃO finalizadas do atendente (voltam pro pool pra outra pessoa trabalhar).
// Chamado ao sair da tela de follow-up. Opcional: body.leadIds pra liberar só alguns.
export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization') || ''
    const org = await orgDaRequest(auth)
    const { data: { user } } = await supabaseDoUsuario(auth).auth.getUser()
    const userId = user?.id
    if (!userId) return NextResponse.json({ ok: true })
    const b = await req.json().catch(() => ({}))
    let q = sb.from('tarefas_lead').update({ reservada_por: null, reservada_em: null })
      .eq('org_id', org).eq('reservada_por', userId).eq('concluida', false).eq('cancelada', false)
    if (Array.isArray(b.leadIds) && b.leadIds.length) q = q.in('lead_id', b.leadIds)
    await q
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
