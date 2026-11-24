// Seu 2027: "perdi o link" ou voltei da Kiwify sem o código. Manda o link do mapa pro e-mail da compra (nunca mostra na tela).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/seu2027/db'
import { enviaEmail, emailMapa, emailCompletar } from '@/lib/seu2027/entrega'

export async function POST(req: NextRequest) {
  const b: any = await req.json().catch(() => ({}))
  const email = String(b.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ erro: 'Confira o e-mail.' }, { status: 400 })
  const [p] = await db.busca(`email=eq.${encodeURIComponent(email)}&status=in.(pago,falta_dados,gerando,pronto,erro)&order=criado_em.desc&limit=1`).catch(() => [])
  if (p) {
    const falta = p.status === 'falta_dados'
    await enviaEmail(email, falta ? 'Falta só a sua data de nascimento para o seu mapa de 2027' : 'O link do seu mapa de 2027', falta ? emailCompletar(p.nome, p.codigo) : emailMapa(p.nome, p.codigo))
  }
  return NextResponse.json({ ok: true })   // responde igual achando ou não (não revela quem comprou)
}
