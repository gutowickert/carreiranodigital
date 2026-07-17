import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// O PostgREST (Supabase) limita ~1000 linhas por request. Paginamos por range
// pra não truncar nem a lista nem as contagens do resumo.
const PAGINA = 1000

// Lista contatos frios com filtros + resumo (por cidade/categoria).
export async function GET(req: NextRequest) {
  const org = await orgDaRequest(req.headers.get('authorization'))
  const sp = req.nextUrl.searchParams
  const cidade = sp.get('cidade') || ''
  const categoria = sp.get('categoria') || ''
  const status = sp.get('status') || ''
  const q = (sp.get('q') || '').trim()
  const limit = Math.min(parseInt(sp.get('limit') || '300', 10) || 300, 20000)

  const baseFiltrada = () => {
    let query = supabase.from('wa_contatos').select('*').eq('org_id', org).order('criado_em', { ascending: false })
    if (cidade) query = query.eq('cidade', cidade)
    if (categoria) query = query.eq('categoria', categoria)
    if (status) query = query.eq('status', status)
    if (q) query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`)
    return query
  }

  // contatos paginados até o limite pedido (driblando o teto de 1000 do PostgREST)
  const contatos: any[] = []
  for (let from = 0; from < limit; from += PAGINA) {
    const to = Math.min(from + PAGINA, limit) - 1
    const { data, error } = await baseFiltrada().range(from, to)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    contatos.push(...(data || []))
    if (!data || data.length < to - from + 1) break
  }

  // resumo: totais via COUNT exato (não trunca) + quebra por cidade paginando só 2 colunas
  const [tot, totInt, totComp] = await Promise.all([
    supabase.from('wa_contatos').select('*', { count: 'exact', head: true }).eq('org_id', org),
    supabase.from('wa_contatos').select('*', { count: 'exact', head: true }).eq('org_id', org).eq('categoria', 'interessado'),
    supabase.from('wa_contatos').select('*', { count: 'exact', head: true }).eq('org_id', org).eq('categoria', 'comprador'),
  ])
  const porCidade: Record<string, { interessado: number; comprador: number; total: number }> = {}
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabase.from('wa_contatos').select('cidade,categoria').eq('org_id', org).range(from, from + PAGINA - 1)
    if (error || !data) break
    for (const r of data) {
      const cid = r.cidade || '(sem cidade)'
      if (!porCidade[cid]) porCidade[cid] = { interessado: 0, comprador: 0, total: 0 }
      if (r.categoria === 'comprador') porCidade[cid].comprador++
      else porCidade[cid].interessado++
      porCidade[cid].total++
    }
    if (data.length < PAGINA) break
  }
  const cidades = Object.entries(porCidade)
    .map(([cidade, v]) => ({ cidade, ...v }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    ok: true,
    contatos,
    resumo: {
      total: tot.count || 0,
      interessados: totInt.count || 0,
      compradores: totComp.count || 0,
      cidades,
    },
  })
}
