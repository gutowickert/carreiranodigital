import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { pessoasAtivas } from '@/lib/pessoas-org'
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

    const cliente = (b.cliente || '').toString().trim()
    const produto = (b.produto || '').toString() as Produto
    const dataInicio = (b.data_inicio || '').toString().slice(0, 10)
    if (!cliente) return NextResponse.json({ ok: false, error: 'informe o cliente' }, { status: 200 })
    if (!ROTEIROS[produto]) return NextResponse.json({ ok: false, error: 'produto inválido' }, { status: 200 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) return NextResponse.json({ ok: false, error: 'informe a data de início' }, { status: 200 })

    const r = ROTEIROS[produto]
    const prazo = b.prazo_meses != null && b.prazo_meses !== '' ? Number(b.prazo_meses) : r.prazoMeses

    const { data: proj, error } = await sb.from('projetos').insert({
      org_id: org,
      lead_id: b.lead_id || null,
      cliente: cliente.slice(0, 120),
      whatsapp: (b.whatsapp || '').toString().replace(/\D/g, '') || null,
      produto,
      data_inicio: dataInicio,
      responsavel_id: b.responsavel_id || null,
      prazo_meses: prazo,
      fim_tipo: ['encerra', 'renegocia', 'manutencao'].includes(b.fim_tipo) ? b.fim_tipo : r.fimTipo,
      aviso_fim_dias: b.aviso_fim_dias != null ? Number(b.aviso_fim_dias) : r.avisoFimDias,
      data_fim: dataFimContrato(produto, dataInicio, prazo),
      mensalidade_dia: b.mensalidade_dia != null && b.mensalidade_dia !== '' ? Number(b.mensalidade_dia) : null,
      mensalidade_valor: b.mensalidade_valor != null && b.mensalidade_valor !== '' ? Number(b.mensalidade_valor) : null,
      fase: r.fases[0]?.chave || null,
      status: 'ativo',
      observacoes: (b.observacoes || '').toString().slice(0, 2000) || null,
    }).select('*').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

    // marco nasce sem dono: herda o responsável do projeto (a agenda faz esse fallback), e trocar o
    // responsável do projeto depois leva todos junto. Dono próprio só quando alguém escolhe na ficha.
    const marcos = marcosDoRoteiro(produto, dataInicio).map(m => ({ ...m, org_id: org, projeto_id: proj.id, responsavel_id: null }))
    await sb.from('projeto_marcos').insert(marcos)

    await sb.from('projeto_andamentos').insert({
      org_id: org, projeto_id: proj.id, tipo: 'criado',
      observacao: `Projeto de ${r.nome} criado — início em ${dataInicio.split('-').reverse().join('/')}, ${marcos.length} marcos no roteiro.`,
      autor: (b.autor || '').toString() || null,
    })

    // marca no lead que ele virou entrega (não quebra se a coluna não existir)
    if (b.lead_id) {
      try {
        await sb.from('lead_andamentos').insert({
          lead_id: b.lead_id, tipo: 'entrega',
          observacao: `📦 Entrou em entrega: ${r.nome}, início ${dataInicio.split('-').reverse().join('/')}.`,
        })
      } catch { /* segue */ }
    }

    return NextResponse.json({ ok: true, id: proj.id, marcos: marcos.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
