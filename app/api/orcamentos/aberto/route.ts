import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

export const maxDuration = 30

// Registra que alguém abriu a proposta. Chamada pela própria página pública, SEM login — é o cliente
// que abre, e ele não tem conta no sistema.
//
// Por que isso é seguro mesmo aberto: só grava (nunca devolve conteúdo), só aceita um endereço que
// exista, e só guarda o tipo de aparelho e de onde veio o clique. Nada de IP nem nome.
//
// Uma abertura por hora por aparelho: o cliente que rola a página pra cima e pra baixo não vira
// "abriu 14 vezes", mas quem volta amanhã conta de novo.

const UMA_HORA = 36e5

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({} as any))
    const slug = (b.slug || '').toString().slice(0, 40)
    if (!slug) return NextResponse.json({ ok: true })

    const { data: orc } = await sb.from('orcamentos').select('id, org_id').eq('slug', slug).maybeSingle()
    if (!orc) return NextResponse.json({ ok: true })

    const ua = req.headers.get('user-agent') || ''
    const dispositivo = /iphone|android|mobile/i.test(ua) ? 'celular' : 'computador'

    const { data: ultima } = await sb.from('orcamento_aberturas')
      .select('criado_em').eq('orcamento_id', orc.id).eq('dispositivo', dispositivo)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (ultima && Date.now() - new Date(ultima.criado_em).getTime() < UMA_HORA) return NextResponse.json({ ok: true, repetida: true })

    await sb.from('orcamento_aberturas').insert({
      org_id: orc.org_id,
      orcamento_id: orc.id,
      dispositivo,
      referencia: (b.de || '').toString().slice(0, 200) || null,
    })
    return NextResponse.json({ ok: true })
  } catch {
    // nunca atrapalha a leitura da proposta
    return NextResponse.json({ ok: true })
  }
}
