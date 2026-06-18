import { NextRequest, NextResponse } from 'next/server'
import { uploadMidia } from '@/lib/whatsapp-oficial'

// Sobe um arquivo (base64) pro WhatsApp Cloud API e devolve o media_id, pra usar
// no cabeçalho de mídia do template no disparo (em vez de URL pública).
export async function POST(req: NextRequest) {
  try {
    const { base64, nome } = await req.json()
    const mm = (base64 || '').match(/^data:([^;]+);base64,(.+)$/)
    if (!mm) return NextResponse.json({ ok: false, error: 'arquivo inválido' }, { status: 200 })
    const buffer = Buffer.from(mm[2], 'base64')
    const up = await uploadMidia(buffer, mm[1], nome || 'arquivo')
    if (!up.ok || !up.id) return NextResponse.json({ ok: false, error: up.error || 'falha no upload' }, { status: 200 })
    return NextResponse.json({ ok: true, id: up.id, mime: mm[1] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
