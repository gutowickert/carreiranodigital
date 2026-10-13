// Oito Posts: no modo local (OITO_LOCAL=1) serve os arquivos de .oito-local/arquivos. Em produção não responde (o link é assinado no Supabase).
import fs from 'node:fs'
import { oitoDb as db } from '@/lib/oito/db'

export async function GET(req: Request) {
  if (process.env.OITO_LOCAL !== '1') return new Response('não', { status: 404 })
  const p = new URL(req.url).searchParams.get('p') || ''
  if (!/^clientes\/[A-Z0-9]+\/[\w./-]+$/.test(p) || p.includes('..')) return new Response('não', { status: 400 })
  const f = db.arquivoLocal(p)
  if (!fs.existsSync(f)) return new Response('não', { status: 404 })
  const tipo = p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': tipo, 'Cache-Control': 'no-store' } })
}
