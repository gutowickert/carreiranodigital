// Recado Encantado: dados e ações do painel do negócio. Protegido pela senha RECADO_PAINEL_SENHA (cabeçalho x-senha).
// GET ?o=tudo&dias=N  -> pedidos, funil do site (somado no banco), gastos de anúncio, custos fixos, metas, preços e custo padrão
// GET ?o=pedido&id=   -> um pedido com eventos e links
// POST {acao, ...}    -> ações nos pedidos e lançamentos (gasto, custo fixo, meta)
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { recadoConfig as cfg } from '@/lib/recado/config'
import { economia, custoPadrao } from '@/lib/recado/economia'

const autorizado = (req: NextRequest) => !!process.env.RECADO_PAINEL_SENHA && req.headers.get('x-senha') === process.env.RECADO_PAINEL_SENHA
const sem = { headers: { 'Cache-Control': 'no-store' } }
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const rpc = async (fn: string, args: any) => {
  const r = await fetch(`${U()}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  if (!r.ok) throw new Error('banco ' + r.status + ': ' + (await r.text()).slice(0, 200)); return r.json()
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  try {
    const q = req.nextUrl.searchParams
    if (q.get('o') === 'pedido') {
      const id = String(q.get('id') || '').replace(/[^a-f0-9-]/g, '')
      const [p] = await db.busca('pedidos', `id=eq.${id}&select=*`)
      if (!p) return NextResponse.json({ erro: 'não achei' }, { status: 404 })
      const eventos = await db.busca('eventos', `pedido_id=eq.${id}&order=quando.asc`)
      const etapas = await db.busca('etapas', `pedido_id=eq.${id}&order=ordem.asc&select=ordem,tipo,quando,status,resposta`).catch(() => [])
      const caminho = p.visitante ? await db.busca('site_eventos', `visitante=eq.${encodeURIComponent(p.visitante)}&order=quando.asc&limit=60&select=quando,evento,pagina,utm_campaign`) : []
      const links: any = {}
      for (const k of ['foto_path', 'video_path', 'carta_path', 'certificado_path']) if (p[k]) links[k] = await db.linkAssinado(p[k], 3600).catch(() => null)
      return NextResponse.json({ pedido: p, eventos, etapas, caminho, links }, sem)
    }
    const dias = Math.max(1, Math.min(400, +(q.get('dias') || 90)))
    const desde = new Date(Date.now() - dias * 86400e3).toISOString()
    const [pedidos, maquina, funil, funilDia, gastos, fixos, metas] = await Promise.all([
      db.busca('pedidos', `criado_em=gte.${desde}&order=criado_em.desc&limit=1000&select=id,codigo,criado_em,personagem,pacote,preco,status,nome:crianca->>nome,responsavel:contato->>responsavel,pago_em,produzindo_em,entregue_em,forma_pagamento,taxa_gateway,custo,erro,tentativas,origem,visitante`),
      db.busca('maquina', 'id=eq.1'),
      rpc('recado_funil', { desde }),
      rpc('recado_funil_dia', { desde }),
      db.busca('gastos', `dia=gte.${desde.slice(0, 10)}&order=dia.desc&limit=1000`),
      db.busca('custos_fixos', 'order=inicio.desc&limit=200'),
      db.busca('metas', 'order=mes.desc&limit=24'),
    ])
    // preço e custo padrão de cada produto, pra o painel calcular margem mesmo antes do vídeo existir
    const produtos: any = {}
    for (const [per, pacs] of Object.entries(cfg.pacotes)) for (const [pac, v] of Object.entries(pacs as any)) produtos[`${per}/${pac}`] = { nome: (per === 'noel' ? 'Papai Noel · ' : '') + (v as any).nome, preco: (v as any).preco, custoPadrao: custoPadrao(`${per}/${pac}`) }
    return NextResponse.json({ pedidos, maquina: maquina[0] || null, funil, funilDia, gastos, fixos, metas, produtos, regras: { custoMax: economia.custoMax, trafegoMin: economia.trafegoMin, trafegoMax: economia.trafegoMax }, dias, agora: new Date().toISOString() }, sem)
  } catch (e: any) {
    console.error('recado/painel', e)
    return NextResponse.json({ erro: String(e.message || e).slice(0, 200) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const b: any = await req.json()
  const num = (v: any) => { const n = +String(v ?? '').replace(',', '.'); return Number.isFinite(n) ? n : null }
  const dia = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null
  const txt = (v: any, n = 120) => String(v || '').replace(/[<>]/g, '').trim().slice(0, n)
  try {
    if (b.acao === 'gasto_add') {
      const valor = num(b.valor); if (!dia(b.dia) || valor == null) return NextResponse.json({ erro: 'dia e valor' }, { status: 400 })
      await db.insere('gastos', { dia: b.dia, canal: txt(b.canal, 30) || 'meta', campanha: txt(b.campanha), produto: txt(b.produto, 40) || null, valor, impressoes: num(b.impressoes), cliques: num(b.cliques), obs: txt(b.obs, 200) || null })
      return NextResponse.json({ ok: true })
    }
    if (b.acao === 'gasto_del') { await fetch(`${U()}/rest/v1/recado_gastos?id=eq.${+b.id}`, { method: 'DELETE', headers: { apikey: K(), Authorization: 'Bearer ' + K() } }); return NextResponse.json({ ok: true }) }
    if (b.acao === 'fixo_add') {
      const valor = num(b.valor); if (!txt(b.nome) || valor == null) return NextResponse.json({ erro: 'nome e valor' }, { status: 400 })
      await db.insere('custos_fixos', { nome: txt(b.nome), valor_mensal: valor, inicio: dia(b.inicio) || new Date().toISOString().slice(0, 10), obs: txt(b.obs, 200) || null })
      return NextResponse.json({ ok: true })
    }
    if (b.acao === 'fixo_fim') { await db.atualiza('custos_fixos', `id=eq.${+b.id}`, { fim: new Date().toISOString().slice(0, 10) }); return NextResponse.json({ ok: true }) }
    if (b.acao === 'meta_set') {
      const mes = dia(b.mes); if (!mes) return NextResponse.json({ erro: 'mês' }, { status: 400 })
      const linha = { mes: mes.slice(0, 8) + '01', faturamento: num(b.faturamento), pedidos: num(b.pedidos), margem_pct: num(b.margem_pct), trafego_pct: num(b.trafego_pct), obs: txt(b.obs, 200) || null }
      await fetch(`${U()}/rest/v1/recado_metas`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(linha) })
      return NextResponse.json({ ok: true })
    }
    const id = String(b.id || '').replace(/[^a-f0-9-]/g, '')
    const muda: any = ({ refazer: { status: 'pago', erro: null }, reenviar: { status: 'revisao' }, cancelar: { status: 'cancelado' }, marcar_reembolsado: { status: 'reembolsado' } } as any)[b.acao]
    if (!muda || !id) return NextResponse.json({ erro: 'ação inválida' }, { status: 400 })
    await db.atualiza('pedidos', `id=eq.${id}`, muda)
    await db.evento(id, 'painel_' + b.acao, {})
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ erro: String(e.message || e).slice(0, 200) }, { status: 500 }) }
}
