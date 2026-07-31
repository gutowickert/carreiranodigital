import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 60

// Tela de FECHAMENTO de turma: dado uma turma em vendas, lista TODAS as oportunidades no funil (dela + das turmas
// IRMÃS do mesmo produto+cidade — leads presos em turma antiga que deviam migrar), com posição, tempo parado,
// tarefa e a leitura da IA, pro time bater na reta final antes da turma começar.
const ATIV = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa', 'agendado', 'aguardando_pagamento', 'proxima_turma', 'ligacao_boa']

// preço/bolsa fixos por produto (mesma tabela travada do motor)
function precosDe(codigo: string) {
  const c = (codigo || '').toLowerCase()
  if (c.startsWith('anl')) return { preco: 'R$797 no Pix · R$997 em 10x', bolsa: 'R$697 no Pix · R$897 em 10x' }
  if (c.startsWith('fc')) return { preco: 'R$2.397 no Pix · R$2.697 em 10x', bolsa: 'R$2.097 no Pix · R$2.497 em 10x' }
  return { preco: '', bolsa: '' }
}

export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const turmaId = new URL(req.url).searchParams.get('turmaId') || ''

    // turmas EM VENDAS pro seletor
    const { data: turmas } = await sb.from('turmas')
      .select('id, codigo, data_inicio, produto_id, cidade_id, produtos(nome), cidades(nome)')
      .eq('org_id', org).eq('status', 'em_vendas').order('data_inicio')
    const lista = (turmas || []).map((t: any) => ({ id: t.id, codigo: t.codigo, inicio: t.data_inicio, nome: `${t.produtos?.nome || t.codigo} — ${t.cidades?.nome || ''}` }))

    if (!turmaId) return NextResponse.json({ ok: true, turmas: lista })

    // turma selecionada (produto+cidade pra achar as irmãs)
    const { data: sel } = await sb.from('turmas').select('id, codigo, data_inicio, produto_id, cidade_id, produtos(nome), cidades(nome)').eq('id', turmaId).maybeSingle()
    if (!sel) return NextResponse.json({ ok: false, error: 'turma não encontrada' }, { status: 200 })

    // turmas IRMÃS = mesmo produto + cidade (inclui as antigas → carry-over)
    const { data: irmas } = await sb.from('turmas').select('id, codigo').eq('org_id', org).eq('produto_id', (sel as any).produto_id).eq('cidade_id', (sel as any).cidade_id)
    const idsIrmas = (irmas || []).map((t: any) => t.id)
    const codsIrmas = (irmas || []).map((t: any) => (t.codigo || '').toLowerCase()).filter(Boolean)

    // leads ativos dessas turmas — por turma_id E por codigo_turma (histórico sem turma_id)
    const byId: any[] = []
    for (let i = 0; i < idsIrmas.length; i += 50) { const { data } = await sb.from('leads').select('id, nome, whatsapp, etapa, atendido_por, atualizado_em, turma_id, resumo_ia').eq('org_id', org).in('turma_id', idsIrmas.slice(i, i + 50)).in('etapa', ATIV).limit(2000); byId.push(...(data || [])) }
    const seen = new Set(byId.map(l => l.id))
    for (const cod of codsIrmas) { const { data } = await sb.from('leads').select('id, nome, whatsapp, etapa, atendido_por, atualizado_em, turma_id, resumo_ia').eq('org_id', org).ilike('codigo_turma', cod).in('etapa', ATIV).limit(2000); for (const l of data || []) if (!seen.has(l.id)) { seen.add(l.id); byId.push(l) } }
    const leads = byId

    // tarefa pendente mais próxima por lead
    const ids = leads.map(l => l.id)
    const tk = new Map<string, any>()
    for (let i = 0; i < ids.length; i += 150) { const { data } = await sb.from('tarefas_lead').select('lead_id, tipo, data_vencimento').in('lead_id', ids.slice(i, i + 150)).eq('concluida', false).eq('cancelada', false).order('data_vencimento'); for (const t of data || []) if (!tk.has(t.lead_id)) tk.set(t.lead_id, t) }

    const nowBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const h0 = new Date(nowBR.getFullYear(), nowBR.getMonth(), nowBR.getDate())
    const rows = leads.map(l => {
      const r = l.resumo_ia || {}
      const t = tk.get(l.id)
      return {
        nome: l.nome || '(sem nome)', fone: (l.whatsapp || '').replace(/\D/g, ''), etapa: l.etapa, dono: l.atendido_por,
        carry: l.turma_id !== (sel as any).id, parado: Math.max(0, Math.floor((+h0 - +new Date(l.atualizado_em || 0)) / 864e5)),
        temp: r.temperatura || '-', ondeParou: r.ondeParou || '', passo: r.proximoPasso || '', objec: r.objecoes || '',
        tipoTarefa: t?.tipo || null, vence: t?.data_vencimento ? t.data_vencimento.slice(0, 10) : null,
      }
    })

    const pr = precosDe((sel as any).codigo)
    return NextResponse.json({
      ok: true,
      turma: { nome: `${(sel as any).produtos?.nome || ''} — ${(sel as any).cidades?.nome || ''}`.trim(), codigo: (sel as any).codigo, inicio: (sel as any).data_inicio, ...pr },
      leads: rows,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
