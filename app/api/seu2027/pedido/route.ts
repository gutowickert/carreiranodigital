// Seu 2027: a pessoa preencheu nome, nascimento, e-mail e foco. Guarda o pedido (aguardando pagamento) e devolve o link do
// checkout da Kiwify com o código no ?sck= (é por ele que o aviso de compra acha o pedido).
import { NextRequest, NextResponse } from 'next/server'
import { db, novoCodigo } from '@/lib/seu2027/db'
import { calcular } from '@/lib/seu2027/calculos'
import { focoOk } from '@/lib/seu2027/entrega'
import { linkCheckout } from '@/lib/seu2027/kiwify'
import { PRECO } from '@/lib/seu2027/config'

const limpa = (s: any, n = 120) => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n)

export async function POST(req: NextRequest) {
  const b: any = await req.json().catch(() => ({}))
  const nome = limpa(b.nome, 80), email = limpa(b.email, 120).toLowerCase(), nascimento = String(b.nascimento || '')
  if (nome.length < 2) return NextResponse.json({ erro: 'Escreva o seu nome completo.' }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ erro: 'Confira o seu e-mail: é por ele que o mapa chega.' }, { status: 400 })
  try { calcular(nascimento) } catch { return NextResponse.json({ erro: 'Confira a data de nascimento.' }, { status: 400 }) }
  const o = b.origem || {}
  const origem: any = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'fbp', 'fbc']) if (o[k]) origem[k] = limpa(o[k], 300)
  origem.ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
  origem.ua = limpa(req.headers.get('user-agent'), 300) || null
  const p = { codigo: novoCodigo(), nome, email, nascimento, foco: focoOk(b.foco), preco: PRECO, origem }
  try {
    await db.insere(p)
  } catch (e) {
    // sem a tabela (ou banco fora do ar): a venda não para. Vai pro checkout sem o código; o aviso da Kiwify acha pelo e-mail
    // ou cria o pedido e pede a data por e-mail.
    console.error('seu2027/pedido', e)
    return NextResponse.json({ codigo: null, checkout: linkCheckout({ codigo: '', nome, email, origem }) })
  }
  return NextResponse.json({ codigo: p.codigo, checkout: linkCheckout({ codigo: p.codigo, nome, email, origem }) })
}
