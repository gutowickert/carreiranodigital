import { NextRequest, NextResponse } from 'next/server'
import { enviarTemplate } from '@/lib/whatsapp-oficial'

// Teste de conexão com a API Oficial: envia o template padrão "hello_world"
// (já aprovado pela Meta) pro número informado. Ex:
//   /api/wa-oficial/teste?to=5551998346911
export async function GET(req: NextRequest) {
  const to = (req.nextUrl.searchParams.get('to') || '').replace(/\D/g, '')
  if (!to) return NextResponse.json({ ok: false, error: 'passe ?to=55DDDNUMERO' }, { status: 400 })
  const r = await enviarTemplate(to, 'hello_world', 'en_US')
  return NextResponse.json(r)
}
