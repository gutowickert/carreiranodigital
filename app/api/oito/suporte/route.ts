// Oito Posts: o suporte.
//   Cliente:  GET ?c=CODIGO (chamados dele, com as mensagens) · GET ?ch=ID (chamado aberto pelo site)
//             POST {c? | ch?, marca, texto, nome?, contato?, origem?}   → abre ou continua o chamado; a IA responde na hora
//   Dono (x-senha): GET ?dono=1&ch=ID (a conversa inteira) · POST {dono:1, acao:'responder'|'resolver'|'reabrir'|'devolver_ia', ch, texto?}
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { ehMarca, senhaOk } from '@/lib/oito/config'
import { novaMensagemCliente } from '@/lib/oito/suporte'

export const maxDuration = 60
const t = (s: any, n = 2000) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
const vista = async (ch: any, paraDono = false) => {
  const msgs = await db.lista('chamado_msgs', { chamado_id: ch.id }, { ordem: 'criado_em' })
  return { id: ch.id, status: ch.status, assunto: ch.assunto, criado_em: ch.criado_em, atualizado_em: ch.atualizado_em,
    ...(paraDono ? { problema: ch.problema, solucao: ch.solucao, nome: ch.nome, contato: ch.contato, origem: ch.origem, marca: ch.marca, ia_respostas: ch.ia_respostas } : {}),
    msgs: msgs.map(m => ({ autor: m.autor, texto: m.texto, em: m.criado_em })) }
}

export async function GET(req: Request) {
  const u = new URL(req.url)
  if (u.searchParams.get('dono')) {
    if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
    const ch = await db.um('chamados', { id: u.searchParams.get('ch') || '' })
    if (!ch) return NextResponse.json({ erro: 'chamado' }, { status: 404 })
    await db.atualiza('chamados', { id: ch.id }, { nao_lidas_dono: 0 })
    return NextResponse.json(await vista(ch, true))
  }
  const ch = u.searchParams.get('ch')
  if (ch) {
    const x = await db.um('chamados', { id: ch }).catch(() => null)
    if (!x) return NextResponse.json({ erro: 'chamado' }, { status: 404 })
    await db.atualiza('chamados', { id: x.id }, { nao_lidas_cliente: 0 })
    return NextResponse.json({ chamados: [await vista(x)] }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const c = await db.um('clientes', { codigo: String(u.searchParams.get('c') || '').toUpperCase() })
  if (!c) return NextResponse.json({ erro: 'código' }, { status: 404 })
  const chs = await db.lista('chamados', { cliente_id: c.id }, { ordem: 'atualizado_em', desc: true, limite: 20 })
  for (const x of chs) if (x.nao_lidas_cliente) await db.atualiza('chamados', { id: x.id }, { nao_lidas_cliente: 0 })
  return NextResponse.json({ chamados: await Promise.all(chs.map(x => vista(x))) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  try {
    const b = await req.json()
    if (b.dono) {
      if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
      const ch = await db.um('chamados', { id: String(b.ch) })
      if (!ch) return NextResponse.json({ erro: 'chamado' }, { status: 404 })
      const agora = new Date().toISOString()
      if (b.acao === 'responder') {
        const texto = t(b.texto)
        if (!texto) return NextResponse.json({ erro: 'texto' }, { status: 400 })
        await db.insere('chamado_msgs', { chamado_id: ch.id, autor: 'dono', texto })
        // chamado que veio por e-mail: a resposta do dono sai por e-mail também (13/10)
        if (ch.origem === 'email') { const { respondeEmail } = await import('@/lib/oito/caixa'); await respondeEmail(ch, texto, 'dono').catch(() => null) }
        await db.atualiza('chamados', { id: ch.id }, { status: 'resolvido', resolvido_por: 'dono', solucao: t(b.solucao, 200) || texto.slice(0, 200), nao_lidas_cliente: (ch.nao_lidas_cliente || 0) + 1, nao_lidas_dono: 0, atualizado_em: agora })
      } else if (b.acao === 'resolver') await db.atualiza('chamados', { id: ch.id }, { status: 'resolvido', resolvido_por: 'dono', nao_lidas_dono: 0, atualizado_em: agora })
      else if (b.acao === 'reabrir') await db.atualiza('chamados', { id: ch.id }, { status: 'esperando_dono', atualizado_em: agora })
      else if (b.acao === 'devolver_ia') await db.atualiza('chamados', { id: ch.id }, { status: 'respondido_ia', ia_respostas: 0, atualizado_em: agora })
      return NextResponse.json({ ok: true })
    }

    const texto = t(b.texto)
    if (!texto) return NextResponse.json({ erro: 'Escreve a mensagem.' }, { status: 400 })
    const c = b.c ? await db.um('clientes', { codigo: String(b.c).toUpperCase() }) : null
    let ch = b.ch ? await db.um('chamados', { id: String(b.ch) }).catch(() => null) : null
    if (!ch) {
      // cliente com chamado aberto há menos de 3 dias: continua nele em vez de abrir outro
      if (c) ch = (await db.lista('chamados', { cliente_id: c.id }, { ordem: 'atualizado_em', desc: true, limite: 1 })).find(x => x.status !== 'resolvido' && x.atualizado_em > new Date(Date.now() - 3 * 86400e3).toISOString()) || null
      if (!ch) {
        const marca = c?.marca || (ehMarca(b.marca) ? b.marca : null)
        if (!c && !t(b.contato, 120)) return NextResponse.json({ erro: 'Deixa um WhatsApp ou e-mail pra gente responder.' }, { status: 400 })
        ch = await db.insere('chamados', { cliente_id: c?.id || null, marca, nome: c?.nome_negocio || t(b.nome, 120), contato: c ? c.whatsapp : t(b.contato, 120),
          origem: c ? (c.status === 'teste' ? 'teste' : 'area') : 'site', assunto: texto.slice(0, 120), status: 'aberto' })
      }
    }
    await novaMensagemCliente(ch, texto)
    const novo = await db.um('chamados', { id: ch.id })
    return NextResponse.json({ chamado: await vista(novo) })
  } catch (e: any) {
    console.error('oito suporte', e)
    return NextResponse.json({ erro: 'Não enviou. Tenta de novo.' }, { status: 500 })
  }
}
