import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 30

// Transferências entre contas (movimento NEUTRO no resultado — só ajusta o saldo das contas).
// GET → saldo REAL de cada conta (saldo_inicial + receitas realizadas − custos realizados + entradas − saídas de transferência) + histórico.
// POST → registra uma transferência (origem → destino).

async function saldos(org: string) {
  const { data: contas } = await sb.from('contas_financeiras').select('id, nome, ativo, saldo_inicial').eq('org_id', org).order('nome')
  const map = new Map<string, { id: string; nome: string; ativo: boolean; saldo: number }>()
  for (const c of contas || []) map.set(c.id, { id: c.id, nome: c.nome, ativo: c.ativo, saldo: Number(c.saldo_inicial) || 0 })

  // lançamentos realizados (receita soma, custo subtrai) — paginado
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('lancamentos_empresa').select('conta_id, tipo, valor').eq('org_id', org).eq('status', 'realizado').not('conta_id', 'is', null).range(from, from + 999)
    if (!data?.length) break
    for (const l of data) { const c = map.get(l.conta_id); if (c) c.saldo += (l.tipo === 'receita' ? 1 : -1) * (Number(l.valor) || 0) }
    if (data.length < 1000) break
  }
  // transferências (destino soma, origem subtrai)
  const { data: tr } = await sb.from('transferencias').select('conta_origem_id, conta_destino_id, valor').eq('org_id', org)
  for (const t of tr || []) { const o = map.get(t.conta_origem_id); const d = map.get(t.conta_destino_id); const v = Number(t.valor) || 0; if (o) o.saldo -= v; if (d) d.saldo += v }
  return [...map.values()]
}

export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const contas = await saldos(org)
    const nomeDe = new Map(contas.map(c => [c.id, c.nome]))
    const { data: transf } = await sb.from('transferencias').select('id, conta_origem_id, conta_destino_id, valor, data, observacao, criado_por, criado_em').eq('org_id', org).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(300)
    const hist = (transf || []).map(t => ({
      id: t.id, origem: nomeDe.get(t.conta_origem_id) || '?', destino: nomeDe.get(t.conta_destino_id) || '?',
      valor: Number(t.valor) || 0, data: t.data, observacao: t.observacao || '', por: t.criado_por || '',
    }))
    return NextResponse.json({ ok: true, contas, transferencias: hist })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const origem = b?.origem, destino = b?.destino, valor = Number(b?.valor), data = b?.data
    if (!origem || !destino) return NextResponse.json({ ok: false, error: 'escolha as contas de origem e destino' }, { status: 200 })
    if (origem === destino) return NextResponse.json({ ok: false, error: 'origem e destino não podem ser a mesma conta' }, { status: 200 })
    if (!(valor > 0)) return NextResponse.json({ ok: false, error: 'valor precisa ser maior que zero' }, { status: 200 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return NextResponse.json({ ok: false, error: 'data inválida' }, { status: 200 })
    const { error } = await sb.from('transferencias').insert({
      org_id: org, conta_origem_id: origem, conta_destino_id: destino, valor, data,
      observacao: (b?.observacao || '').toString().slice(0, 300) || null, criado_por: (b?.por || '').toString().slice(0, 80) || null,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
