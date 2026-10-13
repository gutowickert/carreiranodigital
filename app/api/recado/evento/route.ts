// Recado Encantado: o rastreador das páginas manda cada passo do visitante (visita, clique, formulário, pagar).
// Aceita text/plain (navigator.sendBeacon) e JSON. Público, sem dado pessoal: só um id anônimo do navegador.
// 11/10: robôs (revisão de anúncio da Meta, Google, navegador automático) não entram; o navegador fica guardado em dados.ua.
// Os nomes de campanha/anúncio vêm codificados duas vezes pela Meta ({{campaign.name}}): decodifica antes de gravar.
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'

// form_campo: cada campo preenchido (dados.campo, dados.pct); form_erro: campo que barrou o envio (11/10)
const EVENTOS = ['visita', 'cta', 'form_inicio', 'form_campo', 'form_erro', 'form_envio', 'pagar_clique']
const ROBO = /bot|crawl|spider|slurp|facebookexternalhit|facebot|meta-externalagent|headlesschrome|lighthouse|inspectiontool|preview|pingdom|uptime/i
const limpa = (s: any, n = 120) => (s == null ? null : String(s).replace(/[<>]/g, '').slice(0, n))
const decodifica = (s: any) => { if (s == null) return s; let v = String(s); for (let i = 0; i < 2 && /%[0-9A-F]{2}|\+/i.test(v); i++) { try { v = decodeURIComponent(v.replace(/\+/g, ' ')) } catch { break } } return v }

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') || ''
    // 13/10: pré-carregamento (o app abre a página antes do clique) também não conta
    const pre = /prefetch|prerender|preview/i.test(`${req.headers.get('sec-purpose') || ''} ${req.headers.get('purpose') || ''} ${req.headers.get('x-purpose') || ''}`)
    if (ROBO.test(ua) || pre) return NextResponse.json({ ok: true, robo: true })
    const b: any = JSON.parse(await req.text())
    if (!EVENTOS.includes(b.evento) || !/^[a-z0-9]{8,40}$/i.test(String(b.visitante || ''))) return NextResponse.json({ ok: false }, { status: 400 })
    const u = b.utm || {}
    const dados = { ...(b.dados && typeof b.dados === 'object' ? b.dados : {}), ua: ua.slice(0, 200) }
    await db.insere('site_eventos', {
      visitante: b.visitante, evento: b.evento, pagina: limpa(b.pagina, 200), produto: limpa(b.produto, 40),
      utm_source: limpa(u.utm_source), utm_medium: limpa(u.utm_medium), utm_campaign: limpa(decodifica(u.utm_campaign)), utm_content: limpa(decodifica(u.utm_content)),
      fbclid: limpa(u.fbclid, 300), referrer: limpa(b.referrer, 300), pedido_codigo: limpa(b.pedido, 40), dados,
    })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
}
