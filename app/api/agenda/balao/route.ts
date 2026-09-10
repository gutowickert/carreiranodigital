import { NextResponse } from 'next/server'
import { orgDaRequest } from '@/lib/org'
import { meuPerfil } from '@/lib/quem-eu-vejo'
import { balaoDe } from '@/lib/agenda-balao'

// O número do balão vermelho da Agenda, no menu. Leve de propósito: o menu chama isto em toda
// página, a cada minuto — não pode carregar a hierarquia inteira nem as três listas completas
// como /api/agenda faz. Só "o que é meu e ainda não vi". A regra mora em lib/agenda-balao.ts.
//
// `pronto: false` = a instalação ainda não tem a tabela de leituras (22-leituras-da-agenda.sql).
// O menu esconde o balão nesse caso.

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const eu = await meuPerfil(auth)
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
  const org = await orgDaRequest(auth)
  const { pronto, chaves } = await balaoDe(org, eu.id)
  return NextResponse.json({ ok: true, pronto, total: chaves.length, chaves })
}
