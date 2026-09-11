import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { getInsightsConta } from '@/lib/meta-ads'
import { ROTEIROS, type Produto } from '@/lib/entrega'
import { hojeBR, periodoAnterior } from '@/lib/periodos'

// Tráfego de TODOS os clientes com conta de anúncio ligada, num período, lado a
// lado com o período anterior de mesmo tamanho. É o "como estão as campanhas de
// todo mundo" numa tela só.
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)

    const sp = new URL(req.url).searchParams
    const ehData = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
    const hoje = hojeBR()
    let de = ehData(sp.get('de')) ? sp.get('de')! : hoje
    let ate = ehData(sp.get('ate')) ? sp.get('ate')! : hoje
    if (ate > hoje) ate = hoje
    if (de > ate) [de, ate] = [ate, de]
    const [deAnt, ateAnt] = periodoAnterior(de, ate)

    const { data: projetos } = await sb.from('projetos')
      .select('id, cliente, produto, status, data_inicio, ad_account_id')
      .eq('org_id', org).in('status', ['ativo', 'manutencao']).not('ad_account_id', 'is', null)
      .order('cliente')

    const linhas = await Promise.all((projetos || []).map(async p => {
      const [atual, anterior] = await Promise.all([
        getInsightsConta(p.ad_account_id!, de, ate),
        getInsightsConta(p.ad_account_id!, deAnt, ateAnt),
      ])
      return {
        id: p.id,
        cliente: p.cliente,
        produto: ROTEIROS[p.produto as Produto]?.nome || p.produto,
        conta: atual.conta?.nome || null,
        // conta pausada/desativada (status != 1) é o primeiro sinal de que algo parou
        conta_ativa: atual.conta ? atual.conta.status === 1 : null,
        ok: atual.ok,
        erro: atual.ok ? null : atual.error,
        atual: atual.total,
        anterior: anterior.ok ? anterior.total : null,
        porDia: atual.porDia,
        // o período anterior começa antes do projeto? então a comparação é injusta
        anterior_antes_do_inicio: String(p.data_inicio).slice(0, 10) > deAnt,
      }
    }))

    const soma = (k: 'gasto' | 'conversas' | 'cliques' | 'impressoes', qual: 'atual' | 'anterior') =>
      linhas.reduce((s, l) => s + (l.ok && l[qual] ? Number((l[qual] as any)[k] || 0) : 0), 0)

    const tot = {
      gasto: soma('gasto', 'atual'), conversas: soma('conversas', 'atual'),
      gastoAnt: soma('gasto', 'anterior'), conversasAnt: soma('conversas', 'anterior'),
    }

    return NextResponse.json({
      ok: true, de, ate, de_anterior: deAnt, ate_anterior: ateAnt,
      total: {
        ...tot,
        custoConversa: tot.conversas ? tot.gasto / tot.conversas : null,
        custoConversaAnt: tot.conversasAnt ? tot.gastoAnt / tot.conversasAnt : null,
      },
      linhas,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
