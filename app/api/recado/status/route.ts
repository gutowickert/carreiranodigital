// Recado Encantado: a página da família consulta o andamento pelo código do pedido. Só devolve o necessário.
// Missões (09/10): devolve também as etapas (um vídeo por dia) e recebe a resposta da mãe (POST: cumpriu / tentou / ainda_nao).
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'

const ETAPA: Record<string, string> = { aguardando_pagamento: 'Esperando o pagamento', pago: 'Pagamento confirmado: entrou na fila', produzindo: 'Os duendes estão gravando o vídeo', em_missao: 'Missão em andamento', revisao: 'Dando os últimos retoques', entregue: 'Pronto!', falhou: 'Estamos refazendo com carinho, já já chega', cancelado: 'Pedido cancelado', reembolsado: 'Pedido reembolsado' }
const sem = { headers: { 'Cache-Control': 'no-store' } }
const cod = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')

export async function GET(req: NextRequest) {
  const c = cod(req.nextUrl.searchParams.get('c'))
  if (!c) return NextResponse.json({ erro: 'sem código' }, { status: 400 })
  const [p] = await db.busca('pedidos', `codigo=eq.${c}&select=id,status,personagem,pacote,preco,checkout_url,nome:crianca->>nome,video_path,carta_path,certificado_path,mensagem:roteiro->>mensagem_whatsapp`)
  if (!p) return NextResponse.json({ erro: 'pedido não encontrado' }, { status: 404 })
  const out: any = { status: p.status, etapa: ETAPA[p.status], personagem: p.personagem, pacote: p.pacote, nome: p.nome, preco: +p.preco || 0 }
  if (p.status === 'aguardando_pagamento') out.pagar = p.checkout_url   // a página do pedido mostra o botão Pagar agora
  const etapas = await db.busca('etapas', `pedido_id=eq.${p.id}&order=ordem.asc&select=ordem,tipo,quando,status,resposta,video_path,extras`).catch(() => [])
  if (etapas.length) {
    out.etapas = await Promise.all(etapas.map(async (e: any) => ({ ordem: e.ordem, tipo: e.tipo, quando: e.quando, status: e.status, resposta: e.resposta,
      video: e.status === 'entregue' && e.video_path ? await db.linkAssinado(e.video_path) : null,
      kit: e.status === 'entregue' && e.extras?.kit_path ? await db.linkAssinado(e.extras.kit_path) : null,
      certificado: e.status === 'entregue' && e.extras?.certificado_path ? await db.linkAssinado(e.extras.certificado_path) : null })))
  } else if (p.status === 'entregue' && p.video_path) {
    out.video = await db.linkAssinado(p.video_path)
    if (p.certificado_path) out.certificado = await db.linkAssinado(p.certificado_path)
    if (p.carta_path) out.carta = await db.linkAssinado(p.carta_path)
    out.mensagem = p.mensagem
  }
  return NextResponse.json(out, sem)
}

// a mãe conta como foi depois de um vídeo da missão; o próximo vídeo responde a isso
export async function POST(req: NextRequest) {
  const b: any = await req.json().catch(() => ({}))
  const c = cod(b.c), ordem = Math.floor(+b.ordem), resposta = String(b.resposta || '')
  if (!c || !ordem || !['cumpriu', 'tentou', 'ainda_nao'].includes(resposta)) return NextResponse.json({ erro: 'resposta inválida' }, { status: 400 })
  const [p] = await db.busca('pedidos', `codigo=eq.${c}&select=id`)
  if (!p) return NextResponse.json({ erro: 'pedido não encontrado' }, { status: 404 })
  const r = await db.atualiza('etapas', `pedido_id=eq.${p.id}&ordem=eq.${ordem}&status=eq.entregue`, { resposta, respondida_em: new Date().toISOString() })
  if (!r?.length) return NextResponse.json({ erro: 'esse vídeo ainda não foi entregue' }, { status: 409 })
  await db.evento(p.id, 'resposta_mae', { ordem, resposta })
  return NextResponse.json({ ok: true }, sem)
}
