// Oito Posts: o país da conexão (17/10), pra o formulário do Feed al Día já abrir com o país marcado. A Vercel manda no cabeçalho.
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const pais = (req.headers.get('x-vercel-ip-country') || '').toUpperCase().slice(0, 2)
  return NextResponse.json({ pais }, { headers: { 'Cache-Control': 'private, no-store' } })
}
