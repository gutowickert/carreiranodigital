import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Funil por anúncio (do site ao lead), agrupado por campanha + anúncio (utm).
// O gasto/impressões/cliques do Meta a página junta por cima (mesmo casamento
// do Tráfego: utm_content = nome do anúncio). ?de=&ate= (fuso de Brasília).

function addDays(s: string, d: number) { const [y, m, dd] = s.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, dd)); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
function norm(s?: string | null) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }

async function carregar(tabela: string, cols: string, deISO: string, ateISO: string, cap = 100000) {
  const rows: any[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await supabase.from(tabela).select(cols)
      .gte('criado_em', deISO).lt('criado_em', ateISO)
      .order('criado_em', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

const ENG = new Set(['scroll_50', 'scroll_90', 'video_50', 'viu_oferta', 'viu_preco'])

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const de = (sp.get('de') || '').slice(0, 10)
    const ate = (sp.get('ate') || '').slice(0, 10)
    if (!de || !ate) return NextResponse.json({ ok: false, error: 'informe de e ate' }, { status: 400 })
    const deISO = de + 'T00:00:00-03:00'
    const ateISO = addDays(ate, 1) + 'T00:00:00-03:00'

    const eventos = await carregar('site_eventos', 'visitor_id, evento, utm_campaign, utm_content, criado_em', deISO, ateISO)
    const clicks = await carregar('wa_clicks', 'utm_campaign, utm_content, lead_id, criado_em', deISO, ateISO)
    const leads = await carregar('leads', 'utm_campaign, utm_content, etapa, valor_venda, criado_em', deISO, ateISO)

    type Row = { key: string; campaign: string; ad: string; visitou: Set<string>; engajou: Set<string>; clicou: Set<string>; whats: number; leads: number; vendas: number; receita: number }
    const map = new Map<string, Row>()
    const get = (camp: string | null, ad: string | null): Row => {
      const key = norm(camp) + '||' + norm(ad)
      let r = map.get(key)
      if (!r) { r = { key, campaign: camp || '(sem campanha)', ad: ad || '(sem anúncio)', visitou: new Set(), engajou: new Set(), clicou: new Set(), whats: 0, leads: 0, vendas: 0, receita: 0 }; map.set(key, r) }
      return r
    }

    for (const e of eventos) {
      if (!e.utm_content) continue // sem anúncio não entra no funil por criativo
      const id = (e.visitor_id || '').toString(); if (!id) continue
      const r = get(e.utm_campaign, e.utm_content)
      r.visitou.add(id)
      if (ENG.has(e.evento)) r.engajou.add(id)
      else if (e.evento === 'cta_click') r.clicou.add(id)
    }
    for (const c of clicks) { if (!c.utm_content) continue; get(c.utm_campaign, c.utm_content).whats++ }
    for (const l of leads) {
      if (!l.utm_content) continue
      const r = get(l.utm_campaign, l.utm_content)
      r.leads++
      if (l.etapa === 'ganho') { r.vendas++; r.receita += (l.valor_venda || 0) }
    }

    const ads = [...map.values()].map(r => ({
      key: r.key, campaign: r.campaign, ad: r.ad,
      visitou: r.visitou.size, engajou: r.engajou.size, clicou: r.clicou.size,
      whats: r.whats, leads: r.leads, vendas: r.vendas, receita: r.receita,
    })).sort((a, b) => b.leads - a.leads || b.visitou - a.visitou)

    return NextResponse.json({ ok: true, de, ate, ads })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
