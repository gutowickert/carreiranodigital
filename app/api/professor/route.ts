import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Portal do professor. Resolve o professor pelo EMAIL do login (= professores.email).
//  GET ?email=<email> -> { professor, turmas, nps, comentarios } (só as turmas dele)

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
    const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ ok: false, error: 'falta email' }, { status: 200 })

    const { data: prof } = await supabase.from('professores').select('id, nome').ilike('email', email).maybeSingle()
    if (!prof) return NextResponse.json({ ok: false, error: 'professor não encontrado' }, { status: 200 })

    const { data: tp } = await supabase.from('turma_professores').select('turma_id').eq('professor_id', prof.id)
    const turmaIds = [...new Set((tp || []).map((r: any) => r.turma_id))]
    let turmas: any[] = []
    if (turmaIds.length) {
      const { data } = await supabase.from('turmas')
        .select('id, codigo, data_inicio, data_fim, produtos(nome), cidades(nome)')
        .in('id', turmaIds).order('data_inicio', { ascending: false })
      turmas = (data || []).map((t: any) => ({
        id: t.id, codigo: t.codigo, data_inicio: t.data_inicio, data_fim: t.data_fim,
        produto: t.produtos?.nome || '', cidade: t.cidades?.nome || '',
      }))
    }

    // NPS das turmas dele (anônimo)
    let resp: any[] = []
    if (turmaIds.length) {
      const { data } = await supabase.from('nps_respostas')
        .select('turma_id, nota, nota_professor, nota_conteudo, nota_estrutura, comentario, criado_em')
        .in('turma_id', turmaIds).order('criado_em', { ascending: false })
      resp = data || []
    }
    const nomeT = Object.fromEntries(turmas.map(t => [t.id, t.codigo]))
    const comentarios = resp.filter(r => (r.comentario || '').trim()).slice(0, 40)
      .map(r => ({ turma: r.turma_id ? nomeT[r.turma_id] : '', nota: r.nota, comentario: r.comentario, em: r.criado_em }))

    return NextResponse.json({ ok: true, professor: { id: prof.id, nome: prof.nome }, turmas, nps: agg(resp), comentarios })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
