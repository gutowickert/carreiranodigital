import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { chamadaPermitida } from '@/lib/exigir-login'

// Diagnóstico: mostra os últimos envios de disparo com status e erro real.
export async function GET(req: Request) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
  const org = await orgDaRequest(req.headers.get('authorization'))
  const { data } = await supabase.from('wa_disparo_envios')
    .select('telefone, status, erro, wamid, enviado_em, atualizado_em')
    .eq('org_id', org)
    .order('atualizado_em', { ascending: false })
    .limit(20)
  return NextResponse.json({ ok: true, envios: data || [] })
}
