// Lançamento da Maia (15/11/2026): o público da tela de Disparos no modo "Lançamento Maia".
// Devolve quem está na lista do lançamento (a etiqueta maia), de uma remessa e de uma versão do modelo (aluno ou contato),
// que ainda não recebeu o disparo (etapa "Na lista"). O nome vai como o primeiro nome, pra variável {nome} do modelo.
// Remessa 0 = a lista de teste do time.
import { NextRequest, NextResponse } from 'next/server'
import { chamadaPermitida } from '@/lib/exigir-login'
import { maiaDb as db } from '@/lib/maia/db'

export async function GET(req: NextRequest) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const remessa = sp.get('remessa') ?? '1'
  const versao = sp.get('versao') || ''
  const todosDaRemessa = sp.get('todos') === '1'   // inclui quem já recebeu (pra repetir o teste do time)
  try {
    const lista = (await db.lista('lanc_contatos', { remessa: +remessa })).filter(c => (!versao || c.versao === versao) && (todosDaRemessa || c.etapa === 'na_lista'))
    lista.sort((a, b) => (a.posicao || 0) - (b.posicao || 0))
    return NextResponse.json({ ok: true, contatos: lista.map(c => ({ telefone: c.telefone, nome: c.nome || 'tudo bem' })) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'a tabela do lançamento ainda não existe? (db/maia-lancamento.sql) ' + String(e?.message || e).slice(0, 200) })
  }
}
