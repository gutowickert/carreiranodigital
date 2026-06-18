import { NextRequest, NextResponse } from 'next/server'
import { baixarMidia } from '@/lib/whatsapp-oficial'

// Proxy de mídia RECEBIDA no número de disparo. A mensagem do Cloud API traz só
// o media_id; aqui baixamos os bytes pelo token e servimos pro <img>/<audio>.
// Uso: /api/wa-oficial/midia?id=<media_id>
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return new NextResponse('faltou id', { status: 400 })
  const r = await baixarMidia(id)
  if (!r.ok || !r.buffer) return new NextResponse('mídia indisponível', { status: 404 })
  return new NextResponse(r.buffer, {
    status: 200,
    headers: {
      'Content-Type': r.mime || 'application/octet-stream',
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
