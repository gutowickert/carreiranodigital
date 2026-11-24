// Seu 2027: aviso de compra da Kiwify (configurar na Kiwify: Apps > Webhooks, eventos "Compra aprovada" e "Reembolso"/"Chargeback").
// A assinatura (?signature=) é conferida com KIWIFY_WEBHOOK_TOKEN. Compra aprovada -> pedido pago -> gera o mapa e manda o e-mail.
import { NextRequest, NextResponse, after } from 'next/server'
import { db, novoCodigo } from '@/lib/seu2027/db'
import { assinaturaOk, lerAviso } from '@/lib/seu2027/kiwify'
import { liberar, enviaEmail, emailCompletar } from '@/lib/seu2027/entrega'
import { enviaPurchase } from '@/lib/seu2027/capi'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const bruto = await req.text()
  const sig = req.nextUrl.searchParams.get('signature')
  let corpo: any = null
  try { corpo = JSON.parse(bruto) } catch { return NextResponse.json({ erro: 'corpo inválido' }, { status: 400 }) }
  // a Kiwify assina o JSON do pedido; confere o corpo como chegou e, por garantia, o JSON remontado
  if (!assinaturaOk(bruto, sig) && !assinaturaOk(JSON.stringify(corpo), sig)) return new NextResponse(null, { status: 401 })
  const a = lerAviso(corpo)
  try {
    // acha o pedido: 1) pelo código (sck), 2) pelo pedido da Kiwify (aviso repetido), 3) pelo e-mail (o mais recente aguardando)
    let p: any = a.sck ? await db.porCodigo(a.sck) : null
    if (!p && a.pedidoKiwify) [p] = await db.busca(`kiwify_pedido=eq.${encodeURIComponent(a.pedidoKiwify)}&limit=1`)
    if (!p && a.email) [p] = await db.busca(`email=eq.${encodeURIComponent(a.email)}&status=eq.aguardando_pagamento&order=criado_em.desc&limit=1`)

    if (a.estorno) {
      if (p) await db.atualiza(`id=eq.${p.id}`, { status: 'reembolsado', kiwify: corpo })
      return NextResponse.json({ ok: true })
    }
    if (!a.pago) { if (p) await db.atualiza(`id=eq.${p.id}`, { kiwify: corpo }); return NextResponse.json({ ok: true }) }

    const pago = { kiwify_pedido: a.pedidoKiwify || null, kiwify: corpo, forma_pagamento: a.forma, valor_pago: a.valor, produtos: a.produto ? [a.produto] : [] }
    if (!p) {
      // compra que não passou pelo nosso formulário: cria o pedido sem nascimento e pede o dado por e-mail
      p = await db.insere({ codigo: novoCodigo(), nome: a.nome, email: a.email, status: 'falta_dados', pago_em: new Date().toISOString(), origem: { ...a.utm, sem_formulario: true }, ...pago })
      await enviaEmail(a.email, 'Falta só a sua data de nascimento para o seu mapa de 2027', emailCompletar(a.nome, p.codigo))
    } else if (p.status === 'aguardando_pagamento') {
      await db.atualiza(`id=eq.${p.id}`, { status: p.nascimento ? 'pago' : 'falta_dados', pago_em: new Date().toISOString(), ...pago })
    } else {
      // aviso repetido, ou de outro produto do mesmo pedido (bump/upsell): só anota o produto
      if (a.produto && !(p.produtos || []).includes(a.produto)) await db.atualiza(`id=eq.${p.id}`, { produtos: [...(p.produtos || []), a.produto] })
      return NextResponse.json({ ok: true })
    }
    const codigo = p.codigo
    // depois de responder (a Kiwify não espera os ~30 s da IA): Purchase na Meta pelo servidor e o mapa
    after(async () => {
      const v = await db.porCodigo(codigo)
      if (v && !v.capi_enviado_em) {
        const r = await enviaPurchase({ codigo, valor: +(v.valor_pago || v.preco), email: v.email, nome: v.nome, origem: v.origem })
        if (r.ok) await db.atualiza(`id=eq.${v.id}`, { capi_enviado_em: new Date().toISOString() })
      }
      if (v?.status === 'pago') await liberar(codigo)
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('seu2027/kiwify', e)
    return new NextResponse(null, { status: 500 })   // a Kiwify tenta de novo
  }
}
