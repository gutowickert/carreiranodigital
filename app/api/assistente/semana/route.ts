import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { temSessao } from '@/lib/quem-eu-vejo'
import { resumoDaSemana, emailsDoResumo, MODELO_RESUMO_META, TEMPLATE_RESUMO, type Usuario } from '@/lib/assistente'

export const maxDuration = 120

// A SEMANA DE DOMINGO: domingo 20h (pg_cron, 23h UTC), a semana que vem dia por dia, pra quem está
// em configuracoes assistente.resumo_845 (lib/assistente.ts, resumoDaSemana).
//   GET  → pg_cron (?chave=...), Vercel (vercel-cron) ou CRON_SECRET
//   POST → com login: { email } manda agora (teste)
//   ?modelo=ver | ?modelo=criar (com a chave) → consulta ou pede à Meta o modelo de reserva cnd_resumo_agenda

const GRAPH = 'https://graph.facebook.com/v25.0'
async function waba() {
  if (process.env.WA_OFICIAL_WABA_ID) return process.env.WA_OFICIAL_WABA_ID
  const T = process.env.WA_OFICIAL_TOKEN, P = process.env.WA_OFICIAL_PHONE_ID
  const r: any = await fetch(`${GRAPH}/${P}?fields=whatsapp_business_account&access_token=${T}`).then(r => r.json())
  return r?.whatsapp_business_account?.id as string | undefined
}

async function chaveOk(chave: string | null) {
  if (!chave || chave.length < 16) return false
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'assistente.cron_chave').eq('valor', chave).limit(1)
  return !!data?.length
}

async function usuarios(email?: string) {
  let q = sb.from('usuarios_perfil').select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia').eq('ativo', true).not('whatsapp', 'is', null)
  if (email) q = q.ilike('email', email)
  const { data } = await q
  return (data || []) as Usuario[]
}

async function mandar(us: Usuario[]) {
  const out: any[] = []
  for (const u of us) {
    try { out.push({ nome: u.nome, ...(await resumoDaSemana(u)) }) } catch (e: any) { out.push({ nome: u.nome, ok: false, error: e?.message || 'falhou' }) }
  }
  return out
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const chave = req.nextUrl.searchParams.get('chave')
  if (!(ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`) || await chaveOk(chave))) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

  const modelo = req.nextUrl.searchParams.get('modelo')
  if (modelo) {
    const W = await waba(), T = process.env.WA_OFICIAL_TOKEN
    if (!W || !T) return NextResponse.json({ ok: false, error: 'sem a conta do WhatsApp oficial' })
    if (modelo === 'criar') return NextResponse.json(await fetch(`${GRAPH}/${W}/message_templates?access_token=${T}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(MODELO_RESUMO_META) }).then(r => r.json()))
    return NextResponse.json(await fetch(`${GRAPH}/${W}/message_templates?name=${TEMPLATE_RESUMO}&fields=name,status,category,rejected_reason&access_token=${T}`).then(r => r.json()))
  }

  const resumo = await emailsDoResumo()
  const r = await mandar((await usuarios()).filter(u => resumo.includes(u.email.toLowerCase())))
  return NextResponse.json({ ok: true, enviados: r.filter(x => x.ok).length, resultados: r })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const us = await usuarios(String(b.email || ''))
  if (!b.email || !us.length) return NextResponse.json({ ok: false, error: 'ninguém com esse e-mail e WhatsApp cadastrado' })
  const r = await mandar(us)
  return NextResponse.json({ ok: r.every(x => x.ok), resultados: r })
}
