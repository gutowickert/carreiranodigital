import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// Transcreve áudio (base64) via Deepgram pro Agente Interno mandar como texto.
//  POST { audio: base64, mime }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const key = process.env.DEEPGRAM_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'falta DEEPGRAM_API_KEY' }, { status: 200 })
    if (!b.audio) return NextResponse.json({ ok: false, error: 'sem áudio' }, { status: 200 })
    const buf = Buffer.from(b.audio, 'base64')
    const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true', {
      method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': b.mime || 'audio/ogg' }, body: buf,
    })
    const j = await r.json()
    const texto = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    if (!texto) return NextResponse.json({ ok: false, error: 'não consegui transcrever' }, { status: 200 })
    return NextResponse.json({ ok: true, texto })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
