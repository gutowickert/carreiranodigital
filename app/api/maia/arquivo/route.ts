// Maia: serve os arquivos no MODO LOCAL (testes). Em produção os links são assinados pelo Supabase e esta rota não responde.
// A oficina também baixa a mídia do dono por aqui no modo local. Sem senha: só existe no computador de teste.
import fs from 'node:fs'
import path from 'node:path'
import { maiaDb as db, maiaLocal } from '@/lib/maia/db'

const TIPOS: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.ogg': 'audio/ogg' }

export async function GET(req: Request) {
  if (!maiaLocal()) return new Response('não', { status: 404 })
  const p = new URL(req.url).searchParams.get('p') || ''
  if (!p || p.includes('..')) return new Response('não', { status: 400 })
  const f = db.arquivoLocal(p)
  if (!fs.existsSync(f)) return new Response('não achei', { status: 404 })
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' } })
}
