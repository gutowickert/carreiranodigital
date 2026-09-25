import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { pessoasAtivas } from '@/lib/pessoas-org'
import { criarProjeto } from '@/lib/criar-projeto'
import { ROTEIROS, marcosDoRoteiro, dataFimContrato, situacaoMarco, type Produto } from '@/lib/entrega'

// Projetos = clientes vendidos EM ENTREGA. GET lista com o próximo compromisso
// de cada um; POST cria o projeto e já gera todos os marcos do roteiro.

export async function GET(req: Request) {
  try {
    // Sem login, não responde: sem token, `orgDaRequest` cai na empresa padrão e a rota entregava
    // (e gravava) como se fosse gente de dentro. Todas as telas de entregas já mandam o login.
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let q = sb.from('projetos').select('*').eq('org_id', org)
    if (status) q = q.eq('status', status)
    else q = q.neq('status', 'cancelado')
    const { data: projetos } = await q.order('data_inicio', { ascending: true })
    const pessoas = await pessoasAtivas(org)
    if (!projetos?.length) return NextResponse.json({ ok: true, projetos: [], resumo: vazio(), pessoas })

    const ids = projetos.map(p => p.id)
    const { data: marcos } = await sb.from('projeto_marcos').select('*').in('projeto_id', ids).order('ordem')

    const porProjeto: Record<string, any[]> = {}
    for (const m of marcos || []) (porProjeto[m.projeto_id] ||= []).push(m)

    const resumo = vazio()
    const saida = projetos.map(p => {
      const ms = porProjeto[p.id] || []
      const pendentes = ms.filter(m => m.estado !== 'concluido' && m.estado !== 'cancelado')
      // o próximo é o mais cedo entre os pendentes (pela data combinada, senão prevista)
      const prox = [...pendentes].sort((a, b) =>
        String(a.data_combinada || a.data_prevista || '9999').localeCompare(String(b.data_combinada || b.data_prevista || '9999')))[0] || null

      let atrasados = 0, aConfirmar = 0
      for (const m of pendentes) {
        const s = situacaoMarco(m)
        if (s === 'atrasado') atrasados++
        if (s === 'confirmar') aConfirmar++
        if (s === 'a_remarcar') atrasados++
      }
      resumo.atrasados += atrasados
      resumo.a_confirmar += aConfirmar
      if (!pendentes.length && p.status === 'ativo') resumo.sem_proximo++

      // contrato vencendo
      const fim = p.data_fim
      if (fim && p.status !== 'concluido') {
        const dias = Math.round((new Date(fim + 'T12:00:00Z').getTime() - Date.now()) / 86400000)
        if (dias >= 0 && dias <= (p.aviso_fim_dias || 30)) resumo.vencendo++
      }

      return {
        ...p,
        roteiro: ROTEIROS[p.produto as Produto]?.nome || p.produto,
        cor: ROTEIROS[p.produto as Produto]?.cor || '#9ca3af',
        total_marcos: ms.length,
        concluidos: ms.filter(m => m.estado === 'concluido').length,
        atrasados, a_confirmar: aConfirmar,
        proximo: prox ? {
          id: prox.id, titulo: prox.titulo, natureza: prox.natureza, estado: prox.estado,
          data: prox.data_combinada || prox.data_prevista, situacao: situacaoMarco(prox),
        } : null,
      }
    })

    return NextResponse.json({ ok: true, projetos: saida, resumo, pessoas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

function vazio() { return { atrasados: 0, a_confirmar: 0, sem_proximo: 0, vencendo: 0 } }

export async function POST(req: Request) {
  try {
    // Sem login, não responde: sem token, `orgDaRequest` cai na empresa padrão e a rota entregava
    // (e gravava) como se fosse gente de dentro. Todas as telas de entregas já mandam o login.
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const b = await req.json().catch(() => ({} as any))
    const num = (v: any) => (v == null || v === '' ? null : Number(v))
    // a criação em si vive em lib/criar-projeto.ts: é o mesmo caminho do assistente do WhatsApp
    const r = await criarProjeto(org, {
      cliente: (b.cliente || '').toString(), produto: (b.produto || '').toString() as Produto, data_inicio: (b.data_inicio || '').toString(),
      whatsapp: b.whatsapp, lead_id: b.lead_id || null, responsavel_id: b.responsavel_id || null, participantes: Array.isArray(b.participantes) ? b.participantes : [],
      prazo_meses: num(b.prazo_meses), fim_tipo: b.fim_tipo || null, aviso_fim_dias: num(b.aviso_fim_dias),
      mensalidade_dia: num(b.mensalidade_dia), mensalidade_valor: num(b.mensalidade_valor), observacoes: b.observacoes || null, autor: (b.autor || '').toString() || null,
    })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 200 })
    return NextResponse.json({ ok: true, id: r.id, marcos: r.marcos })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
