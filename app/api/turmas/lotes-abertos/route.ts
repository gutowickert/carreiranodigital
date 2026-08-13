import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { loteVigente, faseTurma, diasAteVirada, hojeBRT, LABEL_FASE, type Lote, type Fase } from '@/lib/lote-core'

// 📅 LOTES ABERTOS — pro time se orientar: cada turma (com lote) que ainda não começou, com a FASE, o LOTE VIGENTE
// (preço Pix + parcela), QUANDO vira (vale_ate + dias) e o próximo preço. Ordenado pela virada mais próxima.
export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const hoje = hojeBRT()
    const { data: turmas } = await sb.from('turmas')
      .select('id, codigo, data_inicio, produtos(nome), cidades(nome)').eq('org_id', org)
    const turmaIds = (turmas || []).map(t => t.id)
    if (!turmaIds.length) return NextResponse.json({ ok: true, hoje, lotes: [] })
    const { data: lotesRaw } = await sb.from('turma_lotes')
      .select('turma_id, ordem, nome, preco_pix, preco_cartao, parcela_cartao, vale_ate')
      .in('turma_id', turmaIds).order('ordem')
    const porTurma = new Map<string, Lote[]>()
    for (const l of (lotesRaw || []) as any[]) { const a = porTurma.get(l.turma_id) || []; a.push(l); porTurma.set(l.turma_id, a) }

    const out: any[] = []
    for (const t of (turmas || []) as any[]) {
      const lotes = porTurma.get(t.id)
      if (!lotes?.length) continue
      const inicio = String(t.data_inicio || '').slice(0, 10)
      if (inicio && inicio < hoje) continue // turma já começou → não é "aberto"
      const vig = loteVigente(lotes, hoje)!
      const fase = faseTurma(lotes, inicio, hoje) as Fase
      const dv = diasAteVirada(lotes, hoje)
      const prox = lotes.find(l => l.ordem > vig.ordem) || null
      out.push({
        turma_id: t.id, codigo: t.codigo,
        produto: t.produtos?.nome || '', cidade: t.cidades?.nome || '',
        inicio, fase, fase_label: LABEL_FASE[fase],
        lote_nome: vig.nome, preco_pix: vig.preco_pix, parcela_cartao: vig.parcela_cartao,
        vale_ate: vig.vale_ate, dias_ate_virada: dv,
        proximo_nome: prox?.nome || null, proximo_pix: prox?.preco_pix ?? null,
        lote_unico: lotes.length === 1,
      })
    }
    out.sort((a, b) => (a.dias_ate_virada ?? 999) - (b.dias_ate_virada ?? 999))
    return NextResponse.json({ ok: true, hoje, lotes: out })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro', lotes: [] }, { status: 200 })
  }
}
