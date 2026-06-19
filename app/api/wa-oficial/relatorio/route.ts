import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Relatório de disparos.
//  - sem params: lista campanhas com o resumo (enviados/entregues/lidos/falhas/respostas/custo)
//  - ?disparo=<id>: lista quem RESPONDEU aquela campanha
export async function GET(req: NextRequest) {
  const disparoId = req.nextUrl.searchParams.get('disparo')
  const naoEntregues = req.nextUrl.searchParams.get('naoEntregues')

  // Lista os NÃO-ENTREGUES de uma campanha (travados em 'enviado' que não responderam),
  // pra montar um redisparo. Pagina (PostgREST corta em ~1000).
  if (naoEntregues) {
    const vistos = new Set<string>()
    const contatos: { telefone: string; nome: string }[] = []
    let from = 0
    for (;;) {
      const { data, error } = await supabase.from('wa_disparo_envios')
        .select('telefone, nome')
        .eq('disparo_id', naoEntregues).eq('status', 'enviado').is('respondeu_em', null)
        .range(from, from + 999)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
      for (const r of data || []) {
        if (!r.telefone || vistos.has(r.telefone)) continue
        vistos.add(r.telefone)
        contatos.push({ telefone: r.telefone, nome: r.nome || '' })
      }
      if (!data || data.length < 1000) break
      from += 1000
    }
    return NextResponse.json({ ok: true, contatos })
  }

  if (disparoId) {
    const { data, error } = await supabase.from('wa_disparo_envios')
      .select('telefone, nome, lead_id, respondeu_em')
      .eq('disparo_id', disparoId).not('respondeu_em', 'is', null)
      .order('respondeu_em', { ascending: false }).limit(1000)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true, respostas: data || [] })
  }

  const { data: campanhas, error } = await supabase.from('wa_disparos')
    .select('id, nome, template_nome, categoria, status, total, criado_em')
    .order('criado_em', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

  const ids = (campanhas || []).map(c => c.id)
  const { data: resumos } = ids.length
    ? await supabase.from('wa_disparo_resumo').select('*').in('disparo_id', ids)
    : { data: [] as any[] }
  const mapa = new Map((resumos || []).map((r: any) => [r.disparo_id, r]))

  const linhas = (campanhas || []).map(c => {
    const r: any = mapa.get(c.id) || {}
    return {
      id: c.id, nome: c.nome, template: c.template_nome, categoria: c.categoria,
      status: c.status, criado_em: c.criado_em,
      contatos: r.contatos ?? c.total ?? 0,
      enviados: r.enviados_ok ?? 0,
      entregues: r.entregues ?? 0,
      lidos: r.lidos ?? 0,
      falhas: r.falhas ?? 0,
      respostas: r.respostas ?? 0,
      custo: Number(r.custo ?? 0),
    }
  })
  return NextResponse.json({ ok: true, campanhas: linhas })
}
