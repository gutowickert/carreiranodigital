import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { sincronizarProjeto } from '@/lib/trafego-cliente'

export const maxDuration = 300

// SINCRONIZA O TRÁFEGO DOS CLIENTES: lê a Meta por anúncio e por dia e grava em
// trafego_anuncios_dia, pra área do cliente ler do banco (rápida, sem limite de API).
//
//   GET  → o cron da Vercel, todo dia de manhã, TODOS os projetos ativos com conta ligada,
//          de todas as empresas. Protegido pelo user-agent do cron ou pelo CRON_SECRET.
//   POST → com login: { id } sincroniza um projeto (botão na ficha); { completo: true }
//          refaz desde o início do contrato. Sem id, todos os da empresa.

const SELECT = 'id, org_id, cliente, produto, ad_account_id, data_inicio, valor_cliente, alvo_custo_resultado'

async function rodar(projetos: any[], completo = false) {
  const out: any[] = []
  for (const p of projetos) {
    try {
      const r = await sincronizarProjeto(p, { completo })
      out.push({ id: p.id, cliente: p.cliente, ...r })
    } catch (e: any) {
      out.push({ id: p.id, cliente: p.cliente, ok: false, error: e?.message || 'falhou' })
    }
  }
  return out
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const permitido = ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`)
  if (!permitido) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

  const { data: projetos } = await sb.from('projetos').select(SELECT)
    .in('status', ['ativo', 'manutencao']).not('ad_account_id', 'is', null)
  const resultados = await rodar(projetos || [])
  return NextResponse.json({ ok: true, projetos: resultados.length, falhas: resultados.filter(r => !r.ok).length, resultados })
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const b = await req.json().catch(() => ({} as any))

    let q = sb.from('projetos').select(SELECT).eq('org_id', org).not('ad_account_id', 'is', null)
    q = b.id ? q.eq('id', String(b.id)) : q.in('status', ['ativo', 'manutencao'])
    const { data: projetos } = await q
    if (!projetos?.length) return NextResponse.json({ ok: false, error: b.id ? 'projeto sem conta de anúncio' : 'nenhum projeto com conta de anúncio' })

    const resultados = await rodar(projetos, !!b.completo)
    const um = b.id ? resultados[0] : null
    return NextResponse.json({ ok: um ? !!um.ok : true, error: um?.error, resultados })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 500 })
  }
}
