import { NextResponse } from 'next/server'

// Inscreve ESTE app na WABA (pra os webhooks de status chegarem) e lista as
// inscrições atuais. Abrir uma vez no navegador.
const TOKEN = process.env.WA_OFICIAL_TOKEN || ''
const WABA_ID = process.env.WA_OFICIAL_WABA_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

export async function GET() {
  if (!TOKEN || !WABA_ID) return NextResponse.json({ ok: false, error: 'config faltando' }, { status: 200 })
  try {
    // inscreve o app na WABA
    const sub = await fetch(`${GRAPH}/${WABA_ID}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const subJson = await sub.json().catch(() => ({}))
    // lista quem está inscrito
    const lst = await fetch(`${GRAPH}/${WABA_ID}/subscribed_apps`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    const lstJson = await lst.json().catch(() => ({}))
    return NextResponse.json({ ok: sub.ok, inscricao: subJson, inscritos: lstJson })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'falha' }, { status: 200 })
  }
}
