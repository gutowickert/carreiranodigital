import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { getInsightsConta, comImposto } from '@/lib/meta-ads'
import { impostoMetaPct } from '@/lib/imposto-meta'

// Números da conta de anúncio do CLIENTE, desde o início do projeto até hoje.
// É o topo do funil que vem sozinho — o resto (propostas, vendas, comissão) vem
// do placar enquanto o CRM dele não está no ar.
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const sp = new URL(req.url).searchParams
    const id = sp.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })
    const ehData = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

    const { data: p } = await sb.from('projetos').select('ad_account_id, data_inicio').eq('org_id', org).eq('id', id).maybeSingle()
    if (!p) return NextResponse.json({ ok: false, error: 'projeto não encontrado' }, { status: 200 })
    if (!p.ad_account_id) return NextResponse.json({ ok: false, error: 'sem conta de anúncio', sem_conta: true }, { status: 200 })

    // período: o que a tela pedir; sem pedido, desde o início do projeto até hoje
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    let desde = ehData(sp.get('de')) ? sp.get('de')! : String(p.data_inicio).slice(0, 10)
    let ate = ehData(sp.get('ate')) ? sp.get('ate')! : hoje
    if (ate > hoje) ate = hoje                     // a Meta não tem o futuro
    if (desde > ate) [desde, ate] = [ate, desde]   // de/até invertidos: desinverte em vez de dar erro
    const [bruto, pct] = await Promise.all([getInsightsConta(p.ad_account_id, desde, ate), impostoMetaPct(org)])
    const r = comImposto(bruto, pct)
    return NextResponse.json({ ...r, desde, ate, inicio_projeto: String(p.data_inicio).slice(0, 10) }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
