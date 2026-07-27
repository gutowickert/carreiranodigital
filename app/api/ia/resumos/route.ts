import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { dossieLead } from '@/lib/historico-lead'
import { gerarResumo } from '@/lib/resumo-lead'

export const maxDuration = 60

// WARMING dos resumos — gera o resumo_ia (com etapaReal) dos leads do funil que ainda não têm,
// aos poucos (teto por chamada, pra não estourar tempo). O follow-up depois só LÊ o cache (rápido).
// Chamado em loop (cron / manual) até zerar. dryRun só conta o que falta.
const ETAPAS = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const limit = Math.min(Math.max(Number(b?.limit) || 8, 1), 12)
    const dryRun = b?.dryRun === true

    // leads do funil que PRECISAM de leitura: sem resumo (null) OU com resumo ANTIGO sem o campo etapaReal
    // (esses ficavam presos em "sem resumo" no motor porque o warming só olhava os nulos).
    const { data: pend } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma').eq('org_id', org).in('etapa', ETAPAS).or('resumo_ia.is.null,resumo_ia->>etapaReal.is.null').limit(200)
    const total = (pend || []).length
    if (dryRun) return NextResponse.json({ ok: true, dryRun: true, semResumo: total })

    let geradas = 0
    for (const l of (pend || []).slice(0, limit)) {
      try {
        const d = await dossieLead(sb, org, l)
        const r = await gerarResumo(sb, org, l, d)
        if (r) geradas++
      } catch { /* segue */ }
    }
    return NextResponse.json({ ok: true, geradas, restantes: Math.max(0, total - geradas) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
