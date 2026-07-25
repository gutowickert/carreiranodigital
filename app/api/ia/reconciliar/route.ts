import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { dossiesLote } from '@/lib/historico-lead'

export const maxDuration = 60

// RECONCILIADOR (roda à noite) — acerta a POSSE do lead entre time e IA, usando o dossiê único:
//  • engajou e está QUENTE (contato nos últimos N dias) e estava com a IA → volta pro TIME (humano).
//  • engajou e ESFRIOU (sem contato há N dias) → volta pra IA (a Esteira retoma no fluxo).
//  • frio (nunca respondeu / ligação não atendida) → segue com a IA (o motor já trabalha, não mexe).
// dryRun (padrão) só simula. Aplicar: { dryRun:false, confirm:true }. Kill switch: ia-automacao {ligado:false}.
const ETAPAS = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const dias = Math.min(Math.max(Number(b?.dias) || 3, 1), 30)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    const { data: cfg } = await sb.from('webhook_logs').select('payload').eq('org_id', org).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
    if ((cfg?.payload as any)?.ligado === false && !dryRun) return NextResponse.json({ ok: false, killed: true, error: 'Automação DESLIGADA (kill switch).' }, { status: 200 })

    const { data: leads } = await sb.from('leads').select('id, nome, whatsapp, etapa, atendido_por').eq('org_id', org).in('etapa', ETAPAS).limit(5000)
    const dossies = await dossiesLote(sb, org, leads || [])
    const now = Date.now()

    const reinscrever: any[] = []   // engajado + frio há N dias → IA
    const devolver: any[] = []      // engajado + quente + estava com a IA → time
    for (const l of leads || []) {
      const d = dossies.get(l.id); if (!d) continue
      if (!d.engajado) continue // frio segue com a IA (motor cuida), não mexe na posse
      // silêncio medido pela última atividade DO CLIENTE (não pelo nosso envio) — senão um envio da IA "esquentaria" o lead
      const ultimo = d.ultimoEngajamentoEm ? +new Date(d.ultimoEngajamentoEm) : 0
      const frioHaDias = ultimo ? (now - ultimo) >= dias * DIA : true
      if (frioHaDias && l.atendido_por !== 'ia') {
        reinscrever.push({ lead: l, diasSilencio: ultimo ? Math.floor((now - ultimo) / DIA) : null })
      } else if (!frioHaDias && l.atendido_por === 'ia') {
        devolver.push({ lead: l })
      }
    }

    if (!dryRun) {
      for (const r of reinscrever) {
        await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).eq('id', r.lead.id)
        await sb.from('lead_andamentos').insert({ lead_id: r.lead.id, tipo: 'reconciliacao', observacao: `🤖 Reconciliador — engajado mas em silêncio há ${r.diasSilencio ?? '?'} dias → volta pra Esteira IA retomar no fluxo.` })
      }
      for (const r of devolver) {
        await sb.from('leads').update({ atendido_por: 'humano', atualizado_em: new Date().toISOString() }).eq('id', r.lead.id)
        await sb.from('lead_andamentos').insert({ lead_id: r.lead.id, tipo: 'reconciliacao', observacao: `🤖 Reconciliador — lead engajado e ativo → volta pro time atender.` })
      }
    }

    return NextResponse.json({
      ok: true, dryRun, dias,
      reinscritos: reinscrever.length, devolvidos: devolver.length,
      amostraReinscritos: reinscrever.slice(0, 15).map(r => ({ nome: r.lead.nome, etapa: r.lead.etapa, diasSilencio: r.diasSilencio })),
      amostraDevolvidos: devolver.slice(0, 15).map(r => ({ nome: r.lead.nome, etapa: r.lead.etapa })),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
