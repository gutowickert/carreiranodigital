import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Envia a mensagem aprovada pelo humano na fila "Atender Agora", conclui as tarefas pendentes do lead
// e registra a ação (origem ia-acao, modo semi/humano) pra Qualidade IA.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const { leadId, conversaId, telefone, chatLid, texto } = b
    if (!texto || !(telefone || conversaId)) return NextResponse.json({ ok: false, error: 'faltam texto e destino' }, { status: 200 })
    const env = await fetch(`${req.nextUrl.origin}/api/wa/enviar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone, leadId, chatLid, conversaId, texto }),
    }).then(r => r.json()).catch(() => ({ ok: false }))
    if (!env.ok) return NextResponse.json({ ok: false, error: env.error || 'falha ao enviar' }, { status: 200 })
    let tarefas = 0
    if (leadId) {
      const { data } = await sb.from('tarefas_lead').update({ concluida: true, concluida_em: new Date().toISOString() })
        .eq('lead_id', leadId).eq('concluida', false).eq('cancelada', false).select('id')
      tarefas = (data || []).length
      await sb.from('webhook_logs').insert({ origem: 'ia-acao', evento: 'atender-semi', status: 'enviado', payload: { lead_id: leadId, texto, aprovado_por: b.email || null } })
    }
    return NextResponse.json({ ok: true, tarefas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
