import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

export const maxDuration = 30

// O cliente marca que leu e aceitou a proposta. Chamada pela própria página pública, SEM login — é o
// cliente que aceita, e ele não tem conta no sistema.
//
// ⚠️ ISTO NÃO É ASSINATURA DIGITAL. Não tem certificado e não vale como documento assinado: é o
// registro de que alguém com o link escreveu aquele nome e clicou, naquela data e hora. A página
// diz isso pro cliente com todas as letras — prometer mais do que é seria o tipo de coisa que
// aparece justamente quando dá problema.
//
// Por que é seguro estar aberto: só grava, nunca devolve conteúdo da proposta, só aceita um endereço
// que exista, e NÃO SOBRESCREVE um aceite que já houve — o primeiro fica, com a data dele.

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({} as any))
    const slug = (b.slug || '').toString().slice(0, 60)
    const nome = (b.nome || '').toString().trim().slice(0, 120)
    if (!slug) return NextResponse.json({ ok: false, error: 'proposta não encontrada' }, { status: 200 })
    if (nome.length < 3) return NextResponse.json({ ok: false, error: 'escreve teu nome completo pra confirmar' }, { status: 200 })

    const { data: orc } = await sb.from('orcamentos')
      .select('id, org_id, lead_id, situacao, aceito_em, aceito_nome')
      .eq('slug', slug).maybeSingle()
    if (!orc || orc.situacao !== 'publicado') {
      return NextResponse.json({ ok: false, error: 'proposta não encontrada' }, { status: 200 })
    }

    // já aceita: devolve o aceite que existe, sem gravar de novo
    if (orc.aceito_em) {
      return NextResponse.json({ ok: true, ja_estava: true, aceito_em: orc.aceito_em, aceito_nome: orc.aceito_nome })
    }

    const ua = req.headers.get('user-agent') || ''
    const dispositivo = /iphone|android|mobile/i.test(ua) ? 'celular' : 'computador'
    const agora = new Date().toISOString()

    const { error } = await sb.from('orcamentos')
      .update({ aceito_em: agora, aceito_nome: nome, aceito_dispositivo: dispositivo, atualizado_em: agora })
      .eq('id', orc.id).is('aceito_em', null)   // dois cliques ao mesmo tempo: vale o primeiro
    if (error) return NextResponse.json({ ok: false, error: 'não consegui registrar agora' }, { status: 200 })

    // o time precisa saber sem depender de alguém abrir a tela de orçamentos
    try {
      await sb.from('lead_andamentos').insert({
        lead_id: orc.lead_id,
        tipo: 'observacao',
        observacao: `✅ Proposta ACEITA pelo cliente — "${nome}" confirmou a leitura e o aceite pelo link.`,
      })
    } catch { /* o histórico não pode derrubar o aceite do cliente */ }

    return NextResponse.json({ ok: true, aceito_em: agora, aceito_nome: nome })
  } catch {
    return NextResponse.json({ ok: false, error: 'não consegui registrar agora' }, { status: 200 })
  }
}
