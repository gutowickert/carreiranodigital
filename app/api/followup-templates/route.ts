import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Templates de follow-up (oficial) mapeados à cadência do CRM. Editáveis pela equipe antes de submeter ao Meta.
export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data } = await sb.from('followup_templates').select('*').eq('org_id', org).eq('ativo', true).order('ordem')
    return NextResponse.json({ ok: true, templates: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    const id = (b.id || '').toString()
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })
    const patch: any = { atualizado_em: new Date().toISOString() }
    for (const k of ['corpo', 'nome_meta', 'categoria', 'status', 'variaveis'] as const) {
      if (typeof b[k] === 'string') patch[k] = b[k]
    }
    await sb.from('followup_templates').update(patch).eq('org_id', org).eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
