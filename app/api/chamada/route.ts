import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Chamada + acompanhamento por turma.
//  GET                 -> lista de turmas pra escolher
//  GET ?turma=<id>     -> dias, roster (alunos + acompanhamento) e presenças
//  POST presenca       -> { tipo:'presenca', matricula_id, turma_data_id, presente }
//  POST acompanhamento -> { tipo:'acompanhamento', matricula_id, campo, valor }

const CAMPOS_ACOMP = new Set(['nicho', 'ja_rodava_anuncios', 'rodou_campanha', 'gerou_lead', 'vendeu', 'concluido'])

export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const turmaId = req.nextUrl.searchParams.get('turma')
    if (!turmaId) {
      const { data: turmas } = await supabase.from('turmas')
        .select('id, codigo, data_inicio, data_fim, produtos(nome), cidades(nome)')
        .eq('org_id', org)
        .order('data_inicio', { ascending: false }).limit(60)
      return NextResponse.json({ ok: true, turmas: turmas || [] })
    }

    const { data: turma } = await supabase.from('turmas')
      .select('id, codigo, data_inicio, data_fim, produtos(nome), cidades(nome)').eq('org_id', org).eq('id', turmaId).single()
    if (!turma) return NextResponse.json({ ok: false, error: 'turma não encontrada' }, { status: 200 })
    const { data: dias } = await supabase.from('turma_datas')
      .select('id, data, horario_inicio, modulo_id').eq('org_id', org).eq('turma_id', turmaId).order('data')
    const { data: mats } = await supabase.from('matriculas')
      .select('id, nicho, ja_rodava_anuncios, rodou_campanha, gerou_lead, vendeu, concluido, alunos(nome)')
      .eq('org_id', org).eq('turma_id', turmaId)
    const matIds = (mats || []).map((m: any) => m.id)
    let presencas: any[] = []
    if (matIds.length) {
      const { data } = await supabase.from('turma_presencas').select('matricula_id, turma_data_id, presente').in('matricula_id', matIds)
      presencas = data || []
    }
    const alunos = (mats || []).map((m: any) => ({
      matricula_id: m.id, nome: m.alunos?.nome || '(sem nome)',
      nicho: m.nicho || '', ja_rodava_anuncios: m.ja_rodava_anuncios, rodou_campanha: m.rodou_campanha,
      gerou_lead: m.gerou_lead, vendeu: m.vendeu, concluido: m.concluido,
    })).sort((a, b) => a.nome.localeCompare(b.nome))
    return NextResponse.json({ ok: true, turma, dias: dias || [], alunos, presencas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const now = new Date().toISOString()
    const org = await orgDaRequest(req.headers.get('authorization'))
    if (b.tipo === 'presenca') {
      if (!b.matricula_id || !b.turma_data_id) return NextResponse.json({ ok: false, error: 'faltam ids' }, { status: 200 })
      // confirma que a matrícula é da org antes de gravar
      const { data: m } = await supabase.from('matriculas').select('id').eq('org_id', org).eq('id', b.matricula_id).maybeSingle()
      if (!m) return NextResponse.json({ ok: false, error: 'matrícula não encontrada' }, { status: 200 })
      await supabase.from('turma_presencas').upsert(
        { org_id: org, matricula_id: b.matricula_id, turma_data_id: b.turma_data_id, presente: !!b.presente, atualizado_em: now },
        { onConflict: 'matricula_id,turma_data_id' })
      return NextResponse.json({ ok: true })
    }
    if (b.tipo === 'acompanhamento') {
      if (!b.matricula_id || !CAMPOS_ACOMP.has(b.campo)) return NextResponse.json({ ok: false, error: 'campo inválido' }, { status: 200 })
      await supabase.from('matriculas').update({ [b.campo]: b.valor }).eq('org_id', org).eq('id', b.matricula_id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: 'tipo inválido' }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
