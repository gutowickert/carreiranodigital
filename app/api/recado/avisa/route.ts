// Recado Encantado: o trabalhador (no PC) pede pro site mandar o e-mail de "o vídeo chegou" pra família.
// A chave do e-mail fica só aqui na Vercel. Protegido pela senha do painel (cabeçalho x-senha).
// POST { codigo, assunto?, titulo?, texto? }
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { enviaEmail, moldura, linkFamilia } from '@/lib/recado/email'

export async function POST(req: NextRequest) {
  if (!process.env.RECADO_PAINEL_SENHA || req.headers.get('x-senha') !== process.env.RECADO_PAINEL_SENHA) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const b: any = await req.json().catch(() => ({}))
  const c = String(b.codigo || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  const [p] = await db.busca('pedidos', `codigo=eq.${c}&select=id,codigo,contato,nome:crianca->>nome`)
  if (!p) return NextResponse.json({ erro: 'pedido não encontrado' }, { status: 404 })
  const limpa = (s: any, n: number) => String(s || '').replace(/[<>]/g, '').slice(0, n)
  const titulo = limpa(b.titulo, 80) || 'O recado chegou!'
  const texto = limpa(b.texto, 400) || `O vídeo de ${p.nome} está pronto na página da família. Dá o play junto com a criança e filma a reação.`
  const em = await enviaEmail(p.contato?.email, limpa(b.assunto, 120) || `O recado de ${p.nome} chegou`, moldura(titulo, texto, 'Ver o vídeo', linkFamilia(p.codigo)))
  await db.evento(p.id, 'email_aviso', em).catch(() => {})
  return NextResponse.json(em)
}
