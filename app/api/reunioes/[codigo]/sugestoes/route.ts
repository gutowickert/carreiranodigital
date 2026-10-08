import { NextRequest, NextResponse } from 'next/server'
import { reuniaoPorCodigo, sugestoesAoVivo, resumirReuniao } from '@/lib/reunioes'

export const maxDuration = 60

// AS SUGESTÕES AO VIVO: só com a chave do anfitrião. A tela dele pergunta a cada ~20s.
//   GET  ?h=  → pauta marcada + a sugestão do momento
//   POST { h, acao: 'resumir' } → refaz o resumo (se o automático falhou ou saiu cedo demais)
export async function GET(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  try {
    const { codigo } = await params
    const r = await reuniaoPorCodigo(codigo)
    const h = req.nextUrl.searchParams.get('h')
    if (!r || !h || h !== r.chave_host) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await sugestoesAoVivo(r)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const r = await reuniaoPorCodigo(codigo)
  const b = await req.json().catch(() => ({} as any))
  if (!r || !b.h || b.h !== r.chave_host) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 403 })
  if (b.acao === 'resumir') return NextResponse.json(await resumirReuniao(codigo))
  return NextResponse.json({ ok: false, error: 'ação inválida' })
}
