// Recado Encantado: dados e ações do painel de acompanhamento. Protegido pela senha RECADO_PAINEL_SENHA (cabeçalho x-senha).
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'

const autorizado = (req: NextRequest) => !!process.env.RECADO_PAINEL_SENHA && req.headers.get('x-senha') === process.env.RECADO_PAINEL_SENHA
const sem = { headers: { 'Cache-Control': 'no-store' } }

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  try {
    const q = req.nextUrl.searchParams
    if (q.get('o') === 'pedido') {
      const id = String(q.get('id') || '').replace(/[^a-f0-9-]/g, '')
      const [p] = await db.busca('pedidos', `id=eq.${id}&select=*`)
      if (!p) return NextResponse.json({ erro: 'não achei' }, { status: 404 })
      const eventos = await db.busca('eventos', `pedido_id=eq.${id}&order=quando.asc`)
      const links: any = {}
      for (const k of ['foto_path', 'video_path', 'carta_path', 'certificado_path']) if (p[k]) links[k] = await db.linkAssinado(p[k], 3600).catch(() => null)
      return NextResponse.json({ pedido: p, eventos, links }, sem)
    }
    const desde = new Date(Date.now() - 30 * 86400e3).toISOString()
    const [pedidos, dias, maquina] = await Promise.all([
      db.busca('pedidos', `criado_em=gte.${desde}&order=criado_em.desc&limit=500&select=id,codigo,criado_em,personagem,pacote,preco,status,nome:crianca->>nome,responsavel:contato->>responsavel,pago_em,produzindo_em,entregue_em,forma_pagamento,taxa_gateway,custo,erro,tentativas,origem`),
      db.busca('resumo_dia', 'limit=30'),
      db.busca('maquina', 'id=eq.1'),
    ])
    return NextResponse.json({ pedidos, dias, maquina: maquina[0] || null, agora: new Date().toISOString() }, sem)
  } catch (e: any) {
    console.error('recado/painel', e)
    return NextResponse.json({ erro: String(e.message || e).slice(0, 200) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const b: any = await req.json()
  const id = String(b.id || '').replace(/[^a-f0-9-]/g, '')
  const muda: any = ({ refazer: { status: 'pago', erro: null }, reenviar: { status: 'revisao' }, cancelar: { status: 'cancelado' }, marcar_reembolsado: { status: 'reembolsado' } } as any)[b.acao]
  if (!muda || !id) return NextResponse.json({ erro: 'ação inválida' }, { status: 400 })
  await db.atualiza('pedidos', `id=eq.${id}`, muda)
  await db.evento(id, 'painel_' + b.acao, {})
  return NextResponse.json({ ok: true })
}
