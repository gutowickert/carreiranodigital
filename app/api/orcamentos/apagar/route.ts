import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

// Apaga um RASCUNHO de orçamento.
//
// Por que existe: tentar duas ou três vezes é o uso normal da tela — o Patrick acumulou três
// rascunhos numa tarde. Sem apagar, a lista "já feitos pra este lead" vira um monte onde ninguém
// sabe qual é o bom, e a chance de alguém publicar o errado só cresce.
//
// ⚠️ PUBLICADO NÃO SE APAGA. O endereço já pode estar no WhatsApp do cliente: apagar transforma a
// proposta que ele recebeu num 404, e ele não tem como saber se foi erro, golpe ou desistência da
// escola. Proposta publicada que não vale mais se resolve com uma nova, não com um buraco.
export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const b = await req.json().catch(() => ({} as any))
    const id = (b.id || '').toString()
    if (!id) return NextResponse.json({ ok: false, error: 'falta o orçamento' }, { status: 200 })

    const { data: orc } = await sb.from('orcamentos').select('id, situacao, lead_id, capa').eq('org_id', org).eq('id', id).maybeSingle()
    if (!orc) return NextResponse.json({ ok: false, error: 'orçamento não encontrado' }, { status: 200 })
    if (orc.situacao === 'publicado') {
      return NextResponse.json({ ok: false, error: 'esta proposta já está no ar e o cliente pode ter o link — apagar deixaria a página dele em branco. Edita ou gera outra.' }, { status: 200 })
    }

    // o dono do lead manda no orçamento, mesma regra do resto do funil
    const { data: lead } = await sb.from('leads').select('vendedor_id').eq('org_id', org).eq('id', orc.lead_id).maybeSingle()
    const { data: perfil } = await sb.from('usuarios_perfil').select('leads_escopo').eq('id', quem.eu.id).maybeSingle()
    const soMeus = perfil?.leads_escopo === 'proprios'
    const meu = !lead?.vendedor_id || (soMeus ? lead.vendedor_id === quem.eu.id : quem.visiveis.has(lead.vendedor_id))
    if (!meu) return NextResponse.json({ ok: false, error: 'este lead não é teu' }, { status: 403 })

    const { error } = await sb.from('orcamentos').delete().eq('org_id', org).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
