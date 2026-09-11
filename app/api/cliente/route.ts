import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { ROTEIROS, type Produto } from '@/lib/entrega'
import { getInsightsConta, comImposto } from '@/lib/meta-ads'
import { impostoMetaPct } from '@/lib/imposto-meta'
import { periodoAnterior } from '@/lib/periodos'

// ÁREA DO CLIENTE — o que o assinante vê do próprio projeto (/cliente?k=…).
// Sem login: a chave do link (projetos.portal_chave) abre UM projeto, e só ele.
// Nunca sai daqui o que é da escola: observações do projeto, andamentos, o
// registro interno de cada encontro, responsável.

async function projetoDaChave(k: string | null) {
  if (!k || k.length < 12) return null
  const { data } = await sb.from('projetos').select('*').eq('portal_chave', k).maybeSingle()
  return data && data.status !== 'cancelado' ? data : null
}

const BUCKET = 'provas'
const ehData = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams
    const p = await projetoDaChave(sp.get('k'))
    if (!p) return NextResponse.json({ ok: false, error: 'link inválido ou desativado' }, { status: 403 })

    // só o tráfego de um período (a tela troca o período sem recarregar o resto)
    if (sp.get('so') === 'meta') {
      if (!p.ad_account_id) return NextResponse.json({ ok: false, error: 'sem conta de anúncio' })
      const hoje = hojeBR()
      let de = ehData(sp.get('de')) ? sp.get('de')! : String(p.data_inicio).slice(0, 10)
      let ate = ehData(sp.get('ate')) ? sp.get('ate')! : hoje
      if (ate > hoje) ate = hoje
      if (de > ate) [de, ate] = [ate, de]
      // o período de mesmo tamanho logo antes, pra comparação nos cartões
      const [deAnt, ateAnt] = periodoAnterior(de, ate)
      const [bruto, brutoAnt, pct] = await Promise.all([
        getInsightsConta(p.ad_account_id, de, ate), getInsightsConta(p.ad_account_id, deAnt, ateAnt), impostoMetaPct(p.org_id),
      ])
      const r = comImposto(bruto, pct)
      const ant = comImposto(brutoAnt, pct)
      return NextResponse.json({ ok: r.ok, error: r.error, total: r.total, porDia: r.porDia, de, ate,
        anterior: ant.ok ? ant.total : null, de_anterior: deAnt, ate_anterior: ateAnt })
    }

    const [{ data: marcos }, { data: pendencias }, { data: placar }, { data: registros }] = await Promise.all([
      sb.from('projeto_marcos').select('id, titulo, natureza, ordem, ancora, data_prevista, data_combinada, estado, concluido_em, chave').eq('projeto_id', p.id).order('ordem'),
      sb.from('projeto_pendencias').select('id, descricao, pedido_em, entregue_em').eq('projeto_id', p.id).order('criado_em'),
      sb.from('projeto_placar').select('id, data, mes, ponto_a, verba, conversas, leads, propostas, vendas, comissao, fonte, observacao').eq('projeto_id', p.id).order('data'),
      sb.from('projeto_registros').select('id, tipo, titulo, descricao, data, arquivo_path, arquivo_mime').eq('projeto_id', p.id).order('data', { ascending: false }),
    ])

    const r = ROTEIROS[p.produto as Produto]
    const descricao = Object.fromEntries((r?.marcos || []).map(m => [m.chave, m.descricao || '']))

    const comLink = await Promise.all((registros || []).map(async x => {
      const { arquivo_path, ...resto } = x
      if (!arquivo_path) return resto
      const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(arquivo_path, 3600)
      return { ...resto, arquivo_url: s?.signedUrl || null }
    }))

    return NextResponse.json({
      ok: true,
      projeto: {
        cliente: p.cliente, produto: r?.nome || p.produto, cor: r?.cor || '#9ca3af',
        fase: r?.fases.find(f => f.chave === p.fase)?.label || null,
        data_inicio: p.data_inicio, data_fim: p.data_fim, status: p.status,
        mensalidade_dia: p.mensalidade_dia, mensalidade_valor: p.mensalidade_valor,
        meta_objetivo: p.meta_objetivo, meta_leads: p.meta_leads, meta_vendas: p.meta_vendas, meta_faturamento: p.meta_faturamento,
        tem_conta_anuncio: !!p.ad_account_id,
      },
      marcos: (marcos || []).map(({ chave, ...m }) => ({ ...m, descricao: descricao[chave] || '' })),
      pendencias: pendencias || [],
      placar: placar || [],
      registros: comLink,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 500 })
  }
}

// o cliente confirma o encontro que foi combinado com ele — tira da escola o
// trabalho de reconfirmar 2 dias antes
export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}))
    const p = await projetoDaChave(b.k)
    if (!p) return NextResponse.json({ ok: false, error: 'link inválido ou desativado' }, { status: 403 })
    if (b.acao !== 'confirmar' || !b.id) return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 400 })

    const { data: m } = await sb.from('projeto_marcos').select('id, titulo, estado, natureza, data_combinada').eq('projeto_id', p.id).eq('id', b.id).maybeSingle()
    if (!m) return NextResponse.json({ ok: false, error: 'encontro não encontrado' }, { status: 404 })
    if (m.estado === 'confirmado') return NextResponse.json({ ok: true })
    if (m.estado !== 'combinado' || m.natureza !== 'encontro') return NextResponse.json({ ok: false, error: 'esse encontro ainda não tem data combinada' })

    const agora = new Date().toISOString()
    await sb.from('projeto_marcos').update({ estado: 'confirmado', confirmado_em: agora, atualizado_em: agora }).eq('id', m.id)
    await sb.from('projeto_andamentos').insert({
      org_id: p.org_id, projeto_id: p.id, tipo: 'confirmado',
      observacao: `✅ ${p.cliente} confirmou pela área do cliente: ${m.titulo}.`, autor: 'área do cliente',
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 500 })
  }
}
