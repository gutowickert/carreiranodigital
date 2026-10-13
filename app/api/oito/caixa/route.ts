// Oito Posts: lê as caixas contato@ das 3 marcas e responde (13/10). O gerador no PC chama a cada 2 minutos.
//   POST (x-senha) → { salao: n | 'sem senha' | 'erro…', prato: …, pata: … }
import { NextResponse } from 'next/server'
import { senhaOk } from '@/lib/oito/config'
import { sincronizaCaixas } from '@/lib/oito/caixa'

export const maxDuration = 60

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  return NextResponse.json(await sincronizaCaixas())
}
