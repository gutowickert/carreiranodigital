import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { temSessao } from '@/lib/quem-eu-vejo'
import { bomDia, resumoDoDia, emailsDoResumo, type Usuario } from '@/lib/assistente'

export const maxDuration = 120

// O BOM DIA DO ASSISTENTE: agenda do dia, pendências com clientes, pelo WhatsApp de quem
// pediu (usuarios_perfil.assistente_bom_dia). Cron da Vercel às 10h UTC = 7h em Brasília.
//   GET  → cron (user-agent vercel-cron ou CRON_SECRET)
//   POST → com login: manda agora pra quem chamou ({ email }) ou pra todos ({ todos: true }). Pra testar.
// Quem está em configuracoes assistente.resumo_845 (o Nando, 23/10/2026) NÃO recebe este: recebe o
// resumo de seg a sex 8:45, que o pg_cron chama com ?turno=resumo&chave=... (lib/assistente.ts).

async function destinatarios(filtro?: { email?: string }) {
  let q = sb.from('usuarios_perfil').select('id, org_id, nome, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia').eq('ativo', true).not('whatsapp', 'is', null)
  q = filtro?.email ? q.ilike('email', filtro.email) : q.eq('assistente_bom_dia', true)
  const { data } = await q
  return (data || []) as Usuario[]
}

async function chaveOk(chave: string | null) {
  if (!chave || chave.length < 16) return false
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'assistente.cron_chave').eq('valor', chave).limit(1)
  return !!data?.length
}

async function rodar(us: Usuario[], resumo: string[]) {
  const out: any[] = []
  for (const u of us) {
    try { out.push({ nome: u.nome, ...(await (resumo.includes(u.email.toLowerCase()) ? resumoDoDia(u) : bomDia(u))) }) } catch (e: any) { out.push({ nome: u.nome, ok: false, error: e?.message || 'falhou' }) }
  }
  return out
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const chave = req.nextUrl.searchParams.get('chave')
  if (!(ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`) || await chaveOk(chave))) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })
  // ?turno=resumo (8:45, seg a sex) → só a lista do resumo; o das 7h → todo mundo menos ela
  const resumo = await emailsDoResumo()
  const doResumo = req.nextUrl.searchParams.get('turno') === 'resumo'
  const r = await rodar((await destinatarios()).filter(u => resumo.includes(u.email.toLowerCase()) === doResumo), resumo)
  return NextResponse.json({ ok: true, enviados: r.filter(x => x.ok).length, resultados: r })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const us = await destinatarios(b.todos ? undefined : { email: String(b.email || '') })
  if (!us.length) return NextResponse.json({ ok: false, error: 'ninguém com WhatsApp cadastrado pra esse filtro' })
  const r = await rodar(us, await emailsDoResumo())
  return NextResponse.json({ ok: r.every(x => x.ok), resultados: r })
}
