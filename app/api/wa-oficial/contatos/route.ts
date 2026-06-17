import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Lista contatos frios com filtros + resumo (por cidade/categoria).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const cidade = sp.get('cidade') || ''
  const categoria = sp.get('categoria') || ''
  const status = sp.get('status') || ''
  const q = (sp.get('q') || '').trim()
  const limit = Math.min(parseInt(sp.get('limit') || '300', 10) || 300, 1000)

  let query = supabase.from('wa_contatos').select('*').order('criado_em', { ascending: false }).limit(limit)
  if (cidade) query = query.eq('cidade', cidade)
  if (categoria) query = query.eq('categoria', categoria)
  if (status) query = query.eq('status', status)
  if (q) query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`)
  const { data: contatos, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

  // resumo: traz só cidade/categoria de tudo e agrega no servidor
  const { data: leves } = await supabase.from('wa_contatos').select('cidade,categoria').limit(50000)
  const porCidade: Record<string, { interessado: number; comprador: number; total: number }> = {}
  let totInteressado = 0, totComprador = 0
  for (const r of (leves || [])) {
    const cid = r.cidade || '(sem cidade)'
    if (!porCidade[cid]) porCidade[cid] = { interessado: 0, comprador: 0, total: 0 }
    if (r.categoria === 'comprador') { porCidade[cid].comprador++; totComprador++ }
    else { porCidade[cid].interessado++; totInteressado++ }
    porCidade[cid].total++
  }
  const cidades = Object.entries(porCidade)
    .map(([cidade, v]) => ({ cidade, ...v }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    ok: true,
    contatos: contatos || [],
    resumo: { total: (leves || []).length, interessados: totInteressado, compradores: totComprador, cidades },
  })
}
