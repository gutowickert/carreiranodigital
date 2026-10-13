// Oito Posts: a página do cliente (teste e área do assinante) lê e age por aqui, só com o código.
//   GET ?c=CODIGO                         → a vista do cliente (posts com link, lotes, status)
//   POST {c, acao:'liberar'}              → as fotos subiram: o teste entra na fila
//   POST {c, acao:'ajuste', post, texto}  → refaz um post com o pedido dele (limite por mês)
//   POST {c, acao:'contexto', ...}        → atualiza o que ele contou do negócio
//   POST {c, acao:'suporte', texto}       → mensagem pro painel
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { vistaCliente, sincronizaPagamento, avisaDono } from '@/lib/oito/servico'
import { oitoConfig as cfg } from '@/lib/oito/config'
import { cancelaAssinatura } from '@/lib/oito/asaas'

export const maxDuration = 30
const t = (s: any, n = 300) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
const acha = (c: any) => (c ? db.um('clientes', { codigo: String(c).toUpperCase().trim() }) : null)

export async function GET(req: Request) {
  const u = new URL(req.url)
  let c = await acha(u.searchParams.get('c'))
  if (!c) return NextResponse.json({ erro: 'Código não encontrado.' }, { status: 404 })
  // quem voltou da fatura: confere o pagamento na hora (no máximo a cada 20 s por cliente)
  if (c.asaas_assinatura && u.searchParams.get('pag') === '1') c = await sincronizaPagamento(c).catch(() => c)
  return NextResponse.json(await vistaCliente(c), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  try {
    const b = await req.json()
    const c = await acha(b.c)
    if (!c) return NextResponse.json({ erro: 'Código não encontrado.' }, { status: 404 })

    if (b.acao === 'liberar') {
      await db.atualiza('lotes', { cliente_id: c.id, tipo: 'teste', status: 'espera' }, { status: 'fila' })
      await db.evento('teste_na_fila', { cliente_id: c.id, marca: c.marca })
      return NextResponse.json({ ok: true })
    }

    if (b.acao === 'ajuste') {
      const v = await vistaCliente(c)
      if (c.status !== 'ativo') return NextResponse.json({ erro: 'Os ajustes são pra quem assina. No teste, os 2 posts vão como saíram.' }, { status: 403 })
      if (v.ajustes_restantes <= 0) return NextResponse.json({ erro: `Os ${cfg.ajustesPorMes} ajustes deste mês já foram usados.` }, { status: 403 })
      const p = await db.um('posts', { id: String(b.post), cliente_id: c.id })
      const texto = t(b.texto, 500)
      if (!p || !texto) return NextResponse.json({ erro: 'Escreve o que tu queres mudar.' }, { status: 400 })
      if (p.status === 'ajuste_pedido') return NextResponse.json({ erro: 'Esse post já está sendo refeito.' }, { status: 409 })
      await db.atualiza('posts', { id: p.id }, { status: 'ajuste_pedido', ajuste_pedido: texto })
      await db.insere('lotes', { cliente_id: c.id, tipo: 'ajuste', mes: p.id, qtd: 1, status: 'fila' })
      await db.evento('ajuste_pedido', { cliente_id: c.id, marca: c.marca, detalhe: { post: p.id, texto } })
      return NextResponse.json({ ok: true })
    }

    if (b.acao === 'contexto') {
      const x = b.contexto || {}, novo = { ...(c.contexto || {}) }
      for (const k of ['servicos', 'carro_chefe', 'diferencial', 'publico', 'preco_medio', 'tom', 'evitar', 'horario', 'extra', 'novidades']) if (k in x) novo[k] = t(x[k], 600)
      await db.atualiza('clientes', { id: c.id }, { contexto: novo, ...(b.fotos_modo === 'ia' || b.fotos_modo === 'enviar' ? { fotos_modo: b.fotos_modo } : {}) })
      await db.evento('contexto_editado', { cliente_id: c.id, marca: c.marca })
      return NextResponse.json({ ok: true })
    }

    // sem fidelidade: o próprio cliente cancela; o que já pagou vale até o fim do período
    if (b.acao === 'cancelar') {
      if (c.asaas_assinatura) await cancelaAssinatura(c.asaas_assinatura).catch(() => null)
      await db.atualiza('clientes', { id: c.id }, { status: 'cancelado' })
      await db.evento('cancelou', { cliente_id: c.id, marca: c.marca, detalhe: { por: 'cliente', motivo: t(b.motivo, 500) } })
      if (!c.exemplo) avisaDono('cancelamento', `${c.nome_negocio} (${c.cidade})${b.motivo ? ': ' + t(b.motivo, 150) : ''}`)
      return NextResponse.json({ ok: true })
    }

    if (b.acao === 'suporte') {
      const texto = t(b.texto, 1500)
      if (!texto) return NextResponse.json({ erro: 'Escreve a mensagem.' }, { status: 400 })
      await db.evento('suporte', { cliente_id: c.id, marca: c.marca, detalhe: { texto, respondido: false } })
      avisaDono('mensagem de cliente', `${c.nome_negocio}: ${texto.slice(0, 200)}`)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ erro: 'ação' }, { status: 400 })
  } catch (e: any) {
    console.error('oito cliente', e)
    return NextResponse.json({ erro: 'Não deu agora. Tenta de novo.' }, { status: 500 })
  }
}
