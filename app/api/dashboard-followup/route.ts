import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 60

// DASHBOARD do follow-up automático — dados pra decisão: o que a IA fez, onde os leads estão,
// quantos responderam/converteram, e o CUSTO (IA + WhatsApp API) por dia.
const USD_BRL = 5.4
// custo Meta por conversa (Brasil, aprox, USD): marketing ~0.0625, utility ~0.008
const WA_CUSTO: Record<string, number> = { marketing: 0.0625, utility: 0.008 }
const FUNIL = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const diaBR = (iso?: string) => new Date(iso || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const money = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')

export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const hoje = diaBR()
    const ini7 = new Date(Date.now() - 7 * 864e5).toISOString()

    // categoria dos templates (pra custo Meta)
    const { data: tpls } = await sb.from('followup_templates').select('nome_meta, categoria').eq('org_id', org)
    const catDe: Record<string, string> = {}; for (const t of tpls || []) catDe[(t.nome_meta || '').toLowerCase()] = (t.categoria || 'marketing').toLowerCase()

    // andamentos dos últimos 7 dias (envios da IA, hand-offs, mudanças de etapa)
    const { data: ands } = await sb.from('lead_andamentos').select('lead_id, tipo, observacao, etapa_nova, criado_em').gte('criado_em', ini7).order('criado_em', { ascending: false }).limit(5000)
    const A = ands || []

    // 1) FOLLOW-UPS enviados (ia_followup) — hoje + série 7 dias + por template
    const envios = A.filter(a => a.tipo === 'ia_followup')
    const enviosHoje = envios.filter(a => diaBR(a.criado_em) === hoje)
    const porTemplate: Record<string, number> = {}
    let waCustoHoje = 0
    for (const a of enviosHoje) {
      const m = (a.observacao || '').match(/cnd_[a-z0-9_]+/i); const nome = (m ? m[0] : 'outro').toLowerCase()
      porTemplate[nome] = (porTemplate[nome] || 0) + 1
      waCustoHoje += WA_CUSTO[catDe[nome] || 'marketing'] ?? WA_CUSTO.marketing
    }
    // série 7 dias (envios por dia)
    const serie: { dia: string; envios: number }[] = []
    for (let i = 6; i >= 0; i--) { const d = diaBR(new Date(Date.now() - i * 864e5).toISOString()); serie.push({ dia: d.slice(5), envios: envios.filter(a => diaBR(a.criado_em) === d).length }) }

    // 2) RESPONDERAM (hand-off: saiu da Esteira IA hoje)
    const responderamHoje = A.filter(a => a.tipo === 'reconciliacao' && /respondeu/i.test(a.observacao || '') && diaBR(a.criado_em) === hoje).length
    // 3) GANHOS / PERDAS hoje (mudança de etapa)
    const ganhosHoje = A.filter(a => a.tipo === 'mudanca_etapa' && a.etapa_nova === 'ganho' && diaBR(a.criado_em) === hoje)
    const perdasHoje = A.filter(a => a.tipo === 'mudanca_etapa' && a.etapa_nova === 'perda' && diaBR(a.criado_em) === hoje).length

    // valor dos ganhos de hoje
    let ganhoValor = 0
    if (ganhosHoje.length) { const ids = ganhosHoje.map(g => g.lead_id); const { data: gl } = await sb.from('leads').select('valor_venda').in('id', ids); for (const l of gl || []) ganhoValor += Number(l.valor_venda) || 0 }

    // 4) FUNIL — onde estão os leads da IA (atendido_por='ia') por etapa
    const funil: Record<string, number> = {}
    for (const et of FUNIL) { const { count } = await sb.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('etapa', et).eq('atendido_por', 'ia'); funil[et] = count || 0 }
    const friosIA = Object.values(funil).reduce((a, b) => a + b, 0)

    // 5) CUSTO de IA hoje (ia-uso)
    const { data: usos } = await sb.from('webhook_logs').select('payload, recebido_em').eq('org_id', org).eq('origem', 'ia-uso').gte('recebido_em', hoje + 'T03:00:00Z').limit(5000)
    let iaCustoUsd = 0; for (const u of usos || []) iaCustoUsd += Number((u.payload as any)?.custo_usd) || 0

    const iaBrl = iaCustoUsd * USD_BRL, waBrl = waCustoHoje * USD_BRL

    return NextResponse.json({
      ok: true, hoje: hoje.slice(8, 10) + '/' + hoje.slice(5, 7),
      followups: { hoje: enviosHoje.length, porTemplate, serie },
      resultados: { responderam: responderamHoje, ganhos: ganhosHoje.length, ganhoValor, perdas: perdasHoje },
      funil, friosIA,
      custos: {
        ia_brl: iaBrl, wa_brl: waBrl, total_brl: iaBrl + waBrl,
        ia_fmt: money(iaBrl), wa_fmt: money(waBrl), total_fmt: money(iaBrl + waBrl),
        por_followup: enviosHoje.length ? money((iaBrl + waBrl) / enviosHoje.length) : money(0),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
