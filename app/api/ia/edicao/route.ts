import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Captura a EDIÇÃO humana de uma sugestão da IA (sugerido x enviado) — de QUALQUER tela.
// Guarda o par em webhook_logs (origem='ia-edicao') pra a IA aprender o tom real da equipe.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const original = (b.original || '').toString().trim()
    const enviado = (b.enviado || '').toString().trim()
    const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (!original || !enviado || norm(original) === norm(enviado)) return NextResponse.json({ ok: true, skip: true })
    let etapa: any = null, turma: any = null
    if (b.leadId) {
      const { data: l } = await sb.from('leads').select('etapa, codigo_turma').eq('id', b.leadId).maybeSingle()
      etapa = l?.etapa || null; turma = l?.codigo_turma || null
    }
    await sb.from('webhook_logs').insert({ origem: 'ia-edicao', evento: 'correcao', status: 'ok', payload: { lead_id: b.leadId || null, original, enviado, etapa, turma, por: b.email || null, tela: b.tela || null } })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }) }
}
