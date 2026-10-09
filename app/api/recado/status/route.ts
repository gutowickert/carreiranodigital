// Recado Encantado: a página da família consulta o andamento pelo código do pedido. Só devolve o necessário.
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'

const ETAPA: Record<string, string> = { aguardando_pagamento: 'Esperando o pagamento', pago: 'Pagamento confirmado: entrou na fila', produzindo: 'Os duendes estão gravando o vídeo', revisao: 'Dando os últimos retoques', entregue: 'Pronto!', falhou: 'Estamos refazendo com carinho, já já chega', cancelado: 'Pedido cancelado', reembolsado: 'Pedido reembolsado' }

export async function GET(req: NextRequest) {
  const c = String(req.nextUrl.searchParams.get('c') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!c) return NextResponse.json({ erro: 'sem código' }, { status: 400 })
  const [p] = await db.busca('pedidos', `codigo=eq.${c}&select=status,personagem,nome:crianca->>nome,video_path,carta_path,certificado_path,mensagem:roteiro->>mensagem_whatsapp`)
  if (!p) return NextResponse.json({ erro: 'pedido não encontrado' }, { status: 404 })
  const out: any = { status: p.status, etapa: ETAPA[p.status], personagem: p.personagem, nome: p.nome }
  if (p.status === 'entregue' && p.video_path) {
    out.video = await db.linkAssinado(p.video_path)
    if (p.certificado_path) out.certificado = await db.linkAssinado(p.certificado_path)
    if (p.carta_path) out.carta = await db.linkAssinado(p.carta_path)
    out.mensagem = p.mensagem
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
