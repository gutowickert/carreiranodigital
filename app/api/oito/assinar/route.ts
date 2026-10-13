// Oito Posts: abre a assinatura de R$ 197/mês no Asaas e devolve o link da primeira fatura.
// Sem chave do Asaas (modo local), a assinatura é simulada e a página mostra o botão "simular pagamento".
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { criaAssinatura, situacao, simulado, podeSimular } from '@/lib/oito/asaas'
import { linkCheckout } from '@/lib/oito/hotmart'

export const maxDuration = 30
const t = (s: any, n = 160) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
// confere os dígitos de CPF e CNPJ (o Asaas recusa os inválidos, mas a mensagem dele é ruim)
function docOk(d: string) {
  const n = d.replace(/\D/g, '').split('').map(Number)
  if (n.length === 11) {
    if (new Set(n).size === 1) return false
    const dv = (k: number) => { let s = 0; for (let i = 0; i < k; i++) s += n[i] * (k + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
    return dv(9) === n[9] && dv(10) === n[10]
  }
  if (n.length === 14) {
    if (new Set(n).size === 1) return false
    const dv = (k: number) => { const p = k === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = p.reduce((a, w, i) => a + w * n[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r }
    return dv(12) === n[12] && dv(13) === n[13]
  }
  return false
}

export async function POST(req: Request) {
  try {
    const b = await req.json()
    const c = b.c && (await db.um('clientes', { codigo: String(b.c).toUpperCase() }))
    if (!c) return NextResponse.json({ erro: 'Código não encontrado.' }, { status: 404 })
    if (c.status === 'ativo') return NextResponse.json({ ja: true })
    // marcas em espanhol (13/10): a cobrança é o checkout da Hotmart; o código vai no sck e volta no webhook
    if (cfg.marcas[c.marca as Marca].gateway === 'hotmart') {
      const url = linkCheckout(c.marca as Marca, c)
      if (!url) return NextResponse.json({ erro: 'El pago no está disponible ahora. Intenta de nuevo en unos minutos.' }, { status: 503 })
      if (c.status === 'teste') await db.atualiza('clientes', { id: c.id }, { status: 'aguardando_pagamento', gateway: 'hotmart' })
      await db.evento('assinatura_aberta', { cliente_id: c.id, marca: c.marca, detalhe: { gateway: 'hotmart' } })
      return NextResponse.json({ url })
    }
    // já tem assinatura aberta: devolve a fatura em aberto, não cria outra
    if (c.asaas_assinatura) {
      const s = await situacao(c.asaas_assinatura, c.pago_ate).catch(() => null)
      if (s && !s.cancelada) return NextResponse.json({ fatura: s.faturaAberta, simulado: c.asaas_assinatura.startsWith('sim-') })
    }
    if (simulado() && !podeSimular()) return NextResponse.json({ erro: 'O pagamento está fora do ar agora. Tenta de novo em alguns minutos.' }, { status: 503 })
    const nome = t(b.nome), documento = t(b.documento, 20).replace(/\D/g, ''), email = t(b.email).toLowerCase() || c.email
    if (!nome || !docOk(documento)) return NextResponse.json({ erro: 'Confere o nome e o CPF ou CNPJ.' }, { status: 400 })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ erro: 'Confere o e-mail: a fatura vai pra ele.' }, { status: 400 })
    const a = await criaAssinatura({ codigo: c.codigo, marcaNome: cfg.marcas[c.marca as Marca].nome, nome, documento, email, whatsapp: c.whatsapp, valor: cfg.marcas[c.marca as Marca].preco })
    await db.atualiza('clientes', { id: c.id }, { status: 'aguardando_pagamento', documento, email, asaas_customer: a.customer, asaas_assinatura: a.assinatura })
    await db.evento('assinatura_aberta', { cliente_id: c.id, marca: c.marca, detalhe: { simulado: simulado() } })
    return NextResponse.json({ fatura: a.fatura, simulado: simulado() })
  } catch (e: any) {
    console.error('oito assinar', e)
    return NextResponse.json({ erro: /cpfCnpj|CPF|CNPJ/i.test(e.message) ? 'O CPF ou CNPJ não foi aceito. Confere os números.' : 'Não deu pra abrir a fatura agora. Tenta de novo em um minuto.' }, { status: 500 })
  }
}
