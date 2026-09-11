import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { getInsightsConta } from '@/lib/meta-ads'

// Números da conta de anúncio do CLIENTE, desde o início do projeto até hoje.
// É o topo do funil que vem sozinho — o resto (propostas, vendas, comissão) vem
// do placar enquanto o CRM dele não está no ar.
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })

    const { data: p } = await sb.from('projetos').select('ad_account_id, data_inicio').eq('org_id', org).eq('id', id).maybeSingle()
    if (!p) return NextResponse.json({ ok: false, error: 'projeto não encontrado' }, { status: 200 })
    if (!p.ad_account_id) return NextResponse.json({ ok: false, error: 'sem conta de anúncio', sem_conta: true }, { status: 200 })

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const desde = String(p.data_inicio).slice(0, 10)
    const r = await getInsightsConta(p.ad_account_id, desde, hoje)
    return NextResponse.json({ ...r, desde, ate: hoje }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
