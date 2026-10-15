// Oito Posts (15/10): diagnóstico das campanhas das marcas na Meta (só leitura).
// Os cliques baratos do Salão (14% de CTR, R$ 0,06, quase nenhuma visita) têm cara de Audience Network: aqui dá pra conferir.
//   GET (x-senha) → os conjuntos ativos das campanhas das marcas: posicionamentos, otimização e o dia de hoje por plataforma/posição
import { NextResponse } from 'next/server'
import { senhaOk } from '@/lib/oito/config'

export const maxDuration = 60
const GRAPH = 'https://graph.facebook.com/v25.0'
const TOKEN = () => process.env.FB_ADS_TOKEN || ''
const CONTA = () => 'act_' + String(process.env.OITO_META_CONTA || process.env.RECADO_META_CONTA || '').replace(/\D/g, '')
const MARCA = /SALAO\s*NO\s*FEED|PRATO\s*NO\s*FEED|PATA\s*NO\s*FEED|SALAONOFEED|PRATONOFEED|PATANOFEED/i

const g = async (caminho: string) => {
  const r = await fetch(`${GRAPH}/${caminho}${caminho.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN())}`, { cache: 'no-store' })
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j
}

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  try {
    const j = await g(`${CONTA()}/adsets?fields=id,name,campaign{name},effective_status,optimization_goal,billing_event,targeting,destination_type&limit=100&effective_status=["ACTIVE"]`)
    const out = []
    for (const a of (j.data || []).filter((a: any) => MARCA.test(a.campaign?.name || ''))) {
      const ins = await g(`${a.id}/insights?fields=impressions,clicks,inline_link_clicks,spend,actions&breakdowns=publisher_platform,platform_position&date_preset=today`).catch((e: any) => ({ data: [], erro: e.message }))
      const t = a.targeting || {}
      out.push({ id: a.id, campanha: a.campaign?.name, conjunto: a.name, otimizacao: a.optimization_goal, cobranca: a.billing_event, destino: a.destination_type,
        plataformas: t.publisher_platforms || 'automático (Advantage+)', posicoes: { facebook: t.facebook_positions, instagram: t.instagram_positions, messenger: t.messenger_positions, audience_network: t.audience_network_positions },
        hoje: (ins.data || []).map((x: any) => ({ onde: `${x.publisher_platform}/${x.platform_position}`, impressoes: +x.impressions, cliques: +x.clicks, cliques_link: +(x.inline_link_clicks || 0), gasto: +x.spend,
          visitas_pagina: +((x.actions || []).find((y: any) => y.action_type === 'landing_page_view')?.value || 0) })) })
    }
    return NextResponse.json({ conjuntos: out })
  } catch (e: any) { return NextResponse.json({ erro: e.message }, { status: 500 }) }
}
