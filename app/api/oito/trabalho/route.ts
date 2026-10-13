// Oito Posts: a porta do trabalhador (o programa no PC que gera os posts). Protegida pela senha do painel.
//   GET                                   → pega o próximo lote da fila (ou um travado há mais de 40 min) e devolve tudo que precisa
//   POST {acao:'post', lote, post, imagem} → entrega um post pronto (JPEG em base64)
//   POST {acao:'foto_desc', foto, descricao}
//   POST {acao:'fim', lote, custo_usd} · POST {acao:'erro', lote, erro}
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { senhaOk, oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { avisaDono } from '@/lib/oito/servico'

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
    return NextResponse.json({ cliente: { codigo: c.codigo, marca: c.marca, cores: c.cores, nome_negocio: c.nome_negocio, instagram: c.instagram, bairro: c.bairro, cidade: c.cidade, logo },
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
  const anteriores = (await db.lista('posts', { cliente_id: c!.id }, { ordem: 'criado_em', desc: true, limite: 40 })).map(p => ({ titulo: p.titulo, pauta: p.pauta, foto_id: p.foto_id }))
  const [logo] = await db.links([c!.logo_path])
  const alvo: any = l.tipo === 'ajuste' ? await db.um('posts', { id: l.mes }) : null
  if (alvo) alvo.bruta_url = (await db.links([alvo.bruta_path]))[0]
  const { documento, asaas_customer, asaas_assinatura, ...cli } = c as any
  return NextResponse.json({
    lote: { ...l, status: 'gerando' }, cliente: { ...cli, logo, marca_nome: cfg.marcas[c!.marca as Marca].nome },
    fotos: fotos.map((f, i) => ({ id: f.id, url: fl[i], descricao: f.descricao, usos: f.usos })),
    anteriores, ajuste: alvo ? { post: alvo, pedido: alvo.ajuste_pedido } : null,
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
      foto_origem: p.foto_origem, foto_id: p.foto_id || null, data_sugerida: p.data_sugerida || null, imagem_path: caminho,
      ajuste_de: l.tipo === 'ajuste' ? l.mes : null, ajuste_pedido: l.tipo === 'ajuste' ? p.ajuste_pedido || null : null,
    })
    if (l.tipo === 'ajuste') await db.atualiza('posts', { id: l.mes }, { status: 'substituido' })
    if (p.foto_id) { const f = await db.um('fotos', { id: p.foto_id }); if (f) await db.atualiza('fotos', { id: f.id }, { usos: (f.usos || 0) + 1 }) }
    return NextResponse.json({ ok: true, id: novo.id })
  }

  if (b.acao === 'fim') {
    await db.atualiza('lotes', { id: l.id }, { status: 'pronto', pronto_em: new Date().toISOString(), custo_usd: +b.custo_usd || 0 })
    const tipo = l.tipo === 'teste' ? 'teste_pronto' : l.tipo === 'mes' ? 'mes_entregue' : 'ajuste_entregue'
    await db.evento(tipo, { cliente_id: c!.id, marca: c!.marca, detalhe: { lote: l.id, segundos: Math.round((Date.now() - new Date(l.iniciado_em).getTime()) / 1000), custo_usd: +b.custo_usd || 0 } })
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
