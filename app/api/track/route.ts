import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Recebe eventos dos sites (HTML) e grava em site_eventos.
// CORS liberado porque os sites são de outros domínios.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors })
}

const s = (v: any, max = 500) => (v == null ? null : v.toString().slice(0, max) || null)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const eventos = Array.isArray(body?.eventos) ? body.eventos : [body]
    const ua = req.headers.get('user-agent') || null
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const rows = (eventos || [])
      .filter((e: any) => e && e.evento)
      .slice(0, 50)
      .map((e: any) => ({
        visitor_id: s(e.visitor_id, 100),
        sessao_id: s(e.sessao_id, 100),
        evento: s(e.evento, 60),
        url: s(e.url, 800),
        referrer: s(e.referrer, 800),
        utm_source: s(e.utm_source, 200),
        utm_medium: s(e.utm_medium, 200),
        utm_campaign: s(e.utm_campaign, 200),
        utm_content: s(e.utm_content, 200),
        fbclid: s(e.fbclid, 300),
        codigo_turma: s(e.codigo_turma, 100),
        ref: s(e.ref, 100),
        meta: e.meta && typeof e.meta === 'object' ? e.meta : null,
        user_agent: ua,
        client_ip: ip,
      }))
    if (rows.length) {
      const { error } = await supabase.from('site_eventos').insert(rows)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200, headers: cors })
    }
    return NextResponse.json({ ok: true, n: rows.length }, { headers: cors })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200, headers: cors })
  }
}
