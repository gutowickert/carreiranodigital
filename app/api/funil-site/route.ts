import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Agrega o Funil do Site a partir de site_eventos (comportamento no site) e
// wa_clicks (clique no /wa -> lead). Tudo server-side pra não expor evento cru
// e não depender de RLS. Recebe ?de=YYYY-MM-DD&ate=YYYY-MM-DD.

const ENGAJOU = new Set(['scroll_50', 'scroll_90', 'video_50', 'viu_oferta', 'viu_preco'])

function addDays(s: string, d: number) { const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0] }

// Carrega todas as linhas do período paginando de 1000 em 1000 (cap de segurança).
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

// Conta visitantes distintos por etapa dentro de um grupo (turma/campanha/página).
function contaGrupo() {
  return { visitantes: new Set<string>(), engajaram: new Set<string>(), viuCta: new Set<string>(), clicouCta: new Set<string>() }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const de = (sp.get('de') || '').slice(0, 10)
    const ate = (sp.get('ate') || '').slice(0, 10)
    if (!de || !ate) return NextResponse.json({ ok: false, error: 'informe de e ate (YYYY-MM-DD)' }, { status: 400 })
    const deISO = de + 'T00:00:00-03:00'   // fuso de Brasília (UTC-3)
    const ateISO = addDays(ate, 1) + 'T00:00:00-03:00'

    const eventos = await carregar('site_eventos', 'visitor_id, evento, codigo_turma, utm_campaign, url, criado_em', deISO, ateISO)
    const clicks = await carregar('wa_clicks', 'visitor_id, codigo_turma, utm_campaign, lead_id, criado_em', deISO, ateISO)

    const vid = (e: any) => (e.visitor_id || '').toString() || null

    // ---- funil global (visitantes distintos por etapa) ----
    const G = contaGrupo()
    // ---- quebras por turma, campanha e página ----
    const porTurmaMap = new Map<string, ReturnType<typeof contaGrupo>>()
    const porCampMap = new Map<string, ReturnType<typeof contaGrupo>>()
    const porPagMap = new Map<string, ReturnType<typeof contaGrupo>>()
    const grupo = (m: Map<string, any>, k: string) => { let g = m.get(k); if (!g) { g = contaGrupo(); m.set(k, g) } return g }

    const paginaDe = (u?: string | null) => {
      if (!u) return '(sem url)'
      try { const x = new URL(u); return (x.host + x.pathname).replace(/\/$/, '') || x.host } catch { return u.slice(0, 80) }
    }

    // Turma do clique por visitante: fallback pra atribuir turma aos eventos do
    // site enquanto o snippet não manda codigo_turma (páginas com turma no path).
    const turmaPorVid = new Map<string, string>()
    for (const c of clicks) { const id = (c.visitor_id || '').toString(); if (id && c.codigo_turma && !turmaPorVid.has(id)) turmaPorVid.set(id, c.codigo_turma.toString()) }

    for (const e of eventos) {
      const id = vid(e); if (!id) continue
      const turma = (e.codigo_turma || turmaPorVid.get(id) || '(sem turma)').toString()
      const camp = (e.utm_campaign || '(sem campanha)').toString()
      const pag = paginaDe(e.url)
      const alvos = [G, grupo(porTurmaMap, turma), grupo(porCampMap, camp), grupo(porPagMap, pag)]
      for (const g of alvos) {
        g.visitantes.add(id)
        if (e.evento === 'cta_view') g.viuCta.add(id)
        else if (e.evento === 'cta_click') g.clicouCta.add(id)
        else if (ENGAJOU.has(e.evento)) g.engajaram.add(id)
      }
    }

    // ---- ponte site -> whatsapp -> lead (via wa_clicks) ----
    // Por pessoa (quando o vid já viaja no /wa) e no agregado (sempre).
    const waVisitors = new Set<string>()   // visitantes (vid) que têm clique no /wa
    const leadVisitors = new Set<string>() // visitantes (vid) cujo clique virou lead
    let cliquesWa = 0, leadsWa = 0          // totais de TODAS as origens (contexto, fora do funil)
    for (const c of clicks) {
      const id = (c.visitor_id || '').toString() || null
      const temLead = !!c.lead_id
      cliquesWa++; if (temLead) leadsWa++
      if (id) { waVisitors.add(id); if (temLead) leadVisitors.add(id) }
    }

    const funil = {
      visitantes: G.visitantes.size,
      engajaram: G.engajaram.size,
      viuCta: G.viuCta.size,
      clicouCta: G.clicouCta.size,
      cliquesWa,
      cliquesWaVisitors: waVisitors.size,
      leads: leadsWa,
      leadsVisitors: leadVisitors.size,
    }

    // ---- tendência diária (visitantes distintos, cliques /wa e leads por dia) ----
    const dias = new Map<string, { visit: Set<string>; cliquesWa: number; leads: number }>()
    const dia = (m: Map<string, any>, k: string) => { let g = m.get(k); if (!g) { g = { visit: new Set(), cliquesWa: 0, leads: 0 }; m.set(k, g) } return g }
    const diaBR = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : ''
    for (const e of eventos) { const id = vid(e); if (!id) continue; const k = diaBR(e.criado_em); if (k) dia(dias, k).visit.add(id) }
    for (const c of clicks) { const k = diaBR(c.criado_em); if (!k) continue; const g = dia(dias, k); g.cliquesWa++; if (c.lead_id) g.leads++ }
    const tendencia = [...dias.entries()].map(([d0, g]) => ({ dia: d0, visitantes: g.visit.size, cliquesWa: g.cliquesWa, leads: g.leads })).sort((a, b) => a.dia < b.dia ? -1 : 1)

    // Casa por pessoa: "foram pro WA" e "leads" de um grupo = visitantes DAQUELE
    // grupo que também têm clique/lead (mesma população do site). Nada de somar
    // cliques de outras origens — é isso que evitava o "3974% do topo".
    const inter = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n }
    const linha = (k: string, g: ReturnType<typeof contaGrupo>) => ({
      chave: k, visitantes: g.visitantes.size, engajaram: g.engajaram.size, viuCta: g.viuCta.size, clicouCta: g.clicouCta.size,
      cliquesWa: inter(g.visitantes, waVisitors), leads: inter(g.visitantes, leadVisitors),
    })

    const porTurma = [...porTurmaMap.entries()].map(([k, g]) => linha(k, g)).sort((a, b) => b.visitantes - a.visitantes || b.cliquesWa - a.cliquesWa)
    const porCampanha = [...porCampMap.entries()].map(([k, g]) => linha(k, g)).sort((a, b) => b.visitantes - a.visitantes || b.cliquesWa - a.cliquesWa)
    const porPagina = [...porPagMap.entries()].map(([k, g]) => ({ chave: k, visitantes: g.visitantes.size, engajaram: g.engajaram.size, viuCta: g.viuCta.size, clicouCta: g.clicouCta.size })).sort((a, b) => b.visitantes - a.visitantes)

    return NextResponse.json({ ok: true, de, ate, funil, tendencia, porTurma, porCampanha, porPagina })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
