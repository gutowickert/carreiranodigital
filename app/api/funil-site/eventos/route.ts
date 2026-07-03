import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Explorador de eventos captados: lista bruta de site_eventos com filtros.
// ?de=&ate=&evento=&turma=&vid=&q=&limit=  — pra investigar caso a caso.

function addDays(s: string, d: number) { const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0] }

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const de = (sp.get('de') || '').slice(0, 10)
    const ate = (sp.get('ate') || '').slice(0, 10)
    if (!de || !ate) return NextResponse.json({ ok: false, error: 'informe de e ate (YYYY-MM-DD)' }, { status: 400 })
    const evento = (sp.get('evento') || '').trim()
    const turma = (sp.get('turma') || '').trim()
    const vidf = (sp.get('vid') || '').trim()
    const q = (sp.get('q') || '').trim()
    const limit = Math.min(1000, Math.max(10, parseInt(sp.get('limit') || '200', 10) || 200))
    const deISO = de + 'T00:00:00-03:00'   // fuso de Brasília (UTC-3)
    const ateISO = addDays(ate, 1) + 'T00:00:00-03:00'

    let query = supabase.from('site_eventos')
      .select('visitor_id, sessao_id, evento, url, referrer, utm_source, utm_campaign, utm_content, codigo_turma, meta, criado_em', { count: 'exact' })
      .gte('criado_em', deISO).lt('criado_em', ateISO)
    if (evento) query = query.eq('evento', evento)
    if (turma) query = query.eq('codigo_turma', turma)
    if (vidf) query = query.eq('visitor_id', vidf)
    if (q) query = query.ilike('url', `%${q}%`)

    const { data, error, count } = await query.order('criado_em', { ascending: false }).limit(limit)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

    // opções pros filtros (tipos de evento e turmas do período)
    const tipos = [...new Set((data || []).map(r => r.evento))].sort()
    return NextResponse.json({ ok: true, de, ate, total: count ?? (data || []).length, mostrando: (data || []).length, tipos, eventos: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
