// "Postar por mim" (14/10): o botão "Conectar meu Instagram" da área do cliente vem pra cá e segue pro login do Instagram.
//   GET ?c=CODIGO → 302 pro instagram.com (código e marca vão no state assinado) · sem app configurado → 503
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { igDisponivel, urlAutorizar } from '@/lib/oito/postar'

export async function GET(req: Request) {
  if (!igDisponivel()) return NextResponse.json({ erro: 'Em breve.' }, { status: 503 })
  const codigo = String(new URL(req.url).searchParams.get('c') || '').toUpperCase().trim()
  const c = codigo ? await db.um('clientes', { codigo }) : null
  if (!c) return NextResponse.json({ erro: 'Código não encontrado.' }, { status: 404 })
  // só assinante em dia (o teste vê o cartão como amostra do que vem na assinatura)
  if (c.status !== 'ativo') return NextResponse.redirect(cfg.url(c.marca as Marca, `conta.html?c=${c.codigo}&ig=assinatura`))
  await db.evento('ig_conectar_clicou', { cliente_id: c.id, marca: c.marca })
  return NextResponse.redirect(urlAutorizar(c.codigo, c.marca))
}
