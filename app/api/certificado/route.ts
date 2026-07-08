import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Certificados.
//  GET ?matricula=<id> -> dados pra montar o certificado de 1 aluno
//  GET ?turma=<id>     -> lista os concluídos da turma (pra gerar em lote)
const RESPONSAVEL_FC = 'Luis Augusto Wickert'

function tipoDe(produto: string): 'ANL' | 'FC' | 'GEN' {
  const p = (produto || '').toLowerCase()
  if (p.includes('anúncios') || p.includes('anuncios')) return 'ANL'
  if (p.includes('formação') || p.includes('formacao')) return 'FC'
  return 'GEN'
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const turmaId = sp.get('turma')
    if (turmaId) {
      const { data } = await supabase.from('matriculas')
        .select('id, concluido, alunos(nome)').eq('turma_id', turmaId).eq('concluido', true)
      const alunos = (data || []).map((m: any) => ({ matricula_id: m.id, nome: m.alunos?.nome || '(sem nome)' })).sort((a, b) => a.nome.localeCompare(b.nome))
      return NextResponse.json({ ok: true, alunos })
    }
    const matId = sp.get('matricula')
    if (!matId) return NextResponse.json({ ok: false, error: 'falta matricula ou turma' }, { status: 200 })

    const { data: mat } = await supabase.from('matriculas')
      .select('id, turma_id, alunos(nome), turmas(codigo, data_inicio, data_fim, produto_id, cidade_id)')
      .eq('id', matId).single()
    if (!mat) return NextResponse.json({ ok: false, error: 'matrícula não encontrada' }, { status: 200 })
    const t: any = mat.turmas
    const [{ data: prod }, { data: cid }] = await Promise.all([
      supabase.from('produtos').select('nome').eq('id', t.produto_id).single(),
      supabase.from('cidades').select('nome').eq('id', t.cidade_id).single(),
    ])
    const produtoNome = prod?.nome || ''
    const tipo = tipoDe(produtoNome)

    let assinante = RESPONSAVEL_FC, cargo = 'Responsável pelo Curso'
    if (tipo === 'ANL' || tipo === 'GEN') {
      const { data: tp } = await supabase.from('turma_professores')
        .select('professores(nome)').eq('turma_id', mat.turma_id).limit(1).maybeSingle()
      assinante = (tp as any)?.professores?.nome || RESPONSAVEL_FC
      cargo = 'Professor do Curso'
    }

    return NextResponse.json({
      ok: true,
      aluno: (mat.alunos as any)?.nome || '(sem nome)',
      produto: produtoNome, tipo,
      cidade: cid?.nome || '', data_inicio: t.data_inicio, data_fim: t.data_fim,
      assinante, cargo,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
