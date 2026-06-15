import { NextRequest, NextResponse } from 'next/server'
import { enviarTemplate } from '@/lib/whatsapp-oficial'

// Teste de envio com um template REAL da conta. Ex:
//   /api/wa-oficial/teste?to=5551999999999&template=disparo_poa_&lang=pt_BR&p1=Guto
//   himg=<url> pra templates com header de imagem.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const to = (sp.get('to') || '').replace(/\D/g, '')
  const template = sp.get('template') || ''
  const lang = sp.get('lang') || 'pt_BR'
  if (!to || !template) {
    return NextResponse.json({ ok: false, error: 'passe ?to=55... &template=NOME (&lang=pt_BR &p1=.. &himg=url)' }, { status: 400 })
  }

  const params: any[] = []
  for (let i = 1; i <= 9; i++) {
    const v = sp.get('p' + i)
    if (v != null) params.push({ type: 'text', text: v })
  }
  const componentes: any[] = []
  const himg = sp.get('himg')
  if (himg) componentes.push({ type: 'header', parameters: [{ type: 'image', image: { link: himg } }] })
  if (params.length) componentes.push({ type: 'body', parameters: params })

  const r = await enviarTemplate(to, template, lang, componentes.length ? componentes : undefined)
  return NextResponse.json(r)
}
