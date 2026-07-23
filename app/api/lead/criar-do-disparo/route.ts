import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Cria (ou vincula) um lead a partir de uma conversa da caixa de Disparos (canal oficial).
// Server-side (service_role) pra não depender da RLS/sessão do navegador — era isso que dava "Erro ao criar lead".
export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    const conversaId = (b.conversaId || '').toString()
    if (!conversaId) return NextResponse.json({ ok: false, error: 'falta conversaId' }, { status: 200 })

    const { data: conv } = await sb.from('wa_conversas').select('id, nome, telefone, lead_id').eq('org_id', org).eq('id', conversaId).maybeSingle()
    if (!conv) return NextResponse.json({ ok: false, error: 'conversa não encontrada' }, { status: 200 })
    if (conv.lead_id) return NextResponse.json({ ok: true, leadId: conv.lead_id, jaExistia: true })

    const digs = (conv.telefone || '').replace(/\D/g, '')
    const sufixo = digs.slice(-8)

    // dedup: já existe lead com esse telefone? vincula em vez de duplicar
    if (sufixo.length === 8) {
      const { data: jaLead } = await sb.from('leads').select('id').eq('org_id', org).ilike('whatsapp', `%${sufixo}`).limit(1).maybeSingle()
      if (jaLead) {
        await sb.from('wa_conversas').update({ lead_id: jaLead.id }).eq('id', conv.id)
        return NextResponse.json({ ok: true, leadId: jaLead.id, vinculado: true })
      }
    }

    // origem 'disparo' se o número já recebeu um disparo; senão 'whatsapp'
    let origem = 'whatsapp'
    if (sufixo.length === 8) {
      const { data: env } = await sb.from('wa_disparo_envios').select('id').eq('org_id', org).ilike('telefone', `%${sufixo}`).limit(1).maybeSingle()
      if (env) origem = 'disparo'
    }

    const { data: novo, error } = await sb.from('leads').insert({
      org_id: org,
      nome: conv.nome || conv.telefone, whatsapp: conv.telefone,
      etapa: 'aguardando_atendimento', origem,
    }).select('id').single()
    if (error || !novo) return NextResponse.json({ ok: false, error: error?.message || 'falha ao inserir lead' }, { status: 200 })

    await sb.from('wa_conversas').update({ lead_id: novo.id }).eq('id', conv.id)
    return NextResponse.json({ ok: true, leadId: novo.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
