// Recado Encantado: o rastreador das páginas manda cada passo do visitante (visita, clique, formulário, pagar).
// Aceita text/plain (navigator.sendBeacon) e JSON. Público, sem dado pessoal: só um id anônimo do navegador.
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'

const EVENTOS = ['visita', 'cta', 'form_inicio', 'form_envio', 'pagar_clique']
const limpa = (s: any, n = 120) => (s == null ? null : String(s).replace(/[<>]/g, '').slice(0, n))

export async function POST(req: NextRequest) {
  try {
    const b: any = JSON.parse(await req.text())
    if (!EVENTOS.includes(b.evento) || !/^[a-z0-9]{8,40}$/i.test(String(b.visitante || ''))) return NextResponse.json({ ok: false }, { status: 400 })
    const u = b.utm || {}
    await db.insere('site_eventos', {
      visitante: b.visitante, evento: b.evento, pagina: limpa(b.pagina, 200), produto: limpa(b.produto, 40),
      utm_source: limpa(u.utm_source), utm_medium: limpa(u.utm_medium), utm_campaign: limpa(u.utm_campaign), utm_content: limpa(u.utm_content),
      fbclid: limpa(u.fbclid, 300), referrer: limpa(b.referrer, 300), pedido_codigo: limpa(b.pedido, 40), dados: b.dados && typeof b.dados === 'object' ? b.dados : {},
    })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
}
