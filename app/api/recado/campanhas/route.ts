// Recado Encantado: aba Campanhas do painel (11/10), em tempo real. Lê a Meta na hora (gasto, cliques por conjunto e anúncio)
// e cruza com o site: visitas (recado_funil), pedidos e vendas (utm_content = nome do anúncio; produto pelo conjunto).
// GET ?p=hoje|zero|7d · senha do painel (x-senha). Também grava o gasto do período nos lançamentos (o financeiro fica igual).
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { recadoConfig as cfg } from '@/lib/recado/config'
import { lerMeta, produtoDe, sincronizaGastos } from '@/lib/recado/meta-gasto'
import { hojeBR, isoBR } from '@/lib/periodos'
import { economia } from '@/lib/recado/economia'

export const maxDuration = 60
const sem = { headers: { 'Cache-Control': 'no-store' } }
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string

export async function GET(req: NextRequest) {
  if (!process.env.RECADO_PAINEL_SENHA || req.headers.get('x-senha') !== process.env.RECADO_PAINEL_SENHA) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  try {
    const INICIO = process.env.RECADO_PAINEL_INICIO || '2026-10-11T03:00:00.000Z'
    // 27/10 (painel novo): também ?desde=AAAA-MM-DD&ate=AAAA-MM-DD (o seletor de período do painel: hoje, 7d, 30d, este mês, datas)
    const q = req.nextUrl.searchParams, ehDia = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
    const p = q.get('p') || 'hoje', hoje = hojeBR(), qa = q.get('ate'), qd = q.get('desde')
    const ate = ehDia(qa) && qa < hoje ? qa : hoje
    const dia0 = ehDia(qd) ? [qd, ate].sort()[0] : p === '7d' ? isoBR(new Date(Date.now() - 6 * 86400e3)) : p === '30d' ? isoBR(new Date(Date.now() - 29 * 86400e3)) : p === 'zero' ? isoBR(new Date(INICIO)) : ate
    const desdeTs = [`${dia0}T03:00:00.000Z`, INICIO].sort().pop() as string   // nunca antes do ponto zero
    const desdeDia = desdeTs > `${dia0}T03:00:00.000Z` ? isoBR(new Date(desdeTs)) : dia0
    const dias = Math.max(1, Math.round((Date.parse(ate) - Date.parse(desdeDia)) / 86400e3) + 1)

    const [meta, pedidos, funil] = await Promise.all([
      lerMeta(desdeDia, ate),
      db.busca('pedidos', `criado_em=gte.${desdeTs}&limit=1000&select=codigo,personagem,pacote,preco,status,pago_em,origem`),
      fetch(`${U()}/rest/v1/rpc/recado_funil`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: desdeTs }) }).then(r => r.ok ? r.json() : []),
    ])
    sincronizaGastos(Math.min(dias, 30)).catch(() => null)   // mantém o financeiro em dia sem atrasar a tela
    if (!meta.ok) return NextResponse.json({ erro: meta.erro }, { status: 502 })

    const preco = (prod: string | null) => { if (!prod) return 0; const [a, b] = prod.split('/'); return (cfg.pacotes as any)[a]?.[b]?.preco || 0 }
    const nomeProd = (prod: string | null) => { if (!prod) return '(sem produto)'; const [a, b] = prod.split('/'); return (a === 'noel' ? 'Papai Noel · ' : '') + ((cfg.pacotes as any)[a]?.[b]?.nome || prod) }
    const campanhas = new Set(meta.linhas.map(l => l.campaign_name))
    const real = (x: any) => !x.origem?.teste && !x.origem?.cortesia
    const peds = (pedidos as any[]).filter(real), pagos = peds.filter(x => x.pago_em && !['cancelado', 'reembolsado', 'aguardando_pagamento'].includes(x.status))
    const doMeta = (x: any) => x.origem?.utm_source === 'meta' || campanhas.has(x.origem?.utm_campaign)

    // por conjunto (= produto) e por anúncio
    const conj = new Map<string, any>(), ads = new Map<string, any>()
    for (const l of meta.linhas) {
      const prod = produtoDe(l)
      const ck = l.campaign_name + '|' + l.adset_name   // 27/10: o mesmo nome de conjunto pode existir em duas campanhas
      const c = conj.get(ck) || { nome: l.adset_name, campanha: l.campaign_name, produto: prod, produtoNome: nomeProd(prod), gasto: 0, impressoes: 0, cliques: 0, lpv: 0 }
      c.gasto += l.gasto; c.impressoes += l.impressoes; c.cliques += l.cliques; c.lpv += l.visitas; conj.set(ck, c)
      const a = ads.get(l.ad_id) || { nome: l.ad_name, conjunto: l.adset_name, campanha: l.campaign_name, produto: prod, gasto: 0, impressoes: 0, cliques: 0 }
      a.gasto += l.gasto; a.impressoes += l.impressoes; a.cliques += l.cliques; ads.set(l.ad_id, a)
    }
    const visitasProd = (prod: string) => (funil as any[]).filter(f => f.produto === prod && f.evento === 'visita' && campanhas.has(f.campanha)).reduce((s, f) => s + (+f.visitantes || 0), 0)
    const fecha = (o: any, vendas: any[], pedidosN: number) => {
      const receita = vendas.reduce((s, x) => s + (+x.preco || 0), 0), pr = preco(o.produto)
      return { ...o, gasto: +o.gasto.toFixed(2), ctr: o.impressoes ? +(o.cliques / o.impressoes * 100).toFixed(2) : 0, cpc: o.cliques ? +(o.gasto / o.cliques).toFixed(2) : null,
        pedidos: pedidosN, vendas: vendas.length, receita: +receita.toFixed(2), cpa: vendas.length ? +(o.gasto / vendas.length).toFixed(2) : null,
        roas: o.gasto ? +(receita / o.gasto).toFixed(2) : null, preco: pr, teto: +(pr * economia.trafegoMax).toFixed(2) }
    }
    const conjuntos = [...conj.values()].map(c => ({ ...fecha(c, pagos.filter(x => doMeta(x) && `${x.personagem}/${x.pacote}` === c.produto), peds.filter(x => doMeta(x) && `${x.personagem}/${x.pacote}` === c.produto).length), visitas: c.produto ? visitasProd(c.produto) : 0 }))
      .sort((a, b) => b.gasto - a.gasto)
    const anuncios = [...ads.values()].map(a => fecha(a, pagos.filter(x => x.origem?.utm_content === a.nome), peds.filter(x => x.origem?.utm_content === a.nome).length)).sort((a, b) => b.gasto - a.gasto)
    const t = conjuntos.reduce((s, c) => ({ gasto: s.gasto + c.gasto, impressoes: s.impressoes + c.impressoes, cliques: s.cliques + c.cliques, visitas: s.visitas + c.visitas, pedidos: s.pedidos + c.pedidos, vendas: s.vendas + c.vendas, receita: s.receita + c.receita }), { gasto: 0, impressoes: 0, cliques: 0, visitas: 0, pedidos: 0, vendas: 0, receita: 0 })
    const total = { ...t, gasto: +t.gasto.toFixed(2), receita: +t.receita.toFixed(2), ctr: t.impressoes ? +(t.cliques / t.impressoes * 100).toFixed(2) : 0, cpc: t.cliques ? +(t.gasto / t.cliques).toFixed(2) : null, cpa: t.vendas ? +(t.gasto / t.vendas).toFixed(2) : null, roas: t.gasto ? +(t.receita / t.gasto).toFixed(2) : null }
    return NextResponse.json({ atualizado: new Date().toISOString(), periodo: p, desde: desdeTs, desdeDia, ate, conjuntos, anuncios, total, meta: { linhasConta: meta.brutas, linhasRecado: meta.linhas.length } }, sem)
  } catch (e: any) { return NextResponse.json({ erro: String(e.message || e).slice(0, 200) }, { status: 500 }) }
}
