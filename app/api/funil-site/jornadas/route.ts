import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Jornada por pessoa: junta os eventos do site (site_eventos) de cada visitor_id
// com o clique no /wa (wa_clicks) e o lead resultante. É a "foto da pessoa
// inteira": entrou -> páginas/eventos -> clicou -> virou lead.
// ?de=YYYY-MM-DD&ate=YYYY-MM-DD (&q= filtro por texto opcional)

function addDays(s: string, d: number) { const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0] }

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

const paginaDe = (u?: string | null) => {
  if (!u) return '(sem url)'
  try { const x = new URL(u); return (x.host + x.pathname).replace(/\/$/, '') || x.host } catch { return u.slice(0, 80) }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const de = (sp.get('de') || '').slice(0, 10)
    const ate = (sp.get('ate') || '').slice(0, 10)
    const q = (sp.get('q') || '').toLowerCase().trim()
    if (!de || !ate) return NextResponse.json({ ok: false, error: 'informe de e ate (YYYY-MM-DD)' }, { status: 400 })
    const deISO = de + 'T00:00:00-03:00'   // fuso de Brasília (UTC-3)
    const ateISO = addDays(ate, 1) + 'T00:00:00-03:00'

    const eventos = await carregar('site_eventos', 'visitor_id, evento, codigo_turma, utm_campaign, utm_content, url, criado_em', deISO, ateISO)
    const clicks = await carregar('wa_clicks', 'visitor_id, ref, codigo_turma, utm_campaign, utm_content, lead_id, consumido_em, criado_em', deISO, ateISO)

    // agrupa eventos por visitor_id
    type J = { visitor_id: string; inicio: string; fim: string; turma: string | null; campanha: string | null; criativo: string | null; paginas: Set<string>; eventos: { evento: string; em: string }[]; nEventos: number; engajou: boolean; clicou: boolean }
    const map = new Map<string, J>()
    const get = (id: string): J => {
      let j = map.get(id)
      if (!j) { j = { visitor_id: id, inicio: '', fim: '', turma: null, campanha: null, criativo: null, paginas: new Set(), eventos: [], nEventos: 0, engajou: false, clicou: false }; map.set(id, j) }
      return j
    }
    const ENG = new Set(['scroll_50', 'scroll_90', 'video_50', 'viu_oferta', 'viu_preco'])
    for (const e of eventos) {
      const id = (e.visitor_id || '').toString(); if (!id) continue
      const j = get(id)
      const em = e.criado_em || ''
      if (!j.inicio || em < j.inicio) j.inicio = em
      if (!j.fim || em > j.fim) j.fim = em
      if (!j.turma && e.codigo_turma) j.turma = e.codigo_turma
      if (!j.campanha && e.utm_campaign) j.campanha = e.utm_campaign
      if (!j.criativo && e.utm_content) j.criativo = e.utm_content
      j.paginas.add(paginaDe(e.url))
      j.nEventos++
      if (j.eventos.length < 60) j.eventos.push({ evento: e.evento, em })
      if (ENG.has(e.evento)) j.engajou = true
      if (e.evento === 'cta_click') j.clicou = true
    }

    // liga o clique no /wa (por visitor_id) e o lead
    const clickByVid = new Map<string, any>()
    for (const c of clicks) { const id = (c.visitor_id || '').toString(); if (id && !clickByVid.has(id)) clickByVid.set(id, c) }

    const leadIds = [...new Set(clicks.map(c => c.lead_id).filter(Boolean))]
    const leadsById = new Map<string, any>()
    if (leadIds.length) {
      // busca leads em lotes (in) — nomes/etapas pra mostrar na jornada
      for (let i = 0; i < leadIds.length; i += 300) {
        const lote = leadIds.slice(i, i + 300)
        const { data } = await supabase.from('leads').select('id, nome, whatsapp, etapa, codigo_turma').in('id', lote)
        for (const l of (data || [])) leadsById.set(l.id, l)
      }
    }

    let jornadas = [...map.values()].map(j => {
      const clk = clickByVid.get(j.visitor_id)
      const lead = clk && clk.lead_id ? leadsById.get(clk.lead_id) : null
      return {
        visitor_id: j.visitor_id,
        inicio: j.inicio, fim: j.fim,
        turma: j.turma || clk?.codigo_turma || null,
        campanha: j.campanha || clk?.utm_campaign || null,
        criativo: j.criativo || clk?.utm_content || null,
        paginas: [...j.paginas],
        nEventos: j.nEventos,
        engajou: j.engajou,
        clicou: j.clicou || !!clk,
        ref: clk?.ref || null,
        virouLead: !!lead,
        lead: lead ? { id: lead.id, nome: lead.nome, whatsapp: lead.whatsapp, etapa: lead.etapa } : null,
        eventos: j.eventos,
      }
    })

    if (q) jornadas = jornadas.filter(j =>
      j.visitor_id.toLowerCase().includes(q) || (j.turma || '').toLowerCase().includes(q) ||
      (j.campanha || '').toLowerCase().includes(q) || (j.lead?.nome || '').toLowerCase().includes(q) ||
      j.paginas.some(p => p.toLowerCase().includes(q)))

    // mais recentes primeiro; quem virou lead sobe
    jornadas.sort((a, b) => (Number(b.virouLead) - Number(a.virouLead)) || (a.fim < b.fim ? 1 : -1))

    return NextResponse.json({ ok: true, de, ate, total: jornadas.length, jornadas: jornadas.slice(0, 300) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
