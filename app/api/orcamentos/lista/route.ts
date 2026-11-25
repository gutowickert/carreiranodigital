import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 60

// TODAS AS PROPOSTAS JÁ FEITAS (25/11/2026, pedido do Nando: "o Rick precisa ver as propostas já feitas").
// A tela Gerar orçamento só mostrava as de um lead depois de escolher a pessoa. Aqui vem a lista inteira, as mais
// novas primeiro: rascunho ou publicada, pra quem, o quê, o valor, quantas vezes o cliente abriu e se aceitou.
// As tabelas de orçamento são fechadas pro navegador (como em /api/orcamentos/por-lead): a tela pede aqui.
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const { data: orcs } = await sb.from('orcamentos')
      .select('id, lead_id, slug, situacao, produto_nome, preco_vista, preco_parcelado, parcelas, cliente_nome, criado_em, publicado_em, aceito_em, aceito_nome, criado_por')
      .eq('org_id', org).order('criado_em', { ascending: false }).limit(300)
    const lista = orcs || []
    if (!lista.length) return NextResponse.json({ ok: true, propostas: [] })

    const leadIds = Array.from(new Set(lista.map(o => o.lead_id).filter(Boolean)))
    const leads: Record<string, any> = {}
    for (let i = 0; i < leadIds.length; i += 200) {
      const { data } = await sb.from('leads').select('id, nome, etapa, vendedor_id').in('id', leadIds.slice(i, i + 200))
      for (const l of data || []) leads[l.id] = l
    }
    // quem só vê os próprios leads (vendedor) só vê as propostas deles; dono e quem está acima vê tudo
    const pode = (o: any) => quem.souDono || quem.eu.papel === 'admin' || !leads[o.lead_id]?.vendedor_id || quem.visiveis.has(leads[o.lead_id].vendedor_id)

    const ids = lista.map(o => o.id)
    const aberturas = new Map<string, { n: number; ultima: string }>()
    for (let i = 0; i < ids.length; i += 200) {
      for (let de = 0; ; de += 1000) {
        const { data } = await sb.from('orcamento_aberturas').select('orcamento_id, criado_em')
          .in('orcamento_id', ids.slice(i, i + 200)).order('criado_em').order('id').range(de, de + 999)
        for (const a of data || []) {
          const at = aberturas.get(a.orcamento_id) || { n: 0, ultima: a.criado_em }
          at.n++; if (a.criado_em > at.ultima) at.ultima = a.criado_em
          aberturas.set(a.orcamento_id, at)
        }
        if (!data || data.length < 1000) break
      }
    }

    const propostas = lista.filter(pode).map(o => ({
      id: o.id, lead_id: o.lead_id, slug: o.slug, situacao: o.situacao,
      produto: o.produto_nome, valor: o.preco_vista, parcelado: o.preco_parcelado, parcelas: o.parcelas,
      cliente: o.cliente_nome || leads[o.lead_id]?.nome || null, lead_nome: leads[o.lead_id]?.nome || null, etapa: leads[o.lead_id]?.etapa || null,
      criado_em: o.criado_em, publicado_em: o.publicado_em, aceito_em: o.aceito_em, aceito_nome: o.aceito_nome,
      aberturas: aberturas.get(o.id)?.n || 0, ultima_abertura: aberturas.get(o.id)?.ultima || null,
    }))
    return NextResponse.json({ ok: true, propostas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
