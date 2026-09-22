import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 30

// Reabre um orçamento que já existe, pra continuar de onde parou.
//
// SÓ LEITURA.
//
// POR QUE EXISTE: o rascunho sempre foi salvo, mas não havia como voltar nele. Quem saía da tela
// perdia o caminho de volta e gerava outro do zero — foi o que aconteceu com o José, que ficou com
// um rascunho às 14:03 e uma proposta nova às 14:07, as duas do mesmo lead.

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const id = new URL(req.url).searchParams.get('id') || ''
    if (!id) return NextResponse.json({ ok: false, error: 'falta o orçamento' }, { status: 200 })

    const { data: orc } = await sb.from('orcamentos').select('*').eq('org_id', org).eq('id', id).maybeSingle()
    if (!orc) return NextResponse.json({ ok: false, error: 'orçamento não encontrado' }, { status: 200 })

    // mesma regra de quem vê o quê do resto do funil: o orçamento segue o dono do lead
    const { data: lead } = await sb.from('leads').select('id, vendedor_id').eq('org_id', org).eq('id', orc.lead_id).maybeSingle()
    const { data: perfil } = await sb.from('usuarios_perfil').select('leads_escopo').eq('id', quem.eu.id).maybeSingle()
    const soMeus = perfil?.leads_escopo === 'proprios'
    const meu = !lead?.vendedor_id || (soMeus ? lead.vendedor_id === quem.eu.id : quem.visiveis.has(lead.vendedor_id))
    if (!meu) return NextResponse.json({ ok: false, error: 'este lead não é teu' }, { status: 403 })

    return NextResponse.json({ ok: true, orcamento: orc })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
