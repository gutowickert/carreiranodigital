import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Fila de LIGAÇÕES por prioridade:
//  1) AGENDADAS — ligações marcadas pra um horário (tarefa ligar_agendado). Vêm primeiro, na ordem do horário.
//  2) NOVOS LEADS — leads na etapa Ligação (aguardando_atendimento) ainda sem contato. Prioriza VELOCIDADE (mais novo primeiro).
export async function GET(req: Request) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const now = Date.now()

    // 1) AGENDADAS: só ligações realmente marcadas pra um HORÁRIO (ligar_agendado).
    const { data: ags } = await sb.from('tarefas_lead')
      .select('lead_id, titulo, data_vencimento, leads!inner(id, nome, whatsapp, etapa, vendedor_id)')
      .eq('org_id', org).eq('tipo', 'ligar_agendado').eq('concluida', false).eq('cancelada', false)
      .order('data_vencimento', { ascending: true }).limit(200)
    const agendadas = (ags || []).map((t: any) => {
      const l = t.leads
      const venc = t.data_vencimento ? +new Date(t.data_vencimento) : 0
      return {
        leadId: l.id, nome: l.nome, telefone: l.whatsapp, etapa: l.etapa, vendedorId: l.vendedor_id,
        quando: t.data_vencimento, atrasada: venc > 0 && venc < now,
        minutosPara: venc ? Math.round((venc - now) / 60000) : null,
      }
    })

    // 1b) A LIGAR (sem horário): leads marcados pra ligar (ex.: triagem sugeriu ligação), sem hora agendada
    const { data: al } = await sb.from('tarefas_lead')
      .select('lead_id, data_vencimento, leads!inner(id, nome, whatsapp, etapa, vendedor_id)')
      .eq('org_id', org).eq('tipo', 'triagem_ligacao').eq('concluida', false).eq('cancelada', false)
      .order('data_vencimento', { ascending: true }).limit(300)
    // leads que JÁ têm ligação marcada pra um horário — não podem reaparecer como "novo" ou "a ligar"
    const agendadosIds = new Set(agendadas.map((a: any) => a.leadId))
    const aLigar = (al || []).filter((t: any) => !agendadosIds.has(t.leads.id)).map((t: any) => ({ leadId: t.leads.id, nome: t.leads.nome, telefone: t.leads.whatsapp, etapa: t.leads.etapa }))

    // 2) NOVOS LEADS na etapa Ligação (aguardando_atendimento), ainda abertos — mais novo primeiro (velocidade)
    const { data: novos } = await sb.from('leads')
      .select('id, nome, whatsapp, criado_em, vendedor_id')
      .eq('org_id', org).eq('etapa', 'aguardando_atendimento')
      .order('criado_em', { ascending: false }).limit(200)
    const novosLeads = (novos || []).filter((l: any) => !agendadosIds.has(l.id)).map((l: any) => ({
      leadId: l.id, nome: l.nome, telefone: l.whatsapp, vendedorId: l.vendedor_id,
      criadoEm: l.criado_em,
      chegouMin: l.criado_em ? Math.round((now - +new Date(l.criado_em)) / 60000) : null,
    }))

    return NextResponse.json({ ok: true, agendadas, aLigar, novosLeads })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
