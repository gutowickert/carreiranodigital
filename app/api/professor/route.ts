import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Portal do professor. Resolve o professor pelo EMAIL do login (= professores.email).
//  GET ?email=<email>            -> { professor, turmas, nps, comentarios } (só as turmas dele)
//  GET ?email=<email>&turma=<id> -> { dias, alunos, presencas } da chamada — SÓ os dias do módulo dele

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
    const turmaParam = req.nextUrl.searchParams.get('turma')
    if (!email) return NextResponse.json({ ok: false, error: 'falta email' }, { status: 200 })
    const org = await orgDaRequest(req.headers.get('authorization'))

    const { data: prof } = await supabase.from('professores').select('id, nome').eq('org_id', org).ilike('email', email).maybeSingle()
    if (!prof) return NextResponse.json({ ok: false, error: 'professor não encontrado' }, { status: 200 })

    // turmas do professor + módulo(s) que ele dá em cada uma (null = turma toda, ex.: ANL)
    const { data: tp } = await supabase.from('turma_professores').select('turma_id, modulo_id').eq('professor_id', prof.id)
    const turmaIds = [...new Set((tp || []).map((r: any) => r.turma_id))]
    const modsPorTurma: Record<string, string[]> = {}
    for (const r of (tp || [])) if (r.modulo_id) (modsPorTurma[r.turma_id] = modsPorTurma[r.turma_id] || []).push(r.modulo_id)
    // só entra no filtro por módulo o dia cujo modulo_id é do professor (FC). Se ele dá a turma toda (ANL), passa tudo.
    const diaDele = (turmaId: string, modId: string | null) => {
      const mods = modsPorTurma[turmaId]
      return !mods || !mods.length || (modId != null && mods.includes(modId))
    }

    // ---- DETALHE: chamada de uma turma (só os dias do módulo dele) ----
    if (turmaParam) {
      if (!turmaIds.includes(turmaParam)) return NextResponse.json({ ok: false, error: 'essa turma não é sua' }, { status: 200 })
      const { data: todosDias } = await supabase.from('turma_datas')
        .select('id, data, horario_inicio, horario_fim, modulo_id').eq('turma_id', turmaParam).order('data', { ascending: false })
      const dias = (todosDias || []).filter(d => diaDele(turmaParam, d.modulo_id))
      const { data: mats } = await supabase.from('matriculas').select('id, alunos(nome)').eq('turma_id', turmaParam)
      const matIds = (mats || []).map((m: any) => m.id)
      let presencas: any[] = []
      if (matIds.length) {
        const { data } = await supabase.from('turma_presencas').select('matricula_id, turma_data_id, presente').in('matricula_id', matIds)
        presencas = data || []
      }
      const alunos = (mats || []).map((m: any) => ({ matricula_id: m.id, nome: m.alunos?.nome || '(sem nome)' })).sort((a, b) => a.nome.localeCompare(b.nome))
      return NextResponse.json({ ok: true, dias, alunos, presencas })
    }

    // ---- LISTA de turmas (com as datas/horário só dele, ordem decrescente) ----
    let turmas: any[] = []
    if (turmaIds.length) {
      const { data: ts } = await supabase.from('turmas').select('id, codigo, produtos(nome), cidades(nome)').in('id', turmaIds)
      const { data: datas } = await supabase.from('turma_datas').select('turma_id, data, horario_inicio, modulo_id').in('turma_id', turmaIds).order('data')
      const porTurma: Record<string, any[]> = {}
      for (const d of (datas || [])) if (diaDele(d.turma_id, d.modulo_id)) (porTurma[d.turma_id] = porTurma[d.turma_id] || []).push(d)
      turmas = (ts || []).map((t: any) => {
        const ds = porTurma[t.id] || []
        return {
          id: t.id, codigo: t.codigo, produto: t.produtos?.nome || '', cidade: t.cidades?.nome || '',
          datas: ds.map(d => d.data), horario: (ds[0]?.horario_inicio || '').slice(0, 5),
          primeira: ds[0]?.data || '', ultima: ds[ds.length - 1]?.data || '', nDias: ds.length,
        }
      }).sort((a, b) => (a.primeira < b.primeira ? 1 : -1)) // decrescente pelas datas dele
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
