import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { faseTurma, hojeBRT, type Lote } from '@/lib/lote-core'

// 📅 FASE DE CADA TURMA (pro board "Ver por Fase"). Calcula, pela DATA, a fase de cada turma que tem lote
// cadastrado (turma_lotes). Turma sem lote não aparece (o board joga esses leads na coluna "Sem lote").
export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data: turmas } = await sb.from('turmas').select('id, data_inicio').eq('org_id', org)
    const turmaIds = (turmas || []).map(t => t.id)
    if (!turmaIds.length) return NextResponse.json({ ok: true, fases: {} })
    const { data: lotes } = await sb.from('turma_lotes')
      .select('turma_id, ordem, nome, preco_pix, preco_cartao, parcela_cartao, vale_ate')
      .in('turma_id', turmaIds).order('ordem')
    const porTurma = new Map<string, Lote[]>()
    for (const l of (lotes || []) as any[]) { const a = porTurma.get(l.turma_id) || []; a.push(l); porTurma.set(l.turma_id, a) }
    const hoje = hojeBRT()
    const fases: Record<string, string> = {}
    for (const t of turmas || []) {
      const ls = porTurma.get(t.id)
      if (ls?.length) fases[t.id] = faseTurma(ls, String(t.data_inicio || '').slice(0, 10), hoje)
    }
    return NextResponse.json({ ok: true, fases })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro', fases: {} }, { status: 200 })
  }
}
