// Recado Encantado: aviso da empresa de pagamento (Asaas manda o token no cabeçalho asaas-access-token).
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { recadoGateway as gateway } from '@/lib/recado/gateway'
import { avisaDono, nomeProduto, reais } from '@/lib/recado/avisa-dono'
import { enviaEmail, moldura, linkFamilia } from '@/lib/recado/email'
import { recadoConfig as cfg } from '@/lib/recado/config'

const QUEM: Record<string, string> = { noel: 'o Papai Noel', fada: 'a Fada do Dente', grandao: 'o Capitão Grandão', guardiao: 'o Guardião da Noite', coragem: 'a Capitã Coragem' }
function emailConfirmado(v: any) {
  const quem = QUEM[v.personagem] || 'o herói', missao = !!(cfg.pacotes as any)[v.personagem]?.[v.pacote]?.etapas
  const texto = /^acordo/.test(v.pacote)
    ? `O Acordo de Natal de ${v.nome} está agendado. O primeiro vídeo, a proposta do Papai Noel, aparece na página da família em até 2 horas (nunca entre 21h e 8h), e a gente te avisa por e-mail. Depois de mostrar pra criança, grava ela dizendo "eu aceito" (ou toca em "aceitou, mas ficou com vergonha de gravar") pela mesma página. No dia seguinte, às 18h, chega o vídeo do acordo firmado com a caderneta pra imprimir.`
    : missao
    ? `A missão de ${v.nome} está agendada. Cada vídeo de ${quem} aparece na página da família no dia certo, sempre entre 7h e 21h, e a gente te manda um e-mail a cada um. Na mesma página tem o guia de como ajudar e, depois de cada vídeo, os botões pra contar como foi: o vídeo seguinte responde a isso.`
    : `${quem.charAt(0).toUpperCase() + quem.slice(1)} já está preparando o recado de ${v.nome}. Em até 2 horas o vídeo aparece na página da família, junto com o que mais fizer parte do pedido, e a gente te manda outro e-mail avisando. Tu não precisa fazer nada.`
  return moldura('Pagamento confirmado!', texto + ' Se não achar nossos e-mails, olha a caixa de spam ou de promoções.', 'Abrir a página da família', linkFamilia(v.codigo))
}

export async function POST(req: NextRequest) {
  const seg = process.env.RECADO_WEBHOOK_SEGREDO
  if (!seg || (req.nextUrl.searchParams.get('s') !== seg && req.headers.get('asaas-access-token') !== seg)) return new NextResponse(null, { status: 401 })
  try {
    const corpo: any = await req.json()
    let a: any = gateway.lerAviso(corpo)
    if (gateway.nome() === 'mercadopago') {
      if (!a.mp_id) return NextResponse.json({ ok: true })
      const pg: any = await (await fetch('https://api.mercadopago.com/v1/payments/' + a.mp_id, { headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN } })).json()
      a = { codigo: pg.external_reference, pago: pg.status === 'approved', forma: pg.payment_type_id, taxa: (pg.fee_details || []).reduce((s: number, f: any) => s + f.amount, 0) }
    }
    // a conta do Asaas é a da escola: aviso de cobrança que não é do Recado passa direto (responde ok pra não travar a fila do Asaas)
    if (!a.codigo && !a.link) return NextResponse.json({ ok: true })
    let [p] = a.codigo ? await db.busca('pedidos', `codigo=eq.${encodeURIComponent(a.codigo)}&select=id,status`) : []
    if (!p && a.link) [p] = await db.busca('pedidos', `gateway_id=eq.${encodeURIComponent(a.link)}&select=id,status`)
    if (!p) return NextResponse.json({ ok: true })
    await db.evento(p.id, 'aviso_pagamento', { pago: a.pago, forma: a.forma })
    if (a.pago && p.status === 'aguardando_pagamento') {
      await db.atualiza('pedidos', `id=eq.${p.id}`, { status: 'pago', pago_em: new Date().toISOString(), forma_pagamento: a.forma || null, taxa_gateway: a.taxa ?? null })
      await db.evento(p.id, 'pago', { forma: a.forma })
      // acordo de Natal com irmão (24/10): os pedidos das outras crianças (sem preço, ligados a este) entram na produção junto
      const [cp] = await db.busca('pedidos', `id=eq.${p.id}&select=codigo,pacote`).catch(() => [])
      if (cp && /^acordo/.test(cp.pacote)) await db.atualiza('pedidos', `origem->>irmao_de=eq.${encodeURIComponent(cp.codigo)}&status=eq.aguardando_pagamento`, { status: 'pago', pago_em: new Date().toISOString(), forma_pagamento: a.forma || null }).catch(() => null)
      // aviso de VENDA no celular do Guto (pedido de teste não avisa)
      const [v] = await db.busca('pedidos', `id=eq.${p.id}&select=codigo,personagem,pacote,preco,origem,contato,nome:crianca->>nome`).catch(() => [])
      // 11/10: a família recebe na hora o "pagamento confirmado" dizendo exatamente como e quando chega
      if (v?.contato?.email) await enviaEmail(v.contato.email, `Pagamento confirmado: o recado de ${v.nome} está a caminho`, emailConfirmado(v)).catch(() => null)
      if (v && !v.origem?.teste) await avisaDono('💰 VENDA!', `${nomeProduto(v.personagem, v.pacote)} · ${reais(v.preco)}${a.forma ? ' (' + a.forma + ')' : ''}\nCriança: ${v.nome}\nCampanha: ${v.origem?.utm_campaign || '(direto/orgânico)'}\nPedido ${v.codigo}`, 'moneybag').catch(() => null)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('recado/pagamento', e)
    return new NextResponse(null, { status: 500 })
  }
}
