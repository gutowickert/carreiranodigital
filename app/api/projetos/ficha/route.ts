import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { ROTEIROS, situacaoMarco, dataFimContrato, type Produto } from '@/lib/entrega'

// Ficha do cliente em entrega: o projeto, a linha do tempo, os andamentos e o
// que está pendente COM O CLIENTE. GET lê, PATCH edita o cadastro, POST mexe nas
// pendências (que é o que mais atrasa implantação e hoje fica solto no WhatsApp).

export async function GET(req: Request) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })

    const { data: projeto } = await sb.from('projetos').select('*').eq('org_id', org).eq('id', id).maybeSingle()
    if (!projeto) return NextResponse.json({ ok: false, error: 'projeto não encontrado' }, { status: 200 })

    const [{ data: marcos }, { data: andamentos }, { data: pendencias }] = await Promise.all([
      sb.from('projeto_marcos').select('*').eq('projeto_id', id).order('ordem'),
      sb.from('projeto_andamentos').select('*').eq('projeto_id', id).order('criado_em', { ascending: false }).limit(100),
      sb.from('projeto_pendencias').select('*').eq('projeto_id', id).order('criado_em'),
    ])

    const r = ROTEIROS[projeto.produto as Produto]
    const comSituacao = (marcos || []).map(m => ({ ...m, situacao: situacaoMarco(m) }))

    return NextResponse.json({
      ok: true,
      projeto: { ...projeto, roteiro: r?.nome || projeto.produto, cor: r?.cor || '#9ca3af', fases: r?.fases || [] },
      marcos: comSituacao,
      andamentos: andamentos || [],
      pendencias: pendencias || [],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function PATCH(req: Request) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const id = (b.id || '').toString()
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })

    const { data: atual } = await sb.from('projetos').select('*').eq('org_id', org).eq('id', id).maybeSingle()
    if (!atual) return NextResponse.json({ ok: false, error: 'projeto não encontrado' }, { status: 200 })

    const p: any = { atualizado_em: new Date().toISOString() }
    if (b.cliente != null) p.cliente = b.cliente.toString().slice(0, 120)
    if (b.whatsapp != null) p.whatsapp = b.whatsapp.toString().replace(/\D/g, '') || null
    if (b.responsavel_id !== undefined) p.responsavel_id = b.responsavel_id || null
    if (b.prazo_meses !== undefined) p.prazo_meses = b.prazo_meses === '' || b.prazo_meses == null ? null : Number(b.prazo_meses)
    if (b.fim_tipo && ['encerra', 'renegocia', 'manutencao'].includes(b.fim_tipo)) p.fim_tipo = b.fim_tipo
    if (b.aviso_fim_dias !== undefined) p.aviso_fim_dias = Number(b.aviso_fim_dias) || 30
    if (b.mensalidade_dia !== undefined) p.mensalidade_dia = b.mensalidade_dia === '' || b.mensalidade_dia == null ? null : Number(b.mensalidade_dia)
    if (b.mensalidade_valor !== undefined) p.mensalidade_valor = b.mensalidade_valor === '' || b.mensalidade_valor == null ? null : Number(b.mensalidade_valor)
    if (b.observacoes !== undefined) p.observacoes = (b.observacoes || '').toString().slice(0, 2000) || null
    if (b.fase) p.fase = b.fase
    if (b.status && ['ativo', 'manutencao', 'concluido', 'cancelado'].includes(b.status)) p.status = b.status

    // mudou o prazo → recalcula a data de fim
    if (p.prazo_meses !== undefined) {
      p.data_fim = dataFimContrato(atual.produto as Produto, atual.data_inicio, p.prazo_meses)
    }

    await sb.from('projetos').update(p).eq('org_id', org).eq('id', id)

    if (b.status === 'cancelado') {
      await sb.from('projeto_andamentos').insert({
        org_id: org, projeto_id: id, tipo: 'cancelado',
        observacao: `🚫 Projeto cancelado.${b.motivo ? ' Motivo: ' + b.motivo : ''}`, autor: (b.autor || '').toString() || null,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

// pendências com o cliente + anotação solta na ficha
export async function POST(req: Request) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const acao = (b.acao || '').toString()
    const projetoId = (b.projeto_id || '').toString()
    if (!projetoId) return NextResponse.json({ ok: false, error: 'falta projeto' }, { status: 200 })

    if (acao === 'pendencia_nova') {
      const d = (b.descricao || '').toString().trim()
      if (!d) return NextResponse.json({ ok: false, error: 'descreva o que falta' }, { status: 200 })
      await sb.from('projeto_pendencias').insert({ org_id: org, projeto_id: projetoId, descricao: d.slice(0, 200) })
      await sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: projetoId, tipo: 'pendencia', observacao: `📌 Pedido ao cliente: ${d}` })
      return NextResponse.json({ ok: true })
    }
    if (acao === 'pendencia_entregue') {
      await sb.from('projeto_pendencias').update({ entregue_em: new Date().toISOString().slice(0, 10) }).eq('org_id', org).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }
    if (acao === 'pendencia_remover') {
      await sb.from('projeto_pendencias').delete().eq('org_id', org).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }
    if (acao === 'nota') {
      const t = (b.texto || '').toString().trim()
      if (!t) return NextResponse.json({ ok: false, error: 'escreva a nota' }, { status: 200 })
      await sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: projetoId, tipo: 'nota', observacao: t.slice(0, 2000), autor: (b.autor || '').toString() || null })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
