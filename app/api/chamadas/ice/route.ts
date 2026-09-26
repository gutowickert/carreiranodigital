import { NextResponse } from 'next/server'

// Servidores ICE pra chamada. STUN do Google acha o caminho direto; quando não dá (4G, rede
// de empresa), o TURN retransmite. Com CF_TURN_KEY_ID + CF_TURN_API_TOKEN na Vercel, gera
// credenciais temporárias (2h) no TURN da Cloudflare (1 TB/mês grátis, estável). Sem as
// variáveis, cai no Open Relay, que é gratuito mas falha bastante no 4G.
export const dynamic = 'force-dynamic'

const STUN: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
const OPEN_RELAY: RTCIceServer = { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' }

export async function GET() {
  const id = process.env.CF_TURN_KEY_ID, token = process.env.CF_TURN_API_TOKEN
  if (id && token) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 7200 }), cache: 'no-store',
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.iceServers) {
        const lista: RTCIceServer[] = Array.isArray(j.iceServers) ? j.iceServers : [j.iceServers]
        return NextResponse.json({ ok: true, origem: 'cloudflare', iceServers: [...STUN, ...lista] })
      }
      console.error('[ice] cloudflare recusou', r.status, JSON.stringify(j).slice(0, 300))
    } catch (e: any) { console.error('[ice] cloudflare falhou', e?.message) }
  }
  return NextResponse.json({ ok: true, origem: 'openrelay', iceServers: [...STUN, OPEN_RELAY] })
}
