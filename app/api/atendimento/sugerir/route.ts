import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { sugerirAtendimento } from '@/lib/atendimento-ia'

export const maxDuration = 120

// Motor de resposta do atendimento: busca vendas ganhas similares e sugere a próxima mensagem.
//  POST { leadId } ou { conversaId }
// OBS multi-tenant: o motor (lib/atendimento-ia) ainda lê turmas/ia-edicao globais (CnD).
// Aqui aplicamos um GATE de org pra impedir uso cross-org; a consciência de org DENTRO
// do motor fica pra quando uma 2ª org for usar IA de fato.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    if (!b.leadId && !b.conversaId) return NextResponse.json({ ok: false, error: 'informe leadId ou conversaId' }, { status: 200 })
    const org = await orgDaRequest(req.headers.get('authorization'))
    // gate: o lead/conversa tem que ser da org de quem chamou
    if (b.leadId) {
      const { data } = await sb.from('leads').select('id').eq('org_id', org).eq('id', b.leadId).maybeSingle()
      if (!data) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })
    } else {
      const { data } = await sb.from('wa_conversas').select('id').eq('org_id', org).eq('id', b.conversaId).maybeSingle()
      if (!data) return NextResponse.json({ ok: false, error: 'conversa não encontrada' }, { status: 200 })
    }
    const r = await sugerirAtendimento({ leadId: b.leadId, conversaId: b.conversaId })
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
