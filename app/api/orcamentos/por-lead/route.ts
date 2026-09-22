import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 60

// Resumo das propostas publicadas, por lead — é o que acende o chip no card do funil:
// "proposta enviada" e, quando o cliente abre o link, "✓ abriu a proposta".
//
// Existe porque as tabelas de orçamento estão fechadas pro navegador (proteção de linha sem regra).
// A tela do funil não consegue lê-las direto; pede aqui, com o login, e recebe só o resumo.
//
// Devolve um mapa { lead_id: { publicado_em, slug, aberturas, ultima_abertura } } — nada do conteúdo
// da proposta, porque o card não precisa dele.

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const publicados: any[] = []
    for (let de = 0; ; de += 1000) {
      const { data } = await sb.from('orcamentos')
        .select('id, lead_id, slug, publicado_em, aceito_em, aceito_nome')
        .eq('org_id', org).eq('situacao', 'publicado')
        .order('publicado_em', { ascending: false }).order('id').range(de, de + 999)
      publicados.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    if (!publicados.length) return NextResponse.json({ ok: true, porLead: {} })

    // aberturas de todas elas, em blocos
    const ids = publicados.map(o => o.id)
    const aberturas = new Map<string, { n: number; ultima: string }>()
    for (let i = 0; i < ids.length; i += 200) {
      const bloco = ids.slice(i, i + 200)
      for (let de = 0; ; de += 1000) {
        const { data } = await sb.from('orcamento_aberturas')
          .select('orcamento_id, criado_em')
          .in('orcamento_id', bloco).order('criado_em').order('id').range(de, de + 999)
        for (const a of data || []) {
          const atual = aberturas.get(a.orcamento_id) || { n: 0, ultima: a.criado_em }
          atual.n++
          if (a.criado_em > atual.ultima) atual.ultima = a.criado_em
          aberturas.set(a.orcamento_id, atual)
        }
        if (!data || data.length < 1000) break
      }
    }

    // um lead pode ter várias propostas: vale a mais recente
    const porLead: Record<string, any> = {}
    for (const o of publicados) {
      if (porLead[o.lead_id]) continue
      const ab = aberturas.get(o.id)
      porLead[o.lead_id] = {
        slug: o.slug,
        publicado_em: o.publicado_em,
        aberturas: ab?.n || 0,
        ultima_abertura: ab?.ultima || null,
        // o aceite do cliente: é o que acende o selo verde no card, acima do "abriu"
        aceito_em: o.aceito_em || null,
        aceito_nome: o.aceito_nome || null,
      }
    }

    return NextResponse.json({ ok: true, porLead })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
