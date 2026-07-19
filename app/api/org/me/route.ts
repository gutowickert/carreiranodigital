import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Marca/config da organização do usuário logado — pro Layout vestir a cara do cliente.
export async function GET(req: Request) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data } = await sb.from('organizacoes').select('id, nome, cor, logo_url, config, ativo').eq('id', org).maybeSingle()
    return NextResponse.json({ ok: true, org: data || null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
