import { NextRequest } from 'next/server'
import { carregarFontes, gerarCertificado } from '@/lib/certificado'

export async function GET(req: NextRequest) {
  const matId = req.nextUrl.searchParams.get('matricula')
  if (!matId) return new Response('falta matricula', { status: 400 })
  try {
    const fontes = await carregarFontes(req.nextUrl.origin)
    const cert = await gerarCertificado(matId, fontes)
    if (!cert) return new Response('matrícula não encontrada', { status: 404 })
    return new Response(cert.buffer, {
      headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="certificado-${cert.nomeArq}.png"` },
    })
  } catch (e: any) {
    return new Response('ERRO PNG: ' + (e?.stack || e?.message || String(e)), { status: 500 })
  }
}
