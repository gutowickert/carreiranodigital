// Oito Posts (16/10): diagnóstico do Asaas (só leitura). As últimas faturas "o cliente escolhe" (UNDEFINED),
// pra abrir o link e conferir se a página mostra Pix e cartão.
//   GET (x-senha) → [{ id, valor, status, vencimento, descricao, link }]
import { NextResponse } from 'next/server'
import { senhaOk } from '@/lib/oito/config'

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const r = await fetch('https://api.asaas.com/v3/payments?billingType=UNDEFINED&limit=10', {
    headers: { access_token: process.env.ASAAS_API_KEY as string, 'User-Agent': 'oito-posts' }, cache: 'no-store',
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return NextResponse.json({ erro: 'Asaas ' + r.status }, { status: 502 })
  return NextResponse.json((j.data || []).map((p: any) => ({ id: p.id, valor: p.value, status: p.status, vencimento: p.dueDate, descricao: p.description, link: p.invoiceUrl })))
}
