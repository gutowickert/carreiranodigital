import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { ROTEIROS, situacaoMarco, type Produto } from '@/lib/entrega'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

// Agenda de entregas. Devolve os marcos de um período com o estado de cada um —
// é o estado que define o peso visual: previsto (sombra, sem hora), combinado
// (sólido pontilhado, falta reconfirmar) e confirmado (sólido limpo).

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)

    // QUEM PEDIU. Sem isto a rota respondia pra qualquer um — inclusive sem login: sem token,
    // `orgDaRequest` cai na empresa padrão e a lista vinha inteira. E com a hierarquia valendo,
    // era por aqui que o subordinado leria a agenda de quem está acima, que a agenda geral esconde.
    // A regra é a mesma da agenda geral (lib/quem-eu-vejo.ts), pra as duas não divergirem.
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const sp = new URL(req.url).searchParams
    const de = (sp.get('de') || '').slice(0, 10)
    const ate = (sp.get('ate') || '').slice(0, 10)
    const responsavel = sp.get('responsavel') || ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      return NextResponse.json({ ok: false, error: 'informe de e ate (YYYY-MM-DD)' }, { status: 200 })
    }

    // pega tudo do período pela data prevista (a combinada sempre acompanha a prevista)
    let q = sb.from('projeto_marcos').select('*')
      .eq('org_id', org)
      .gte('data_prevista', de).lte('data_prevista', ate)
      .not('estado', 'in', '(concluido,cancelado)')
    if (responsavel) q = q.eq('responsavel_id', responsavel)
    const { data: marcos } = await q.order('data_prevista')

    const ids = [...new Set((marcos || []).map(m => m.projeto_id))]
    const { data: projetos } = ids.length
      ? await sb.from('projetos').select('id, cliente, produto, status, responsavel_id').in('id', ids)
      : { data: [] as any[] }
    const porId: Record<string, any> = {}
    for (const p of projetos || []) porId[p.id] = p

    const itens = (marcos || []).map(m => {
      const p = porId[m.projeto_id]
      const r = p ? ROTEIROS[p.produto as Produto] : null
      return {
        id: m.id,
        projeto_id: m.projeto_id,
        cliente: p?.cliente || '—',
        produto: p?.produto || null,
        cor: r?.cor || '#9ca3af',
        titulo: m.titulo,
        natureza: m.natureza,
        estado: m.estado,
        situacao: situacaoMarco(m),
        data: m.data_combinada || m.data_prevista,
        tem_hora: !!m.data_combinada,
        duracao_min: m.duracao_min,
        responsavel_id: m.responsavel_id,
      }
    })
      .filter(i => !!i.data)
      // Marco sem responsável é do time e todos veem; com responsável, só quem enxerga essa pessoa.
      .filter(i => !i.responsavel_id || quem.visiveis.has(i.responsavel_id))

    return NextResponse.json({ ok: true, itens })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
