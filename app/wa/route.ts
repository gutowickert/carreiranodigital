import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { randomBytes, randomUUID } from 'crypto'

// Numero central do WhatsApp (o conectado no Z-API), so digitos com DDI.
// Ex: 5511999999999. Configure em .env.local / Vercel.
const WA_NUMERO = (process.env.WA_NUMERO_CENTRAL || '').replace(/\D/g, '')

// Gera um codigo curto pra identificar o clique na mensagem do WhatsApp.
function gerarRef(): string {
  return randomBytes(4).toString('hex').toUpperCase() // 8 chars hex, ex: A1B2C3D4
}

// Pagina de redirect: substitui o formulario por um botao de WhatsApp.
// O botao do site aponta pra ca passando turma + tracking; aqui salvamos o
// clique e redirecionamos pro WhatsApp com o codigo (ref) na mensagem.
// Quando a pessoa enviar a mensagem, o webhook do Z-API cria o lead completo.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams

    const codigoTurma = (sp.get('turma') || '').toString().trim()
    const msgBase = (sp.get('msg') || '').toString().trim() || 'Olá! Quero saber mais.'

    const fbclid = sp.get('fbclid') || null
    let fbc = sp.get('fbc') || null
    if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`
    const fbp = sp.get('fbp') || null
    const utmSource = sp.get('utm_source') || null
    const utmMedium = sp.get('utm_medium') || null
    const utmCampaign = sp.get('utm_campaign') || null
    const utmContent = sp.get('utm_content') || null
    const eventSourceUrl = sp.get('src') || req.headers.get('referer') || null
    const eventId = (sp.get('event_id') || '').toString().trim() || randomUUID()
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const userAgent = req.headers.get('user-agent') || null

    if (!WA_NUMERO) {
      return NextResponse.json({ error: 'WA_NUMERO_CENTRAL nao configurado' }, { status: 500 })
    }

    // ref interno: identifica este clique no banco (NÃO aparece pro cliente).
    const ref = gerarRef()

    await supabase.from('wa_clicks').insert({
      ref,
      codigo_turma: codigoTurma || null,
      fbclid,
      fbc,
      fbp,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      event_id: eventId,
      event_source_url: eventSourceUrl,
      client_ip: clientIp,
      user_agent: userAgent,
    })

    // A mensagem leva o CÓDIGO DA TURMA (o mesmo do sistema) — é isso que o
    // webhook usa pra criar o lead na turma certa. Só adiciona se ainda não
    // estiver no texto (evita duplicar caso você já o tenha escrito na MENSAGEM).
    const jaTemCodigo = codigoTurma && msgBase.toLowerCase().includes(codigoTurma.toLowerCase())
    const texto = codigoTurma && !jaTemCodigo ? `${msgBase} (${codigoTurma})` : msgBase
    const url = `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent(texto)}`

    return NextResponse.redirect(url, 302)
  } catch (e: any) {
    // Mesmo se algo falhar, nao deixa o visitante na mao: manda pro WhatsApp.
    if (WA_NUMERO) {
      return NextResponse.redirect(`https://wa.me/${WA_NUMERO}`, 302)
    }
    return NextResponse.json({ error: (e && e.message) || 'erro' }, { status: 500 })
  }
}
