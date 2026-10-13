// Oito Posts: confere pagamentos no Asaas (sem webhook novo).
//   POST {s: senha}             → passa por todos os assinantes (o trabalhador chama a cada 10 min)
//   POST {c, simular: true}     → só no modo local: finge o pagamento da fatura
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { senhaOk } from '@/lib/oito/config'
import { sincronizaPagamento, garanteLoteDoCiclo } from '@/lib/oito/servico'
import { asaasHoje, asaasMaisUmMes } from '@/lib/oito/asaas'

export const maxDuration = 60

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  // assinatura "sim-" só nasce quando não há chave do Asaas (teste local); em produção nunca existe
  if (b.simular && !process.env.ASAAS_API_KEY) {
    const c = await db.um('clientes', { codigo: String(b.c || '').toUpperCase() })
    if (!c || !String(c.asaas_assinatura || '').startsWith('sim-')) return NextResponse.json({ erro: 'sem assinatura simulada' }, { status: 400 })
    const pagoAte = asaasMaisUmMes(asaasHoje())
    await db.atualiza('clientes', { id: c.id }, { status: 'ativo', pago_ate: pagoAte })
    await garanteLoteDoCiclo({ ...c, status: 'ativo', pago_ate: pagoAte }, pagoAte)
    return NextResponse.json({ ok: true })
  }
  if (!senhaOk(b.s || req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const todos = (await db.lista('clientes', {})).filter(c => c.asaas_assinatura && c.status !== 'cancelado')
  const res: any[] = []
  for (const c of todos) {
    const antes = c.status
    try { await sincronizaPagamento(c); if (c.status !== antes) res.push({ codigo: c.codigo, de: antes, para: c.status }) }
    catch (e: any) { res.push({ codigo: c.codigo, erro: e.message.slice(0, 120) }) }
  }
  await db.atualiza('estado', { chave: 'pagamentos' }, { valor: { em: new Date().toISOString(), conferidos: todos.length } }).then(async r => { if (!r.length) await db.insere('estado', { chave: 'pagamentos', valor: { em: new Date().toISOString(), conferidos: todos.length } }) }).catch(() => null)
  return NextResponse.json({ conferidos: todos.length, mudancas: res })
}
