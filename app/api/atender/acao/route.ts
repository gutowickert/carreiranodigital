import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Ações rápidas do Atender: mover o lead de etapa no funil, ou marcar perda.
// Registra o andamento (mudanca_etapa) igual ao CRM; na perda, cancela as tarefas pendentes.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const leadId = (b.leadId || '').toString().trim()
  const acao = (b.acao || '').toString().trim()
  if (!leadId || !acao) return NextResponse.json({ ok: false, error: 'faltam dados' }, { status: 200 })

  const { data: lead } = await sb.from('leads').select('etapa, vendedor_id').eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })
  const now = new Date().toISOString()
  const ETAPAS_VALIDAS = ['aguardando_atendimento', 'atendimento_inicial', 'lote_preco_ok', 'nao_chegou_preco', 'oferecer_bolsa', 'pediu_prazo', 'aguardando_pagamento', 'agendado', 'proxima_turma']

  if (acao === 'mover') {
    const etapa = (b.etapa || '').toString().trim()
    if (!ETAPAS_VALIDAS.includes(etapa)) return NextResponse.json({ ok: false, error: 'etapa inválida' }, { status: 200 })
    await sb.from('leads').update({ etapa, atualizado_em: now }).eq('id', leadId)
    await sb.from('lead_andamentos').insert({ lead_id: leadId, vendedor_id: lead.vendedor_id || null, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: etapa, observacao: 'Movido pelo Atender' })
    return NextResponse.json({ ok: true })
  }

  if (acao === 'perda') {
    const motivo = (b.motivo || '').toString().trim()
    await sb.from('leads').update({ etapa: 'perda', data_perda: now, atualizado_em: now }).eq('id', leadId)
    await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: now, atualizado_em: now }).eq('lead_id', leadId).eq('concluida', false).eq('cancelada', false)
    await sb.from('lead_andamentos').insert({ lead_id: leadId, vendedor_id: lead.vendedor_id || null, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: 'perda', observacao: motivo ? `Perda: ${motivo}` : 'Perda marcada pelo Atender' })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 200 })
}
