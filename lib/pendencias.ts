import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getFluxo, setFluxo, aplicarPatch } from '@/lib/fluxo'

// EXECUTAR UMA PROPOSTA CONFIRMADA — o que acontece depois que a pessoa clica "Confirmar".
//
// ⚠️ MORA AQUI, e não dentro de uma rota, porque são DUAS portas que confirmam proposta: o Agente
// Interno (liberado por lista de e-mails) e a Máquina (liberada por login + papel). A lógica de
// "o que fazer com a proposta" é uma só; o que muda entre as portas é quem pode bater nela.
//
// `quem` é quem confirmou — vai pra auditoria e pra regra criada. Nunca a IA: ela só propôs.

export type Pendencia = { tipo: 'despesas' | 'lead' | 'regra_ia' | 'fluxo'; acao?: string; [k: string]: any }
export type Resultado = { ok: true; resultado: any } | { ok: false; error: string }

const mesRef = (d: string) => (d || '').slice(0, 8) + '01'

export async function executarPendencia(p: Pendencia, quem: string): Promise<Resultado> {
  if (!p?.tipo) return { ok: false, error: 'proposta inválida' }
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
    if (error) return { ok: false, error: error.message }
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
      if (!campos.nome) return { ok: false, error: 'falta o nome do lead' }
      if (!campos.etapa) campos.etapa = 'novo'
      const { data, error } = await supabase.from('leads').insert(campos).select('id').single()
      if (error) return { ok: false, error: error.message }
      resultado = { criado: data.id }
    } else {
      const { data: achado } = await supabase.from('leads').select('id, nome').ilike('nome', `%${p.busca}%`).limit(1).maybeSingle()
      if (!achado) return { ok: false, error: `lead "${p.busca}" não encontrado` }
      const { error } = await supabase.from('leads').update(campos).eq('id', achado.id)
      if (error) return { ok: false, error: error.message }
      resultado = { atualizado: achado.nome }
    }
  }
  else if (p.tipo === 'regra_ia') {
    if (p.acao === 'remover') {
      await supabase.from('webhook_logs').delete().eq('id', p.id).eq('origem', 'ia-regra')
      resultado = { regra_removida: p.id }
    } else {
      if (!p.texto) return { ok: false, error: 'regra vazia' }
      const { data, error } = await supabase.from('webhook_logs').insert({ origem: 'ia-regra', evento: 'ativa', status: 'processado', payload: { texto: p.texto, criado_por: quem } }).select('id').single()
      if (error) return { ok: false, error: error.message }
      resultado = { regra_criada: data.id }
    }
  }
  else if (p.tipo === 'fluxo') {
    const atual = await getFluxo()
    const { fluxo, resumo } = aplicarPatch(atual, p as any)
    await setFluxo(fluxo, quem)
    resultado = { fluxo_atualizado: resumo }
  }
  else return { ok: false, error: 'tipo desconhecido' }

  // auditoria: quem confirmou, o quê, e o que aconteceu
  await supabase.from('webhook_logs').insert({ origem: 'agente-acao', evento: p.tipo, status: 'processado', payload: { email: quem, pendencia: p, resultado } }).select('id')
  return { ok: true, resultado }
}
