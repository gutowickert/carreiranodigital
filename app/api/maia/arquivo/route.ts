// Maia: serve os arquivos no MODO LOCAL (testes). Em produção os links são assinados pelo Supabase e esta rota não responde.
// A oficina também baixa a mídia do dono por aqui no modo local. Sem senha: só existe no computador de teste.
// 08/11 (T4, passo 5): PUT = o envio direto da oficina no modo local (o mesmo caminho do link assinado do Supabase em produção).
// Só com a assinatura do link (db.linkEnvio) e só na pasta de peças de um negócio.
import fs from 'node:fs'
import path from 'node:path'
import { maiaDb as db, maiaLocal, assinaEnvioLocal } from '@/lib/maia/db'

const TIPOS: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' }   // 13/11: .mov (takes) e .mp3 (locução)

export async function GET(req: Request) {
  if (!maiaLocal()) return new Response('não', { status: 404 })
  const p = new URL(req.url).searchParams.get('p') || ''
  if (!p || p.includes('..')) return new Response('não', { status: 400 })
  const f = db.arquivoLocal(p)
  if (!fs.existsSync(f)) return new Response('não achei', { status: 404 })
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' } })
}

export async function PUT(req: Request) {
  if (!maiaLocal()) return new Response('não', { status: 404 })
  const u = new URL(req.url), p = u.searchParams.get('p') || '', envio = u.searchParams.get('envio') || ''
  if (!p || p.includes('..') || !/^[\w-]+\/pecas\/[\w.-]+$/.test(p)) return new Response('caminho inválido', { status: 400 })
  if (envio !== assinaEnvioLocal(p)) return new Response('assinatura inválida', { status: 403 })
  const buf = Buffer.from(await req.arrayBuffer())
  if (!buf.length) return new Response('arquivo vazio', { status: 400 })
  await db.sobe(p, buf, req.headers.get('content-type') || 'application/octet-stream')
  return Response.json({ Key: 'maia/' + p })
}
