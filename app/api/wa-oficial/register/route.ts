import { NextRequest, NextResponse } from 'next/server'

// Re-registra o número na Cloud API (resolve "aceita mas não entrega" / EXPIRED).
// Abrir: /api/wa-oficial/register?pin=123456  (escolha um PIN de 6 dígitos)
const TOKEN = process.env.WA_OFICIAL_TOKEN || ''
const PHONE_ID = process.env.WA_OFICIAL_PHONE_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

export async function GET(req: NextRequest) {
  const pin = (req.nextUrl.searchParams.get('pin') || '').replace(/\D/g, '')
  if (!TOKEN || !PHONE_ID) return NextResponse.json({ ok: false, error: 'config faltando' }, { status: 200 })
  if (pin.length !== 6) return NextResponse.json({ ok: false, error: 'passe ?pin=NNNNNN (6 dígitos)' }, { status: 200 })
  try {
    const res = await fetch(`${GRAPH}/${PHONE_ID}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    })
    const json = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: res.ok, status: res.status, resposta: json })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'falha' }, { status: 200 })
  }
}
