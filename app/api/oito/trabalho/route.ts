// Oito Posts: a porta do trabalhador (o programa no PC que gera os posts). Protegida pela senha do painel.
//   GET                                   → pega o próximo lote da fila (ou um travado há mais de 40 min) e devolve tudo que precisa
//   POST {acao:'post', lote, post, imagem} → entrega um post pronto (JPEG em base64)
//   POST {acao:'foto_desc', foto, descricao}
//   POST {acao:'fim', lote, custo_usd} · POST {acao:'erro', lote, erro}
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { oitoDb as db } from '@/lib/oito/db'
import { senhaOk, oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { avisaDono } from '@/lib/oito/servico'
import { agendaPostNovo } from '@/lib/oito/postar'

export const maxDuration = 60
const nega = () => NextResponse.json({ erro: 'senha' }, { status: 401 })

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return nega()
  // ?refazer=CODIGO: os posts do cliente com a imagem crua, pra refazer só a arte (quando o modelo visual muda)
  const refazer = new URL(req.url).searchParams.get('refazer')
  if (refazer) {
    const c = await db.um('clientes', { codigo: refazer.toUpperCase() })
    if (!c) return NextResponse.json({ erro: 'cliente' }, { status: 404 })
    const ps = (await db.lista('posts', { cliente_id: c.id }, { ordem: 'criado_em' })).filter(p => p.status !== 'substituido' && p.bruta_path)
    const brutas = await db.links(ps.map(p => p.bruta_path)), [logo] = await db.links([c.logo_path])
    return NextResponse.json({ cliente: { codigo: c.codigo, marca: c.marca, cores: c.cores, tom: (c.contexto || {}).tom, nome_negocio: c.nome_negocio, instagram: c.instagram, bairro: c.bairro, cidade: c.cidade, logo },
      posts: ps.map((p, i) => ({ id: p.id, modelo: p.modelo, titulo: p.titulo, apoio: p.apoio, itens: p.itens, chamada: p.chamada, bruta_url: brutas[i] })) })
  }
  // o painel mostra "trabalhador ligado" pelo último contato
  const hb = { em: new Date().toISOString(), maquina: req.headers.get('x-maquina') || '' }
  db.atualiza('estado', { chave: 'trabalhador' }, { valor: hb }).then(r => (r.length ? null : db.insere('estado', { chave: 'trabalhador', valor: hb }))).catch(() => null)
  const limite = new Date(Date.now() - 40 * 60e3).toISOString()
  const lotes = (await db.lista('lotes', {}, { ordem: 'criado_em' }))
    .filter(l => l.status === 'fila' || (l.status === 'gerando' && (l.iniciado_em || '') < limite && l.tentativas < 3))
  // teste primeiro (é quem está esperando na tela), depois ajuste, depois o mês
  const peso: any = { teste: 0, ajuste: 1, mes: 2 }
  lotes.sort((a, b) => peso[a.tipo] - peso[b.tipo] || (a.criado_em > b.criado_em ? 1 : -1))
  const l = lotes[0]
  if (!l) return NextResponse.json({ lote: null })
  await db.atualiza('lotes', { id: l.id }, { status: 'gerando', iniciado_em: new Date().toISOString(), tentativas: (l.tentativas || 0) + 1, erro: null })
  // recomeço limpo: o que esse lote já tinha entregue numa tentativa anterior sai
  await db.apaga('posts', { lote_id: l.id })
  if (l.tipo === 'ajuste') await db.atualiza('posts', { id: l.mes }, { status: 'ajuste_pedido' })

  const c = await db.um('clientes', { id: l.cliente_id })
  const fotos = await db.lista('fotos', { cliente_id: c!.id }, { ordem: 'criado_em' })
  const fl = await db.links(fotos.map(f => f.path))
  const todos = await db.lista('posts', { cliente_id: c!.id }, { ordem: 'criado_em', desc: true, limite: 60 })
  const anteriores = todos.slice(0, 40).map(p => ({ titulo: p.titulo, pauta: p.pauta, modelo: p.modelo, foto_id: p.foto_id }))
  // o que o cliente já pediu pra mudar vira preferência pros próximos meses (a "memória" do negócio)
  const preferencias = [...new Set(todos.filter(p => p.ajuste_pedido).map(p => String(p.ajuste_pedido).trim()))].slice(0, 12)
  const [logo] = await db.links([c!.logo_path])
  const alvo: any = l.tipo === 'ajuste' ? await db.um('posts', { id: l.mes }) : null
  if (alvo) alvo.bruta_url = (await db.links([alvo.bruta_path]))[0]
  const { documento, asaas_customer, asaas_assinatura, ...cli } = c as any
  return NextResponse.json({
    lote: { ...l, status: 'gerando' }, cliente: { ...cli, logo, marca_nome: cfg.marcas[c!.marca as Marca].nome },
    fotos: fotos.map((f, i) => ({ id: f.id, url: fl[i], descricao: f.descricao, usos: f.usos })),
    anteriores, preferencias, ajuste: alvo ? { post: alvo, pedido: alvo.ajuste_pedido } : null,
  })
}

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return nega()
  const b = await req.json()
  const l = b.lote ? await db.um('lotes', { id: b.lote }) : null

  // troca só a arte de um post (mesmo arquivo, mesmo link)
  if (b.acao === 'refaz_arte') {
    const p = await db.um('posts', { id: String(b.post) })
    const buf = Buffer.from(String(b.imagem || ''), 'base64')
    if (!p || buf.length < 1000) return NextResponse.json({ erro: 'post ou imagem' }, { status: 400 })
    await db.sobe(p.imagem_path, buf, 'image/jpeg')
    return NextResponse.json({ ok: true })
  }
  // o que a leitura do Instagram do negócio encontrou (resumo da IA), guardado no contexto
  if (b.acao === 'instagram') {
    const l2 = await db.um('lotes', { id: String(b.lote) }), c2 = l2 && await db.um('clientes', { id: l2.cliente_id })
    if (!c2) return NextResponse.json({ erro: 'lote' }, { status: 404 })
    await db.atualiza('clientes', { id: c2.id }, { contexto: { ...(c2.contexto || {}), instagram: { ...(b.dados || {}), em: new Date().toISOString() } } })
    return NextResponse.json({ ok: true })
  }
  // foto boa do Instagram do próprio negócio entra como foto dele (até 8)
  if (b.acao === 'foto_ig') {
    const l2 = await db.um('lotes', { id: String(b.lote) }), c2 = l2 && await db.um('clientes', { id: l2.cliente_id })
    const buf = Buffer.from(String(b.imagem || ''), 'base64')
    if (!c2 || buf.length < 1000) return NextResponse.json({ erro: 'dados' }, { status: 400 })
    const ja = (await db.lista('fotos', { cliente_id: c2.id })).filter(f => String(f.descricao || '').startsWith('[instagram]'))
    if (ja.length >= 8) return NextResponse.json({ ok: false, erro: 'limite' })
    const p = await db.sobe(`clientes/${c2.codigo}/fotos/ig-${crypto.randomUUID().slice(0, 8)}.jpg`, buf, 'image/jpeg')
    const f = await db.insere('fotos', { cliente_id: c2.id, path: p, descricao: '[instagram] ' + String(b.descricao || '').slice(0, 380) })
    return NextResponse.json({ ok: true, id: f.id })
  }
  if (b.acao === 'foto_desc') {
    await db.atualiza('fotos', { id: b.foto }, { descricao: String(b.descricao || '').slice(0, 400) })
    return NextResponse.json({ ok: true })
  }
  if (!l) return NextResponse.json({ erro: 'lote' }, { status: 404 })
  const c = await db.um('clientes', { id: l.cliente_id })

  if (b.acao === 'post') {
    const p = b.post || {}
    const buf = Buffer.from(String(b.imagem || ''), 'base64')
    if (buf.length < 1000) return NextResponse.json({ erro: 'imagem vazia' }, { status: 400 })
    const caminho = await db.sobe(`clientes/${c!.codigo}/posts/${l.id.slice(0, 8)}-${p.ordem}.jpg`, buf, 'image/jpeg')
    // a imagem crua (sem texto): o ajuste refaz o post por cima dela sem gerar de novo
    let bruta = p.bruta_path || null
    if (b.bruta) bruta = await db.sobe(`clientes/${c!.codigo}/brutas/${l.id.slice(0, 8)}-${p.ordem}.jpg`, Buffer.from(String(b.bruta), 'base64'), 'image/jpeg')
    const novo = await db.insere('posts', {
      bruta_path: bruta, itens: p.itens || null, chamada: p.chamada || null, cena: p.cena || null, tipo: p.tipo || null,
      lote_id: l.id, cliente_id: c!.id, ordem: p.ordem, pauta: p.pauta, titulo: p.titulo, apoio: p.apoio, legenda: p.legenda, modelo: p.modelo,
      foto_origem: p.foto_origem, foto_id: p.foto_id || null, revisao: p.revisao && typeof p.revisao === 'object' ? p.revisao : null, data_sugerida: p.data_sugerida || null, imagem_path: caminho,
      ajuste_de: l.tipo === 'ajuste' ? l.mes : null, ajuste_pedido: l.tipo === 'ajuste' ? p.ajuste_pedido || null : null,
    })
    // "Postar por mim" (14/10): cliente com Instagram ligado já recebe o post agendado (o ajuste herda a data do original)
    await agendaPostNovo(c, novo, l).catch(e => console.error('oito agenda', e?.message))
    if (l.tipo === 'ajuste') await db.atualiza('posts', { id: l.mes }, { status: 'substituido' })
    if (p.foto_id) { const f = await db.um('fotos', { id: p.foto_id }); if (f) await db.atualiza('fotos', { id: f.id }, { usos: (f.usos || 0) + 1 }) }
    return NextResponse.json({ ok: true, id: novo.id })
  }

  if (b.acao === 'fim') {
    await db.atualiza('lotes', { id: l.id }, { status: 'pronto', pronto_em: new Date().toISOString(), custo_usd: +b.custo_usd || 0 })
    // as "novidades deste mês" valem pra um mês só: depois do lote do mês, vão pro histórico
    if (l.tipo === 'mes' && c!.contexto?.novidades) await db.atualiza('clientes', { id: c!.id }, { contexto: { ...c!.contexto, novidades: '', novidades_anteriores: c!.contexto.novidades } })
    const tipo = l.tipo === 'teste' ? 'teste_pronto' : l.tipo === 'mes' ? 'mes_entregue' : 'ajuste_entregue'
    // lote refeito (14/10): o e-mail sai só na primeira entrega daquele lote
    const jaAvisou = (await db.lista('eventos', { cliente_id: c!.id, tipo })).some(e => e.detalhe?.lote === l.id)
    await db.evento(tipo, { cliente_id: c!.id, marca: c!.marca, detalhe: { lote: l.id, segundos: Math.round((Date.now() - new Date(l.iniciado_em).getTime()) / 1000), custo_usd: +b.custo_usd || 0 } })
    // 15/10: o agente do WhatsApp manda o teste em imagens, o ajuste e o aviso do mês pronto (inclusive nas simulações)
    try { const { notificaFimLote } = await import('@/lib/oito/agente'); await notificaFimLote(c, l) } catch (e: any) { console.error('oito whats fim', e?.message) }
    // e-mail pro cliente (13/10): teste pronto e mês entregue (exemplos não recebem)
    if (!c!.exemplo && !jaAvisou) { const { emailsOito } = await import('@/lib/oito/email'); if (l.tipo === 'teste') await emailsOito.testePronto(c); if (l.tipo === 'mes') await emailsOito.mesEntregue(c) }
    return NextResponse.json({ ok: true })
  }

  if (b.acao === 'erro') {
    const desiste = (l.tentativas || 0) >= 3
    await db.atualiza('lotes', { id: l.id }, { status: desiste ? 'erro' : 'fila', erro: String(b.erro || '').slice(0, 500) })
    if (desiste && !c!.exemplo) avisaDono('lote com erro', `${c!.nome_negocio} · ${l.tipo}: ${String(b.erro || '').slice(0, 150)}`)
    return NextResponse.json({ ok: true, desistiu: desiste })
  }
  return NextResponse.json({ erro: 'ação' }, { status: 400 })
}
