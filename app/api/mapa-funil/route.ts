import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 60

// MAPA DO FUNIL — onde estão TODOS os leads ativos, quem cuida (IA vs time), engajado/frio, com/sem tarefa.
// Pra bater o olho e entender o fluxo + os buracos.
const ETS = ['aguardando_atendimento', 'atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa', 'proxima_turma', 'agendado', 'aguardando_pagamento', 'ligacao_boa']
const alcanc = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }

export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data: leads } = await sb.from('leads').select('id, etapa, atendido_por, whatsapp').eq('org_id', org).in('etapa', ETS)
    const L = leads || []
    const ids = L.map(l => l.id)

    const inb = new Set<string>(), atend = new Set<string>(), comTarefa = new Set<string>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data: cv } = await sb.from('wa_conversas').select('id, lead_id').in('lead_id', ids.slice(i, i + 200))
      const cToL = new Map((cv || []).map((c: any) => [c.id, c.lead_id])); const cids = [...cToL.keys()]
      for (let k = 0; k < cids.length; k += 150) { const { data: ms } = await sb.from('wa_mensagens').select('conversa_id, direcao, status').in('conversa_id', cids.slice(k, k + 150)); for (const m of ms || []) if (m.direcao === 'recebida' || m.status === 'recebida') inb.add(cToL.get(m.conversa_id) as string) }
    }
    const { data: lg } = await sb.from('ligacoes').select('lead_id, duracao').in('lead_id', ids); for (const g of lg || []) if (Number(g.duracao) > 60) atend.add(g.lead_id)
    for (let i = 0; i < ids.length; i += 300) { const { data: t } = await sb.from('tarefas_lead').select('lead_id').in('lead_id', ids.slice(i, i + 300)).eq('concluida', false).eq('cancelada', false); for (const x of t || []) comTarefa.add(x.lead_id) }

    const R: Record<string, any> = {}; for (const et of ETS) R[et] = { etapa: et, tot: 0, ia: 0, humano: 0, engaj: 0, frio: 0, tarefa: 0, semtarefa: 0, lid: 0 }
    for (const l of L) { const r = R[l.etapa]; r.tot++; if (l.atendido_por === 'ia') r.ia++; else r.humano++; const eng = inb.has(l.id) || atend.has(l.id); if (eng) r.engaj++; else r.frio++; if (comTarefa.has(l.id)) r.tarefa++; else r.semtarefa++; if (!alcanc(l.whatsapp)) r.lid++ }

    // quem cuida: cadência IA = frios do atendimento + TODO lote/bolsa; resto = time
    const CAD_IA = new Set(['lote_preco_ok', 'oferecer_bolsa'])
    const etapas = ETS.map(et => {
      const r = R[et]
      const iaCuida = et === 'atendimento_inicial' ? r.frio : (CAD_IA.has(et) ? r.tot : 0)
      return { ...r, iaCuida, timeCuida: r.tot - iaCuida }
    })
    const total = L.length
    const totalIA = etapas.reduce((a, e) => a + e.iaCuida, 0)
    const totalTime = total - totalIA
    const semTarefa = etapas.reduce((a, e) => a + e.semtarefa, 0)
    const lid = etapas.reduce((a, e) => a + e.lid, 0)

    return NextResponse.json({ ok: true, total, totalIA, totalTime, semTarefa, lid, etapas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
