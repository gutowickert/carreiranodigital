import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { temSessao } from '@/lib/quem-eu-vejo'
import { rodarAlertas } from '@/lib/assistente-alertas'
import type { Usuario } from '@/lib/assistente'

export const maxDuration = 120

// OS AVISOS POR EVENTO, de hora em hora (cron da Vercel, 11h a 22h UTC = 8h a 19h em Brasília).
// Venda fechada, campanha de cliente parada ou sem saldo, lead esperando resposta há 2h.
//   GET  → cron (user-agent vercel-cron ou CRON_SECRET), pra quem tem assistente_bom_dia
//   POST → com login: { email } roda agora pra uma pessoa (teste)

async function usuarios(email?: string) {
  let q = sb.from('usuarios_perfil').select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia').eq('ativo', true).not('whatsapp', 'is', null)
  q = email ? q.ilike('email', email) : q.eq('assistente_bom_dia', true)
  const { data } = await q
  return (data || []) as Usuario[]
}

async function rodar(us: Usuario[]) {
  const out: any[] = []
  for (const u of us) { try { out.push(await rodarAlertas(u)) } catch (e: any) { out.push({ ok: false, usuario: u.nome, error: e?.message || 'falhou' }) } }
  return out
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!(ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`))) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })
  return NextResponse.json({ ok: true, resultados: await rodar(await usuarios()) })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const us = await usuarios(String(b.email || ''))
  if (!us.length) return NextResponse.json({ ok: false, error: 'ninguém com esse e-mail e WhatsApp cadastrado' })
  return NextResponse.json({ ok: true, resultados: await rodar(us) })
}
