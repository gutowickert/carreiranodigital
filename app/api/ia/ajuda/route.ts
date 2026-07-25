import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { dossiesLote, timelineDossie } from '@/lib/historico-lead'

export const maxDuration = 60

// FILA "IA PEDIU AJUDA" — leads que a IA ESCALOU (handoff_em setado): objeção que ela não resolveu,
// pedido de humano, ou confiança baixa. O time atende exatamente o que travou, com resumo + conversa.
//  GET  -> lista os handoffs pendentes (mais antigo primeiro) com motivo + timeline + resumo
//  POST { lead_id, acao:'resolver' } -> limpa o handoff (time assumiu)

export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data: leads } = await sb.from('leads')
      .select('id, nome, whatsapp, etapa, codigo_turma, handoff_motivo, handoff_em, resumo_ia')
      .eq('org_id', org).not('handoff_em', 'is', null).order('handoff_em', { ascending: true }).limit(60)
    const alvo = leads || []
    const dossies = await dossiesLote(sb, org, alvo)
    const fila = alvo.map(l => ({
      lead_id: l.id, nome: l.nome, etapa: l.etapa, turma: l.codigo_turma, whatsapp: l.whatsapp,
      motivo: l.handoff_motivo || 'IA pediu ajuda', desde: l.handoff_em,
      resumo: (l as any).resumo_ia || null,
      mensagens: timelineDossie(dossies.get(l.id)!, 16).map(t => ({ quem: t.quem, texto: (t.texto || '').slice(0, 400), em: t.em })),
    }))
    return NextResponse.json({ ok: true, total: fila.length, fila })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    if (!b?.lead_id) return NextResponse.json({ ok: false, error: 'falta lead_id' }, { status: 200 })
    // resolver = time assumiu → limpa o handoff (o lead segue com atendido_por='humano')
    await sb.from('leads').update({ handoff_em: null, handoff_motivo: null, atualizado_em: new Date().toISOString() }).eq('org_id', org).eq('id', b.lead_id)
    await sb.from('lead_andamentos').insert({ lead_id: b.lead_id, tipo: 'ia_handoff', observacao: '✅ Time assumiu o atendimento (handoff resolvido).' })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
