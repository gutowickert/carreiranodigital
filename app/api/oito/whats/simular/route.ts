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
import { atende } from '@/lib/oito/agente'

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
  let imagem: { buf: Buffer; mime: string } | undefined
  if (b.imagem_url) { const r = await fetch(b.imagem_url); imagem = { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/jpeg' } }
  const m: any = { id: 'sim-in-' + crypto.randomUUID(), from: tel, type: imagem ? 'image' : 'text', ...(imagem ? { image: { caption: b.texto || '' } } : { text: { body: String(b.texto || '') } }) }
  const r = await recebe(m, b.nome || null, imagem)
  if (!r) return NextResponse.json({ erro: 'repetida' }, { status: 409 })
  const antes = (await db.lista('wa_msgs', { conversa_id: r.cv.id })).length
  if (r.responder && !b.sem_resposta) await atende(r.cv.id)
  const msgs = await db.lista('wa_msgs', { conversa_id: r.cv.id }, { ordem: 'criado_em' })
  const cv = await db.um('wa_conversas', { id: r.cv.id })
  return NextResponse.json({ fase: cv?.fase, marca: cv?.marca, novas: msgs.slice(antes).map(x => ({ autor: x.autor, texto: x.texto })) })
}
