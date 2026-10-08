import { NextRequest, NextResponse } from 'next/server'
import { listarSegmentos, lerDossie, gerarDossie } from '@/lib/inteligencia-cliente'
import { chamadaPermitida } from '@/lib/exigir-login'

export const maxDuration = 120

// QUEM PODE (08/10): quem está logado no sistema (a tela manda o login com fetchAuth) OU o sistema de
// conteúdo de fora, com a chave INTELIGENCIA_API_KEY (Authorization: Bearer <key> OU x-api-key: <key>).
// Antes, sem a chave na Vercel ficava aberto a qualquer um; e com a chave, a própria tela levava 401.
function chaveDoConteudo(req: NextRequest): boolean {
  const key = process.env.INTELIGENCIA_API_KEY
  if (!key) return false
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const xkey = (req.headers.get('x-api-key') || '').trim()
  return bearer === key || xkey === key
}
async function autorizado(req: NextRequest): Promise<boolean> {
  return chaveDoConteudo(req) || (await chamadaPermitida(req))
}
const naoAutorizado = () => NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

// Inteligência de cliente (voz do cliente) por produto/cidade, pro sistema de conteúdo.
//  GET                          -> lista os segmentos (produto/cidade) + contagem + status do cache
//  GET ?produto=&cidade=        -> devolve o dossiê cacheado daquele segmento
//  POST { produto, cidade }     -> (re)gera o dossiê via IA e salva
export async function GET(req: NextRequest) {
  try {
    if (!(await autorizado(req))) return naoAutorizado()
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
    if (!(await autorizado(req))) return naoAutorizado()
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
