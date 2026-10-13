// Oito Posts: sobe uma foto ou o logo do cliente. O navegador já manda reduzido (JPEG até ~1600 px, logo em PNG).
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { oitoDb as db } from '@/lib/oito/db'

const MAX_FOTOS = 20

export async function POST(req: Request) {
  try {
    const b = await req.json()
    const c = b.c && (await db.um('clientes', { codigo: String(b.c).toUpperCase() }))
    if (!c) return NextResponse.json({ erro: 'código' }, { status: 404 })
    const m = String(b.dado || '').match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/)
    if (!m) return NextResponse.json({ erro: 'Formato de imagem não aceito.' }, { status: 400 })
    const buf = Buffer.from(m[3], 'base64')
    if (buf.length > 3.5 * 1024 * 1024) return NextResponse.json({ erro: 'Imagem grande demais.' }, { status: 413 })
    const ext = m[2] === 'png' ? 'png' : m[2] === 'webp' ? 'webp' : 'jpg'
    if (b.tipo === 'logo') {
      const p = await db.sobe(`clientes/${c.codigo}/logo.${ext}`, buf, m[1])
      await db.atualiza('clientes', { id: c.id }, { logo_path: p })
      return NextResponse.json({ ok: true })
    }
    const ja = await db.lista('fotos', { cliente_id: c.id })
    if (ja.length >= MAX_FOTOS) return NextResponse.json({ erro: `Já chegou no limite de ${MAX_FOTOS} fotos.` }, { status: 400 })
    const p = await db.sobe(`clientes/${c.codigo}/fotos/${crypto.randomUUID().slice(0, 8)}.${ext}`, buf, m[1])
    await db.insere('fotos', { cliente_id: c.id, path: p })
    if (c.fotos_modo !== 'enviar') await db.atualiza('clientes', { id: c.id }, { fotos_modo: 'enviar' })
    return NextResponse.json({ ok: true, total: ja.length + 1 })
  } catch (e: any) {
    console.error('oito foto', e)
    return NextResponse.json({ erro: 'Não subiu. Tenta de novo.' }, { status: 500 })
  }
}
