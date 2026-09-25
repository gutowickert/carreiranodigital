import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { temSessao } from '@/lib/quem-eu-vejo'
import { relatorioTrafego, type Usuario } from '@/lib/assistente'

export const maxDuration = 120

// O RELATÓRIO DE TRÁFEGO DOS CLIENTES pelo WhatsApp do time: o monitor como card de imagem
// e o texto embaixo.
//   GET  → cron da Vercel, segunda 10h05 UTC (7h05), pra quem tem assistente_bom_dia
//   POST → com login: { email } manda agora (teste)
// Vai como imagem se a janela de 24h estiver aberta; fora dela fica pro próximo bom dia,
// porque o template do bom dia é o único aprovado e ele reabre a janela.

async function usuarios(email?: string) {
  let q = sb.from('usuarios_perfil').select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia').eq('ativo', true).not('whatsapp', 'is', null)
  q = email ? q.ilike('email', email) : q.eq('assistente_bom_dia', true)
  const { data } = await q
  return (data || []) as Usuario[]
}

async function mandar(us: Usuario[]) {
  const out: any[] = []
  for (const u of us) {
    try { out.push({ nome: u.nome, ...(await relatorioTrafego(u)) }) } catch (e: any) { out.push({ nome: u.nome, ok: false, error: e?.message || 'falhou' }) }
  }
  return out
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!(ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`))) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })
  return NextResponse.json({ ok: true, resultados: await mandar(await usuarios()) })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const us = await usuarios(String(b.email || ''))
  if (!us.length) return NextResponse.json({ ok: false, error: 'ninguém com esse e-mail e WhatsApp cadastrado' })
  const r = await mandar(us)
  return NextResponse.json({ ok: r.every(x => x.ok), resultados: r })
}
