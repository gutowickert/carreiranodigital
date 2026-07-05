import { NextRequest, NextResponse } from 'next/server'
import { listarSegmentos, lerDossie, gerarDossie } from '@/lib/inteligencia-cliente'

export const maxDuration = 120

// Auth opcional: se INTELIGENCIA_API_KEY estiver setada na Vercel, exige o token
// (Authorization: Bearer <key> OU x-api-key: <key>). Sem a env, fica aberto.
function autorizado(req: NextRequest): boolean {
  const key = process.env.INTELIGENCIA_API_KEY
  if (!key) return true
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const xkey = (req.headers.get('x-api-key') || '').trim()
  return bearer === key || xkey === key
}
const naoAutorizado = () => NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

// Inteligência de cliente (voz do cliente) por produto/cidade, pro sistema de conteúdo.
//  GET                          -> lista os segmentos (produto/cidade) + contagem + status do cache
//  GET ?produto=&cidade=        -> devolve o dossiê cacheado daquele segmento
//  POST { produto, cidade }     -> (re)gera o dossiê via IA e salva
export async function GET(req: NextRequest) {
  try {
    if (!autorizado(req)) return naoAutorizado()
    const sp = req.nextUrl.searchParams
    const produto = sp.get('produto')
    if (!produto) {
      const segmentos = await listarSegmentos()
      return NextResponse.json({ ok: true, segmentos })
    }
    const cidade = sp.get('cidade') || ''
    const row = await lerDossie(produto, cidade)
    if (!row) return NextResponse.json({ ok: true, dossie: null })
    return NextResponse.json({ ok: true, produto, cidade, dossie: row.dossie, n_ganhos: row.n_ganhos, n_perdas: row.n_perdas, gerado_em: row.gerado_em })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!autorizado(req)) return naoAutorizado()
    const body = await req.json().catch(() => ({}))
    const produto: string = body.produto
    const cidade: string = body.cidade || ''
    if (!produto) return NextResponse.json({ ok: false, error: 'falta produto' }, { status: 200 })
    const r = await gerarDossie(produto, cidade)
    return NextResponse.json(r, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
