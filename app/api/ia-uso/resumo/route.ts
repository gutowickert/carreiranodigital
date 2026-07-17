import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 30

// Resumo de custo de IA (a partir dos logs origem='ia-uso') — valida a base de custo do SaaS.
export async function GET(req: Request) {
  const org = await orgDaRequest(req.headers.get('authorization'))
  const d30 = new Date(Date.now() - 30 * 864e5).toISOString()
  // pagina os logs de uso dos últimos 30 dias
  const linhas: any[] = []
  for (let p = 0; p < 20; p++) {
    const { data } = await sb.from('webhook_logs').select('evento, payload, recebido_em')
      .eq('origem', 'ia-uso').eq('org_id', org).gte('recebido_em', d30).order('recebido_em', { ascending: false })
      .range(p * 1000, p * 1000 + 999)
    if (!data || !data.length) break
    linhas.push(...data)
    if (data.length < 1000) break
  }

  const porEvento: Record<string, { chamadas: number; custo: number; input: number; output: number; cache_read: number }> = {}
  const porDia: Record<string, number> = {}
  let custoTotal = 0, chamadasTotal = 0
  for (const l of linhas) {
    const p = l.payload || {}
    const ev = l.evento || '?'
    const c = Number(p.custo_usd) || 0
    const e = porEvento[ev] = porEvento[ev] || { chamadas: 0, custo: 0, input: 0, output: 0, cache_read: 0 }
    e.chamadas++; e.custo += c; e.input += (p.input || 0); e.output += (p.output || 0); e.cache_read += (p.cache_read || 0)
    custoTotal += c; chamadasTotal++
    const dia = (l.recebido_em || '').slice(0, 10)
    porDia[dia] = (porDia[dia] || 0) + c
  }

  const dias = Object.keys(porDia).length || 1
  const eventos = Object.entries(porEvento).map(([evento, v]) => ({
    evento, chamadas: v.chamadas, custo_usd: Math.round(v.custo * 100) / 100,
    custo_medio: v.chamadas ? Math.round((v.custo / v.chamadas) * 1e4) / 1e4 : 0,
    tokens: v.input + v.output, cache_read: v.cache_read,
  })).sort((a, b) => b.custo_usd - a.custo_usd)

  return NextResponse.json({
    ok: true,
    total_chamadas: chamadasTotal,
    custo_total_usd: Math.round(custoTotal * 100) / 100,
    custo_medio_chamada: chamadasTotal ? Math.round((custoTotal / chamadasTotal) * 1e4) / 1e4 : 0,
    custo_dia_usd: Math.round((custoTotal / dias) * 100) / 100,
    projecao_mes_usd: Math.round((custoTotal / dias) * 30 * 100) / 100,
    por_evento: eventos,
    dias_com_dado: Object.keys(porDia).length,
  })
}
