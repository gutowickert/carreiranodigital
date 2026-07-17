import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Traduz o erro cru da Meta num motivo legível pra equipe.
function motivoLabel(erro?: string | null): string {
  const s = (erro || '').toString()
  if (!s) return 'Outro'
  if (s.includes('131049')) return 'Marketing limitado pela Meta (131049)'
  if (s.includes('131047')) return 'Precisa re-engajar o contato (131047)'
  if (s.includes('131048') || s.includes('130472')) return 'Bloqueio anti-spam da Meta (131048/130472)'
  if (s.includes('131026')) return 'Número inválido / sem WhatsApp (131026)'
  if (s.includes('132') ) return 'Problema no template (132xxx)'
  if (/opt-?out/i.test(s)) return 'Opt-out (pediu pra sair)'
  if (/inv[aá]lid/i.test(s)) return 'Telefone inválido'
  const m = s.match(/\b(1\d{5})\b/)
  if (m) return `Erro Meta ${m[1]}`
  return s.slice(0, 48)
}

// Relatório de disparos.
//  - sem params: lista campanhas com o resumo (enviados/entregues/lidos/falhas/respostas/custo)
//  - ?disparo=<id>: lista quem RESPONDEU aquela campanha
export async function GET(req: NextRequest) {
  const org = await orgDaRequest(req.headers.get('authorization'))
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
        .eq('org_id', org).eq('disparo_id', naoEntregues).eq('status', 'enviado').is('respondeu_em', null)
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

  // Telefones que JÁ RECEBERAM (entregue/lido) numa campanha — pra descontar de um
  // novo disparo pela lista (reenvio inteligente sem mandar 2x pra quem já recebeu).
  const recebidos = req.nextUrl.searchParams.get('recebidos')
  if (recebidos) {
    const telefones: string[] = []
    let from = 0
    for (;;) {
      const { data, error } = await supabase.from('wa_disparo_envios')
        .select('telefone')
        .eq('org_id', org).eq('disparo_id', recebidos).in('status', ['entregue', 'lido'])
        .range(from, from + 999)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
      for (const r of data || []) { if (r.telefone) telefones.push(r.telefone) }
      if (!data || data.length < 1000) break
      from += 1000
    }
    return NextResponse.json({ ok: true, telefones })
  }

  // Contexto do disparo de um CONTATO: qual campanha foi enviada pra esse número
  // (pra mostrar na caixa de Disparos qual cidade/campanha o lead respondeu).
  const contato = req.nextUrl.searchParams.get('contato')
  if (contato) {
    const suf = contato.replace(/\D/g, '').slice(-8)
    const { data: env } = await supabase.from('wa_disparo_envios')
      .select('disparo_id, enviado_em').eq('org_id', org).ilike('telefone', `%${suf}`).not('disparo_id', 'is', null)
      .order('enviado_em', { ascending: false }).limit(1).maybeSingle()
    if (!env) return NextResponse.json({ ok: true, disparo: null })
    const { data: d } = await supabase.from('wa_disparos')
      .select('nome, template_nome').eq('org_id', org).eq('id', env.disparo_id).maybeSingle()
    return NextResponse.json({ ok: true, disparo: d ? { nome: d.nome, template: d.template_nome, enviado_em: env.enviado_em } : null })
  }

  if (disparoId) {
    const { data, error } = await supabase.from('wa_disparo_envios')
      .select('telefone, nome, lead_id, respondeu_em')
      .eq('org_id', org).eq('disparo_id', disparoId).not('respondeu_em', 'is', null)
      .order('respondeu_em', { ascending: false }).limit(1000)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true, respostas: data || [] })
  }

  const { data: campanhas, error } = await supabase.from('wa_disparos')
    .select('id, nome, template_nome, categoria, status, total, criado_em')
    .eq('org_id', org).order('criado_em', { ascending: false }).limit(100)
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

  // Motivos de FALHA (agrega o erro das linhas que a Meta recusou no envio).
  // Os "não entregues" travados em status 'enviado' não têm erro — são calculados
  // na página como (enviados - entregues) e mostrados como limbo à parte.
  const motivos: Record<string, number> = {}
  let mf = 0
  for (;;) {
    const { data } = await supabase.from('wa_disparo_envios')
      .select('erro').eq('org_id', org).eq('status', 'falha').not('erro', 'is', null).range(mf, mf + 999)
    if (!data || !data.length) break
    for (const r of data) { const k = motivoLabel(r.erro); motivos[k] = (motivos[k] || 0) + 1 }
    if (data.length < 1000) break
    mf += 1000
  }
  const motivosArr = Object.entries(motivos).map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n)

  return NextResponse.json({ ok: true, campanhas: linhas, motivos: motivosArr })
}
