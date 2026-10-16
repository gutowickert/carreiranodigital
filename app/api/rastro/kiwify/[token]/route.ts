// Rastro: o webhook da Kiwify. Um endereço secreto por projeto: /api/rastro/kiwify/<token> (o token está em rastro_projetos).
// Na Kiwify: Apps → Webhooks → Criar webhook, colar este endereço e marcar os eventos de compra (aprovada, reembolsada,
// chargeback, assinatura renovada…). Grava a venda (o mesmo pedido volta como reembolso/chargeback e atualiza a linha).
import { NextRequest, NextResponse } from 'next/server'
import { rastroDb, lerKiwify, avisa } from '@/lib/rastro'

type Ctx = { params: Promise<{ token: string }> }
const brl = (n: any) => n == null ? '' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params
  const p = await rastroDb.projetoPorToken(token).catch(() => null)
  if (!p) return NextResponse.json({ ok: false }, { status: 404 })
  let b: any = {}
  const texto = await req.text()
  try { b = JSON.parse(texto) } catch { try { b = Object.fromEntries(new URLSearchParams(texto)) } catch { b = {} } }
  // o botão "enviar teste" da Kiwify às vezes manda o corpo dentro de "order" ou "data"
  const corpo = b.order && typeof b.order === 'object' ? b.order : b.data && typeof b.data === 'object' && (b.data.order_id || b.data.id) ? b.data : b
  const v = lerKiwify(corpo, p.id)
  if (!v.pedido) return NextResponse.json({ ok: true, ignorado: 'sem número do pedido' })
  const antes = await rastroDb.vendaAtual(p.id, 'kiwify', v.pedido).catch(() => null)
  // não deixa um evento "pendente" (pix gerado) atrasado sobrescrever uma venda já aprovada
  if (antes && antes.status === 'aprovada' && ['pendente', 'abandonado', 'recusada'].includes(v.status)) return NextResponse.json({ ok: true, mantido: 'aprovada' })
  if (antes?.aprovado_em && v.status !== 'aprovada') v.aprovado_em = antes.aprovado_em // reembolso fica no dia da venda
  await rastroDb.salvaVenda(v)
  if (v.status === 'aprovada' && antes?.status !== 'aprovada')
    await avisa(`${p.nome}: venda ${brl(v.valor_bruto)}`, `${v.produto || 'produto'} · ${v.utm_content ? 'anúncio ' + String(v.utm_content).split('|')[0] : v.utm_source ? 'origem ' + v.utm_source : 'sem origem'}`)
  if (['reembolsada', 'chargeback'].includes(v.status) && antes?.status !== v.status)
    await avisa(`${p.nome}: ${v.status === 'chargeback' ? 'chargeback' : 'reembolso'} ${brl(v.valor_bruto)}`, v.produto || '')
  return NextResponse.json({ ok: true, status: v.status })
}

// a Kiwify às vezes confere o endereço com um GET antes de salvar
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params
  const p = await rastroDb.projetoPorToken(token).catch(() => null)
  return NextResponse.json({ ok: !!p })
}
