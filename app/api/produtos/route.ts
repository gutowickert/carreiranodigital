import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Produtos/ofertas da org (genérico). Cada org gerencia os seus.
export async function GET(req: Request) {
  const org = await orgDaRequest(req.headers.get('authorization'))
  const { data } = await sb.from('produtos')
    .select('id, nome, tipo, modalidade, preco_venda, agendavel, descricao, ativo, criado_em')
    .eq('org_id', org).order('criado_em', { ascending: true })
  return NextResponse.json({ ok: true, produtos: data || [] })
}

export async function POST(req: Request) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    const nome = (b.nome || '').toString().trim()
    if (!nome) return NextResponse.json({ ok: false, error: 'informe o nome do produto' }, { status: 200 })
    const campos: any = {
      nome,
      tipo: (b.tipo || '').toString().slice(0, 40) || null,
      modalidade: (b.modalidade || '').toString().slice(0, 40) || null,
      preco_venda: b.preco_venda != null && b.preco_venda !== '' ? Number(b.preco_venda) : null,
      agendavel: !!b.agendavel,
      descricao: (b.descricao || '').toString().slice(0, 2000) || null,
      ativo: b.ativo !== false,
      atualizado_em: new Date().toISOString(),
    }
    if (b.id) {
      await sb.from('produtos').update(campos).eq('org_id', org).eq('id', b.id)
      return NextResponse.json({ ok: true, id: b.id })
    }
    // insert: org_id explícito (service_role não dispara meu_org no trigger)
    const { data, error } = await sb.from('produtos').insert({ ...campos, org_id: org }).select('id').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function DELETE(req: Request) {
  const org = await orgDaRequest(req.headers.get('authorization'))
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })
  // não apaga: desativa (preserva histórico de vendas/turmas)
  await sb.from('produtos').update({ ativo: false, atualizado_em: new Date().toISOString() }).eq('org_id', org).eq('id', id)
  return NextResponse.json({ ok: true })
}
