import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Executa uma AÇÃO proposta pelo Agente Interno, DEPOIS que o usuário confirma no cartão.
//  POST { email, pendencia:{tipo, ...} }
const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com']
const mesRef = (d: string) => (d || '').slice(0, 8) + '01'

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const email = (b.email || '').toLowerCase()
    if (!PERMITIDOS.includes(email)) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
    const p = b.pendencia
    if (!p?.tipo) return NextResponse.json({ ok: false, error: 'proposta inválida' }, { status: 200 })
    let resultado: any = {}

    if (p.tipo === 'despesas') {
      const { data: contas } = await supabase.from('contas_financeiras').select('id, nome')
      const contaId = (nome: string) => {
        const c = (contas || []).find((x: any) => (x.nome || '').toLowerCase().includes((nome || '').toLowerCase()))
        return c?.id || (contas || []).find((x: any) => /banc/i.test(x.nome))?.id || null
      }
      const rows = (p.itens || []).map((d: any) => ({
        tipo: 'custo', categoria: d.categoria || 'outro', descricao: d.descricao, valor: d.valor,
        status: d.status === 'previsto' ? 'previsto' : 'realizado', unidade: 'geral',
        data_vencimento: d.data, data_pagamento: d.status === 'previsto' ? null : d.data,
        mes_referencia: mesRef(d.data), conta_id: contaId(d.conta || 'Conta Bancária PJ'), recorrente: false,
      }))
      const { error, data } = await supabase.from('lancamentos_empresa').insert(rows).select('id')
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
      resultado = { criados: (data || []).length, total: rows.reduce((s: number, r: any) => s + r.valor, 0) }
    }

    else if (p.tipo === 'lead') {
      const d = p.dados || {}
      const campos: any = {}
      for (const k of ['nome', 'whatsapp', 'origem', 'etapa', 'valor_venda', 'codigo_turma', 'motivo_ganho', 'data_ganho', 'data_perda', 'atendido_por']) if (d[k] != null) campos[k] = d[k]
      if (campos.etapa === 'ganho' && !campos.data_ganho) campos.data_ganho = new Date().toISOString()
      if (campos.etapa === 'perda' && !campos.data_perda) campos.data_perda = new Date().toISOString()
      if (campos.codigo_turma) { const { data: t } = await supabase.from('turmas').select('id').eq('codigo', campos.codigo_turma).maybeSingle(); if (t) campos.turma_id = t.id }
      if (p.acao === 'criar') {
        if (!campos.nome) return NextResponse.json({ ok: false, error: 'falta o nome do lead' }, { status: 200 })
        if (!campos.etapa) campos.etapa = 'novo'
        const { data, error } = await supabase.from('leads').insert(campos).select('id').single()
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
        resultado = { criado: data.id }
      } else {
        const { data: achado } = await supabase.from('leads').select('id, nome').ilike('nome', `%${p.busca}%`).limit(1).maybeSingle()
        if (!achado) return NextResponse.json({ ok: false, error: `lead "${p.busca}" não encontrado` }, { status: 200 })
        const { error } = await supabase.from('leads').update(campos).eq('id', achado.id)
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
        resultado = { atualizado: achado.nome }
      }
    }
    else return NextResponse.json({ ok: false, error: 'tipo desconhecido' }, { status: 200 })

    // auditoria
    await supabase.from('webhook_logs').insert({ origem: 'agente-acao', evento: p.tipo, status: 'processado', payload: { email, pendencia: p, resultado } }).select('id')
    return NextResponse.json({ ok: true, resultado })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
