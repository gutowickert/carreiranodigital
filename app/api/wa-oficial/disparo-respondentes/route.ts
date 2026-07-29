import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Mapa "sufixo do telefone → disparo que a pessoa RESPONDEU" (respondeu_em preenchido pelo webhook).
// A inbox usa pra mostrar a TARJA "📢 Respondeu disparo: X" e o atendimento saber de onde veio o lead.
// Casa por sufixo (últimos 8 dígitos) porque o telefone é gravado em formatos diferentes (mesmo critério do webhook).
export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data: envs } = await sb.from('wa_disparo_envios')
      .select('telefone, disparo_id, respondeu_em')
      .eq('org_id', org).not('respondeu_em', 'is', null)
      .order('respondeu_em', { ascending: false }).limit(3000)

    const ids = [...new Set((envs || []).map((e: any) => e.disparo_id).filter(Boolean))]
    const nomeById = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('wa_disparos').select('id, nome, template_nome').in('id', ids.slice(i, i + 200))
      for (const d of data || []) nomeById.set(d.id, d.nome || d.template_nome || 'Disparo')
    }

    // 1 entrada por telefone = o disparo MAIS RECENTE que respondeu (respondeu_em desc → primeiro vence)
    const map: Record<string, { nome: string; em: string }> = {}
    for (const e of envs || []) {
      const s = (e.telefone || '').replace(/\D/g, '').slice(-8)
      if (s && !map[s]) map[s] = { nome: nomeById.get(e.disparo_id) || 'Disparo', em: e.respondeu_em }
    }
    return NextResponse.json({ ok: true, map })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
