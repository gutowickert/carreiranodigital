import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { transcreverLigacao } from '@/lib/transcrever-ligacao'

export const maxDuration = 60

// Recebe o resultado da ligacao da API4COM (evento channel-hangup)
export async function POST(req: NextRequest) {
  try {
    const ev = await req.json()
    const callId = ev.id
    const leadId = (ev.metadata && ev.metadata.leadId) || null

    const update: any = {
      status: 'encerrada',
      duracao: ev.duration || 0,
      hangup_cause: ev.hangupCause || null,
      gravacao_url: ev.recordUrl || null,
      atendida_em: ev.answeredAt || null,
      encerrada_em: ev.endedAt || null,
    }

    let ligId: string | null = null

    if (callId) {
      const { data } = await supabase.from('ligacoes').update(update).eq('api4com_id', callId).select('id')
      if (data && data.length) ligId = data[0].id
    }

    if (!ligId && leadId) {
      const { data: pend } = await supabase.from('ligacoes')
        .select('id').eq('lead_id', leadId).eq('status', 'iniciada')
        .order('criado_em', { ascending: false }).limit(1)
      if (pend && pend.length) {
        await supabase.from('ligacoes').update({ ...update, api4com_id: callId }).eq('id', pend[0].id)
        ligId = pend[0].id
      }
    }

    if (!ligId) {
      const { data } = await supabase.from('ligacoes').insert({
        api4com_id: callId,
        lead_id: leadId,
        telefone: ev.called || null,
        ramal: ev.caller || null,
        direcao: ev.direction === 'inbound' ? 'entrada' : 'saida',
        metadata: ev.metadata || null,
        ...update,
      }).select('id').single()
      ligId = data?.id || null
    }

    // transcreve a gravação assim que a call encerra (fica pronto pro copiloto). Não quebra o webhook.
    if (ligId && update.gravacao_url && (update.duracao || 0) > 10) {
      try { await transcreverLigacao(ligId) } catch { /* melhor esforço */ }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}