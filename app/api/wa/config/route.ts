import { NextResponse } from 'next/server'

// Atalho de administração: liga no Z-API a opção "Notificar enviadas por mim",
// pra que as mensagens enviadas PELO CELULAR cheguem no webhook (e apareçam no
// sistema/lead). Basta abrir esta URL uma vez no navegador.
const INSTANCE = process.env.ZAPI_INSTANCE_ID || ''
const TOKEN = process.env.ZAPI_TOKEN || ''
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || ''

export async function GET() {
  if (!INSTANCE || !TOKEN || !CLIENT_TOKEN) {
    return NextResponse.json({ ok: false, error: 'Faltam ZAPI_INSTANCE_ID/ZAPI_TOKEN/ZAPI_CLIENT_TOKEN' }, { status: 500 })
  }
  const url = `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}/notify-sent-by-me`
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
      body: JSON.stringify({ value: true }),
    })
    const json = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: res.ok, status: res.status, resposta: json })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'falha' }, { status: 200 })
  }
}
