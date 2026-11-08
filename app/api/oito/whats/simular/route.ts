// Oito Posts: simulação do agente do WhatsApp (15/10), pra validar o funil sem mandar nada de verdade.
// Telefones de simulação começam com 55000: nada sai pra Meta, o cliente criado é marcado como exemplo (fora das métricas)
// e o teste é gerado de verdade pelo gerador (as imagens "chegam" na conversa simulada).
//   POST (x-senha) {telefone:'5500099990001', texto?, imagem_url?, nome?} → a mensagem entra e o agente responde na hora
//   GET  (x-senha) ?telefone= → a conversa inteira
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { senhaOk } from '@/lib/oito/config'
import { oitoDb as db } from '@/lib/oito/db'
import { recebe } from '@/lib/oito/entrada'
// 08/11: responde pelo MESMO caminho do webhook (vendedor.atendeConversa): a conversa na fase 'maia' (a demonstração da Maia)
// é atendida pela Maia (lib/maia/demo.ts), o resto pelo agente do Oito. Antes chamava o agente direto e a demo nunca era testada aqui.
import { atendeConversa } from '@/lib/oito/vendedor'

export const maxDuration = 300

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const tel = String(new URL(req.url).searchParams.get('telefone') || '')
  const cv = await db.um('wa_conversas', { telefone: tel })
  if (!cv) return NextResponse.json({ erro: 'conversa' }, { status: 404 })
  const msgs = await db.lista('wa_msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })
  const cli = cv.cliente_id ? await db.um('clientes', { id: cv.cliente_id }) : null
  return NextResponse.json({ fase: cv.fase, marca: cv.marca, modo: cv.modo, cliente: cli ? { codigo: cli.codigo, status: cli.status, nome: cli.nome_negocio, contexto: cli.contexto, logo: !!cli.logo_path } : null, rascunho: cv.rascunho,
    msgs: msgs.map(m => ({ autor: m.autor, tipo: m.tipo, texto: m.texto, em: m.criado_em })) })
}

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const tel = String(b.telefone || '').replace(/\D/g, '')
  if (!/^55000\d{6,}$/.test(tel)) return NextResponse.json({ erro: 'telefone de simulação começa com 55000' }, { status: 400 })
  // 08/11: além da imagem por link, um arquivo em base64 ({arquivo_b64, mime}): foto, vídeo ou áudio (o áudio é transcrito de verdade na demo da Maia)
  let arquivo: { buf: Buffer; mime: string } | undefined
  if (b.imagem_url) { const r = await fetch(b.imagem_url); arquivo = { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/jpeg' } }
  else if (b.arquivo_b64) arquivo = { buf: Buffer.from(String(b.arquivo_b64), 'base64'), mime: String(b.mime || 'image/jpeg') }
  const tipo = !arquivo ? 'text' : /^video\//.test(arquivo.mime) ? 'video' : /^audio\//.test(arquivo.mime) ? 'audio' : 'image'
  const m: any = { id: 'sim-in-' + crypto.randomUUID(), from: tel, type: tipo, ...(tipo === 'text' ? { text: { body: String(b.texto || '') } } : { [tipo]: tipo === 'audio' ? {} : { caption: b.texto || '' } }) }
  const r = await recebe(m, b.nome || null, arquivo)
  if (!r) return NextResponse.json({ erro: 'repetida' }, { status: 409 })
  const antes = (await db.lista('wa_msgs', { conversa_id: r.cv.id })).length
  if (r.responder && !b.sem_resposta) await atendeConversa(r.cv.id)
  const msgs = await db.lista('wa_msgs', { conversa_id: r.cv.id }, { ordem: 'criado_em' })
  const cv = await db.um('wa_conversas', { id: r.cv.id })
  return NextResponse.json({ fase: cv?.fase, marca: cv?.marca, modo: cv?.modo, etapa: cv?.etapa, recebido: r.texto, novas: msgs.slice(antes).map(x => ({ autor: x.autor, tipo: x.tipo, texto: x.texto })) })
}
