import { NextResponse } from 'next/server'
import { orgDaRequest } from '@/lib/org'
import { meuPerfil } from '@/lib/quem-eu-vejo'
import { marcarLeituras } from '@/lib/agenda-balao'

// Marca itens da agenda como lidos ou não lidos, PARA QUEM PEDIU. Só por aqui: a tabela de leituras
// não tem regra de acesso pro navegador (ver 22-leituras-da-agenda.sql). A pessoa é sempre quem está
// logada — ninguém marca como lido no lugar de outro.
//
// POST { como: 'lido' | 'nao_lido', chaves: ['agenda:<id>', 'turma:<id>', 'lead:<id>'] }
// Devolve o balão recalculado, pra tela e menu atualizarem sem outra ida ao servidor.

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  const eu = await meuPerfil(auth)
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
  const org = await orgDaRequest(auth)

  const b = await req.json().catch(() => ({} as any))
  const como = b.como === 'nao_lido' ? 'nao_lido' : 'lido'
  const chaves: string[] = Array.isArray(b.chaves) ? b.chaves.map(String) : []

  const { pronto, chaves: balao } = await marcarLeituras(org, eu.id, chaves, como)
  if (!pronto) return NextResponse.json({ ok: false, pronto: false, error: 'leituras ainda não instaladas' }, { status: 503 })
  return NextResponse.json({ ok: true, pronto, total: balao.length, chaves: balao })
}
