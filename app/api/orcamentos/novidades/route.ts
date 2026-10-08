import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { usuarioLogado } from '@/lib/exigir-login'
import { orgDaRequest } from '@/lib/org'

// AS NOVIDADES DAS PROPOSTAS (08/10/2026, pedido do Nando). Com login.
//   GET  → { aceites: os aceitos que ninguém deu seguimento ainda, eventos: aberturas e aceites dos últimos 7 dias }
//   POST { id } → "Dei seguimento": a faixa verde do aceite some pra todos e fica registrado quem e quando
//
// ⚠️ POR QUE EXISTE. O aceite só virava uma linha no histórico do lead, e a abertura, um push que some.
// O Rodrigo Zart abriu às 15h03, aceitou às 15h09 de 08/10, e ninguém foi avisado do aceite; o
// Eduardo Sehnem, idem em 07/10. Aceite é a hora de fechar: tem que ficar na cara até alguém agir.

const SETE_DIAS = 7 * 864e5

export async function GET(req: Request) {
  try {
    const uid = await usuarioLogado(req)
    if (!uid) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(req.headers.get('authorization'))
    const desde = new Date(Date.now() - SETE_DIAS).toISOString()

    const [{ data: pend, error: e1 }, { data: aceitosSemana }, { data: abertas }] = await Promise.all([
      sb.from('orcamentos').select('id, lead_id, cliente_nome, produto_nome, aceito_em, aceito_nome')
        .eq('org_id', org).not('aceito_em', 'is', null).is('seguimento_em', null).order('aceito_em', { ascending: false }).limit(20),
      sb.from('orcamentos').select('id, lead_id, cliente_nome, produto_nome, aceito_em, aceito_nome, seguimento_em, seguimento_por_nome')
        .eq('org_id', org).gte('aceito_em', desde).order('aceito_em', { ascending: false }).limit(100),
      sb.from('orcamento_aberturas').select('orcamento_id, criado_em, dispositivo')
        .eq('org_id', org).gte('criado_em', desde).order('criado_em', { ascending: false }).limit(300),
    ])
    // sem a coluna de seguimento (o script db/orcamentos-seguimento.sql não rodou): a faixa fica vazia
    // em vez de derrubar o resto
    const aceites = e1 ? [] : (pend || [])

    // os orçamentos das aberturas, e se cada abertura foi a PRIMEIRA daquele orçamento (abriu) ou não (voltou)
    const ids = [...new Set((abertas || []).map(a => a.orcamento_id))]
    const [{ data: orcs }, { data: primeiras }] = ids.length ? await Promise.all([
      sb.from('orcamentos').select('id, lead_id, cliente_nome, produto_nome').in('id', ids),
      sb.from('orcamento_aberturas').select('orcamento_id, criado_em').in('orcamento_id', ids).order('criado_em', { ascending: true }).limit(2000),
    ]) : [{ data: [] as any[] }, { data: [] as any[] }]
    const O = Object.fromEntries((orcs || []).map(o => [o.id, o]))
    const primeiraDe: Record<string, string> = {}
    for (const p of primeiras || []) if (!primeiraDe[p.orcamento_id]) primeiraDe[p.orcamento_id] = p.criado_em

    const eventos = [
      ...(aceitosSemana || []).map(o => ({
        tipo: 'aceitou' as const, em: o.aceito_em, orcamento_id: o.id, lead_id: o.lead_id, cliente: o.cliente_nome, produto: o.produto_nome,
        detalhe: o.seguimento_em ? `seguimento: ${o.seguimento_por_nome || 'alguém do time'}` : 'sem seguimento ainda',
      })),
      ...(abertas || []).filter(a => O[a.orcamento_id]).map(a => ({
        tipo: (primeiraDe[a.orcamento_id] === a.criado_em ? 'abriu' : 'voltou') as 'abriu' | 'voltou',
        em: a.criado_em, orcamento_id: a.orcamento_id, lead_id: O[a.orcamento_id].lead_id,
        cliente: O[a.orcamento_id].cliente_nome, produto: O[a.orcamento_id].produto_nome, detalhe: `no ${a.dispositivo}`,
      })),
    ].sort((a, b) => +new Date(b.em) - +new Date(a.em))

    return NextResponse.json({ ok: true, aceites, eventos, pronto: !e1 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: Request) {
  try {
    const uid = await usuarioLogado(req)
    if (!uid) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const id = String(b.id || '')
    const { data: eu } = await sb.from('usuarios_perfil').select('id, nome').eq('id', uid).maybeSingle()
    const nome = (eu?.nome || '').trim().split(' ')[0] || 'Alguém do time'
    const agora = new Date().toISOString()
    // só o primeiro "dei seguimento" vale (dois cliques ao mesmo tempo, de duas pessoas)
    const { data: orc, error } = await sb.from('orcamentos')
      .update({ seguimento_em: agora, seguimento_por: eu?.id || null, seguimento_por_nome: nome })
      .eq('org_id', org).eq('id', id).not('aceito_em', 'is', null).is('seguimento_em', null)
      .select('id, lead_id, cliente_nome').maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message })
    if (orc?.lead_id) {
      try {
        await sb.from('lead_andamentos').insert({ lead_id: orc.lead_id, tipo: 'observacao', observacao: `✅ ${nome} deu seguimento ao aceite da proposta.` })
      } catch { /* o histórico não pode impedir o seguimento */ }
    }
    return NextResponse.json({ ok: true, ja_estava: !orc })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
