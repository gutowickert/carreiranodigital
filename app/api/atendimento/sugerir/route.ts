import { NextRequest, NextResponse } from 'next/server'
import { sugerirAtendimento } from '@/lib/atendimento-ia'

export const maxDuration = 120

// Motor de resposta do atendimento: busca vendas ganhas similares e sugere a próxima mensagem.
//  POST { leadId } ou { conversaId }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    if (!b.leadId && !b.conversaId) return NextResponse.json({ ok: false, error: 'informe leadId ou conversaId' }, { status: 200 })
    const r = await sugerirAtendimento({ leadId: b.leadId, conversaId: b.conversaId })
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
