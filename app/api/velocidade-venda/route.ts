import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Velocidade de venda: tempo entre o lead entrar (criado_em) e comprar (data_ganho).
//  GET ?desde=<ISO>&ate=<ISO> -> geral, distribuição e quebra por origem/vendedor/produto

function stats(a: number[]) {
  const arr = [...a].sort((x, y) => x - y); const n = arr.length
  if (!n) return { n: 0, media: 0, mediana: 0, p25: 0, p75: 0, p90: 0, min: 0, max: 0 }
  const med = n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2
  const avg = arr.reduce((s, x) => s + x, 0) / n
  const p = (q: number) => arr[Math.min(n - 1, Math.floor(q * n))]
  return { n, media: +avg.toFixed(1), mediana: +med.toFixed(1), p25: +p(.25).toFixed(1), p75: +p(.75).toFixed(1), p90: +p(.90).toFixed(1), min: +arr[0].toFixed(2), max: Math.round(arr[n - 1]) }
}

function distribuicao(a: number[]) {
  const defs: [string, (x: number) => boolean][] = [
    ['Mesmo dia', x => x < 1], ['1–3 dias', x => x >= 1 && x < 4], ['4–7 dias', x => x >= 4 && x < 8],
    ['8–14 dias', x => x >= 8 && x < 15], ['15–30 dias', x => x >= 15 && x < 31], ['30+ dias', x => x >= 31],
  ]
  const n = a.length || 1
  return defs.map(([label, f]) => { const c = a.filter(f).length; return { label, n: c, pct: Math.round(c / n * 100) } })
}

function grupo(rows: any[], key: string) {
  const m: Record<string, number[]> = {}
  for (const r of rows) (m[r[key]] = m[r[key]] || []).push(r.dias)
  return Object.entries(m).map(([label, ds]) => ({ label, ...stats(ds) })).sort((a, b) => b.n - a.n)
}

export async function GET(req: NextRequest) {
  try {
    const desde = req.nextUrl.searchParams.get('desde')
    const ate = req.nextUrl.searchParams.get('ate')
    let q = supabase.from('leads')
      .select('criado_em, data_ganho, origem, vendedor_id, turma_id, codigo_turma, valor_venda, motivo_ganho')
      .eq('etapa', 'ganho').not('data_ganho', 'is', null).not('criado_em', 'is', null)
    if (desde) q = q.gte('data_ganho', desde)
    if (ate) q = q.lte('data_ganho', ate)
    const { data } = await q
    const leads = data || []

    // resolve nomes de turma->produto e vendedor
    const turmaIds = [...new Set(leads.map(l => l.turma_id).filter(Boolean))]
    const prodDe: Record<string, string> = {}
    if (turmaIds.length) {
      const { data: turmas } = await supabase.from('turmas').select('id, codigo, produtos(nome)').in('id', turmaIds)
      for (const t of (turmas || [])) prodDe[t.id] = (t as any).produtos?.nome || t.codigo || ''
    }
    const vendIds = [...new Set(leads.map(l => l.vendedor_id).filter(Boolean))]
    const nomeVend: Record<string, string> = {}
    if (vendIds.length) {
      const { data: us } = await supabase.from('usuarios_perfil').select('id, nome').in('id', vendIds)
      for (const u of (us || [])) nomeVend[u.id] = u.nome || ''
    }

    const rows = leads.map(l => ({
      dias: (+new Date(l.data_ganho) - +new Date(l.criado_em)) / 864e5,
      origem: l.origem || '(sem origem)',
      vendedor: (l.vendedor_id && nomeVend[l.vendedor_id]) || '(sem vendedor)',
      produto: (l.turma_id && prodDe[l.turma_id]) || l.codigo_turma || '(sem turma)',
      hs: /herospark/i.test(l.motivo_ganho || ''),
    })).filter(r => r.dias >= 0)

    const dias = rows.map(r => r.dias)
    return NextResponse.json({
      ok: true,
      geral: stats(dias),
      via_herospark: rows.filter(r => r.hs).length,
      distribuicao: distribuicao(dias),
      porOrigem: grupo(rows, 'origem'),
      porVendedor: grupo(rows, 'vendedor'),
      porProduto: grupo(rows, 'produto'),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
