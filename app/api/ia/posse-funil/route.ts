import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 60

// 👤→🤖 POSSE DO FUNIL — lead do funil (atendimento/lote/bolsa) que está com o TIME (atendido_por='humano')
// mas ESFRIOU (não respondeu nas últimas 24h) → passa pra IA. Assim a fila do time fica só com quem respondeu
// recente; os frios do funil (Pelicula & cia.) somem da cara do time e o follow-up cuida deles.
// Detecção por CONSULTA DIRETA (mensagem recebida nas últimas 24h), NÃO pelo dossiê (que sub-conta em escala).
// dryRun (padrão) simula. Aplicar: { dryRun:false, confirm:true }.
const FUNIL = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const horas = Math.min(Math.max(Number(b?.horas) || 24, 6), 168) // janela de "respondeu recente" (default 24h)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    // quem RESPONDEU nas últimas `horas` (consulta direta) → fica com o time
    const desde = new Date(Date.now() - horas * 36e5).toISOString()
    const inb: any[] = []
    for (let from = 0; ; from += 1000) { const { data } = await sb.from('wa_mensagens').select('conversa_id').eq('org_id', org).or('direcao.eq.recebida,status.eq.recebida').gte('criado_em', desde).range(from, from + 999); if (!data?.length) break; inb.push(...data); if (data.length < 1000) break }
    const convIds = [...new Set(inb.map((m: any) => m.conversa_id).filter(Boolean))]
    const respRecente = new Set<string>()
    for (let i = 0; i < convIds.length; i += 200) { const { data } = await sb.from('wa_conversas').select('id, lead_id').in('id', convIds.slice(i, i + 200)); for (const c of data || []) if (c.lead_id) respRecente.add(c.lead_id) }

    // funil + com o time + NÃO respondeu recente → passa pra IA
    const { data: leads } = await sb.from('leads').select('id, nome, etapa').eq('org_id', org).in('etapa', FUNIL).eq('atendido_por', 'humano').limit(5000)
    const passar = (leads || []).filter(l => !respRecente.has(l.id))

    if (!dryRun) {
      for (let i = 0; i < passar.length; i += 100) {
        const chunk = passar.slice(i, i + 100).map(l => l.id)
        await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).in('id', chunk)
      }
      // andamento (1 por lead, em lote)
      const rows = passar.map(l => ({ lead_id: l.id, tipo: 'reconciliacao', observacao: `🤖 Posse — esfriou no funil (${l.etapa}, sem responder há ${horas}h) → passou pra IA cuidar do follow-up.` }))
      for (let i = 0; i < rows.length; i += 200) await sb.from('lead_andamentos').insert(rows.slice(i, i + 200))
    }

    const porEtapa: Record<string, number> = {}
    for (const l of passar) porEtapa[l.etapa] = (porEtapa[l.etapa] || 0) + 1
    return NextResponse.json({
      ok: true, dryRun, funilComTime: (leads || []).length, responderamRecente: (leads || []).length - passar.length,
      passaramPraIA: passar.length, porEtapa,
      amostra: passar.slice(0, 15).map(l => ({ nome: l.nome, etapa: l.etapa })),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
