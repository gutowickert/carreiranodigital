import { NextResponse } from 'next/server'
import { reconfirmarEncontros } from '@/lib/reconfirmar'
import { ORG_CND } from '@/lib/org'

export const maxDuration = 60

// A RECONFIRMAÇÃO DOS ENCONTROS — chamada pelo orquestrador na passada da MANHÃ.
//
// Manhã de propósito: mensagem de noite rende menos resposta e incomoda mais. E o cliente que vai
// responder "não vou poder" tem o dia inteiro pra fazer isso, enquanto ainda dá pra reorganizar.
//
// Quem faz o trabalho é lib/reconfirmar.ts — esta rota só é a porta pro cron.

// Sem trava de segredo, igual aos outros motores (/api/ia/virada, /reconciliar, /posse-funil):
// quem tranca é o orquestrador, que é o único endereço que o agendador do banco conhece. Pôr uma
// trava só aqui quebraria a chamada interna — o orquestrador chama sem cabeçalho nenhum.
//
// O que protege de uso indevido é a própria natureza do motor: ele só manda mensagem pra encontro
// que existe, com data marcada, a exatamente 2 ou 1 dia de distância, e nunca duas vezes.
export async function POST() {
  try {
    const r = await reconfirmarEncontros(ORG_CND)
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
