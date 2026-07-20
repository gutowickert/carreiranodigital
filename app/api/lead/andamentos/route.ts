import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { supabaseDoUsuario } from '@/lib/supabase-user'

// Andamentos de um lead — pra abrir o "card" dentro do Atender sem sair da fila.
export async function GET(req: Request) {
  const org = await orgDaRequest(req.headers.get('authorization'))
  const leadId = new URL(req.url).searchParams.get('leadId')
  if (!leadId) return NextResponse.json({ ok: false, error: 'falta leadId' }, { status: 200 })
  const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, criado_em').eq('org_id', org).eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })
  const { data: ands } = await sb.from('lead_andamentos').select('tipo, observacao, etapa_anterior, etapa_nova, criado_em').eq('org_id', org).eq('lead_id', leadId).order('criado_em', { ascending: false }).limit(30)
  return NextResponse.json({ ok: true, lead, andamentos: ands || [] })
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization') || ''
    const org = await orgDaRequest(auth)
    const { data: { user } } = await supabaseDoUsuario(auth).auth.getUser()
    const b = await req.json().catch(() => ({}))
    const leadId = (b.leadId || '').toString()
    const observacao = (b.observacao || '').toString().trim()
    if (!leadId || !observacao) return NextResponse.json({ ok: false, error: 'faltam dados' }, { status: 200 })
    const { data: lead } = await sb.from('leads').select('id').eq('org_id', org).eq('id', leadId).maybeSingle()
    if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })
    await sb.from('lead_andamentos').insert({ org_id: org, lead_id: leadId, vendedor_id: user?.id || null, tipo: (b.tipo || 'observacao').toString().slice(0, 30), observacao: observacao.slice(0, 2000) })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
