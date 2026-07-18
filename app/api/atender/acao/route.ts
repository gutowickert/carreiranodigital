import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { gerarProxima, gerarPrimeira, garantirTarefa } from '@/lib/fluxo'

// Ações rápidas do Atender: mover o lead de etapa no funil, ou marcar perda.
// Registra o andamento (mudanca_etapa) igual ao CRM; na perda, cancela as tarefas pendentes.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const org = await orgDaRequest(req.headers.get('authorization'))
  const leadId = (b.leadId || '').toString().trim()
  const acao = (b.acao || '').toString().trim()
  if (!leadId || !acao) return NextResponse.json({ ok: false, error: 'faltam dados' }, { status: 200 })

  const { data: lead } = await sb.from('leads').select('etapa, vendedor_id, nome').eq('org_id', org).eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })
  const now = new Date().toISOString()
  const ETAPAS_VALIDAS = ['aguardando_atendimento', 'atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa', 'aguardando_pagamento', 'agendado', 'proxima_turma']

  if (acao === 'mover') {
    const etapa = (b.etapa || '').toString().trim()
    if (!ETAPAS_VALIDAS.includes(etapa)) return NextResponse.json({ ok: false, error: 'etapa inválida' }, { status: 200 })
    await sb.from('leads').update({ etapa, atualizado_em: now }).eq('org_id', org).eq('id', leadId)
    await sb.from('lead_andamentos').insert({ org_id: org, lead_id: leadId, vendedor_id: lead.vendedor_id || null, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: etapa, observacao: 'Movido pelo Atender' })
    // BUG-raiz do órfão: ao mover, já semeia a 1ª tarefa da etapa nova (cadência não deixa lead sem tarefa)
    if (!['ganho', 'perda', 'aguardando_pagamento'].includes(etapa)) {
      // não duplica se já houver tarefa pendente
      const { data: pend } = await sb.from('tarefas_lead').select('id').eq('org_id', org).eq('lead_id', leadId).eq('concluida', false).eq('cancelada', false).limit(1).maybeSingle()
      if (!pend) await gerarPrimeira(sb, leadId, etapa, lead.nome || 'Lead', lead.vendedor_id || null)
      await garantirTarefa(sb, leadId, etapa, lead.nome || 'Lead', lead.vendedor_id || null)
    }
    return NextResponse.json({ ok: true })
  }

  if (acao === 'perda') {
    const motivo = (b.motivo || '').toString().trim()
    await sb.from('leads').update({ etapa: 'perda', data_perda: now, atualizado_em: now }).eq('org_id', org).eq('id', leadId)
    await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: now, atualizado_em: now }).eq('org_id', org).eq('lead_id', leadId).eq('concluida', false).eq('cancelada', false)
    await sb.from('lead_andamentos').insert({ org_id: org, lead_id: leadId, vendedor_id: lead.vendedor_id || null, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: 'perda', observacao: motivo ? `Perda: ${motivo}` : 'Perda marcada pelo Atender' })
    return NextResponse.json({ ok: true })
  }

  if (acao === 'concluir') {
    // conclui a tarefa de followup atual e cria a PRÓXIMA da cadência (avança o D0/D1/D2 sozinho)
    const { data: tf } = await sb.from('tarefas_lead').select('id, tipo').eq('org_id', org).eq('lead_id', leadId).eq('concluida', false).eq('cancelada', false).order('data_vencimento').limit(1).maybeSingle()
    if (!tf) return NextResponse.json({ ok: true, semTarefa: true })
    await sb.from('tarefas_lead').update({ concluida: true, concluida_em: now, atualizado_em: now }).eq('id', tf.id)
    const { data: l2 } = await sb.from('leads').select('nome').eq('org_id', org).eq('id', leadId).maybeSingle()
    await gerarProxima(sb, leadId, lead.etapa, tf.tipo, l2?.nome || 'Lead', lead.vendedor_id || null)
    await garantirTarefa(sb, leadId, lead.etapa, l2?.nome || 'Lead', lead.vendedor_id || null)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 200 })
}
