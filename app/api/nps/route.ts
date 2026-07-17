import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// NPS.
//  GET ?turma=<id> -> nome da turma (pro cabeçalho da página pública)
//  GET             -> agregado (geral, por turma, por professor) + comentários
//  POST            -> { turma_id, nota, nota_professor, nota_conteudo, nota_estrutura, comentario }

function agg(rs: any[]) {
  const n = rs.length
  if (!n) return { n: 0, nps: 0, prom: 0, neu: 0, det: 0, mediaProf: 0, mediaConteudo: 0, mediaEstrutura: 0 }
  const prom = rs.filter(r => r.nota >= 9).length
  const det = rs.filter(r => r.nota <= 6).length
  const avg = (k: string) => { const v = rs.filter(r => r[k] != null); return v.length ? +(v.reduce((s, r) => s + r[k], 0) / v.length).toFixed(1) : 0 }
  return { n, nps: Math.round((prom / n - det / n) * 100), prom, neu: n - prom - det, det, mediaProf: avg('nota_professor'), mediaConteudo: avg('nota_conteudo'), mediaEstrutura: avg('nota_estrutura') }
}

export async function GET(req: NextRequest) {
  try {
    const turmaId = req.nextUrl.searchParams.get('turma')
    if (turmaId) {
      // header público da página de NPS: pelo turma_id (UUID). Sem escopo de org aqui
      // porque o aluno preenche sem login — o org sai da própria turma no POST.
      const { data: t } = await supabase.from('turmas').select('codigo, produtos(nome), cidades(nome)').eq('id', turmaId).maybeSingle()
      return NextResponse.json({ ok: true, turma: t ? { codigo: t.codigo, produto: (t as any).produtos?.nome, cidade: (t as any).cidades?.nome } : null })
    }
    // agregado (tela do CRM) — escopado por org
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data: rs } = await supabase.from('nps_respostas').select('turma_id, nota, nota_professor, nota_conteudo, nota_estrutura, comentario, criado_em').eq('org_id', org).order('criado_em', { ascending: false })
    const resp = rs || []
    const { data: turmas } = await supabase.from('turmas').select('id, codigo, produtos(nome)').eq('org_id', org)
    const nomeT = Object.fromEntries((turmas || []).map((t: any) => [t.id, `${t.codigo}`]))
    const { data: tp } = await supabase.from('turma_professores').select('turma_id, professores(nome)').eq('org_id', org)
    const profsDaTurma: Record<string, string[]> = {}
    for (const x of (tp || [])) { const nm = (x as any).professores?.nome; if (nm) (profsDaTurma[x.turma_id] = profsDaTurma[x.turma_id] || []).push(nm) }

    const porTurmaMap: Record<string, any[]> = {}
    const porProfMap: Record<string, any[]> = {}
    for (const r of resp) {
      if (r.turma_id) { (porTurmaMap[r.turma_id] = porTurmaMap[r.turma_id] || []).push(r); for (const p of [...new Set(profsDaTurma[r.turma_id] || [])]) (porProfMap[p] = porProfMap[p] || []).push(r) }
    }
    const porTurma = Object.entries(porTurmaMap).map(([id, rr]) => ({ turma: nomeT[id] || '(turma)', ...agg(rr) })).sort((a, b) => b.n - a.n)
    const porProfessor = Object.entries(porProfMap).map(([nome, rr]) => ({ professor: nome, ...agg(rr) })).sort((a, b) => b.n - a.n)
    const comentarios = resp.filter(r => (r.comentario || '').trim()).slice(0, 60).map(r => ({ turma: r.turma_id ? nomeT[r.turma_id] : '', nota: r.nota, comentario: r.comentario, em: r.criado_em }))
    return NextResponse.json({ ok: true, geral: agg(resp), porTurma, porProfessor, comentarios })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const nota = parseInt(b.nota)
    if (isNaN(nota) || nota < 0 || nota > 10) return NextResponse.json({ ok: false, error: 'nota inválida' }, { status: 200 })
    const num = (v: any) => { const x = parseInt(v); return isNaN(x) ? null : x }
    // aluno preenche sem login: o org sai da própria turma (default CnD se sem turma)
    let org = '00000000-0000-0000-0000-0000000000cd'
    if (b.turma_id) { const { data: t } = await supabase.from('turmas').select('org_id').eq('id', b.turma_id).maybeSingle(); if (t?.org_id) org = t.org_id }
    await supabase.from('nps_respostas').insert({
      org_id: org,
      turma_id: b.turma_id || null, nota,
      nota_professor: num(b.nota_professor), nota_conteudo: num(b.nota_conteudo), nota_estrutura: num(b.nota_estrutura),
      comentario: (b.comentario || '').toString().slice(0, 1000) || null,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
