import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { temSessao } from '@/lib/quem-eu-vejo'
import { rodarAlertas } from '@/lib/assistente-alertas'
import { emailsDoResumo, type Usuario } from '@/lib/assistente'
import { rodarFunilMotor } from '@/lib/funil-motor'
import { cutucarPlantao, resumoDoPlantao } from '@/lib/ia-plantao'
import { ORG_CND } from '@/lib/org'

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

// A Vercel só aceita cron diário no plano da conta (o "de hora em hora" derrubou o deploy).
// O de hora em hora vem do pg_cron do Supabase, que chama esta rota com ?chave=..., e a chave
// fica em configuracoes (assistente.cron_chave). O cron diário da Vercel continua valendo.
async function chaveOk(chave: string | null) {
  if (!chave || chave.length < 16) return false
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'assistente.cron_chave').eq('valor', chave).limit(1)
  return !!data?.length
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const chave = req.nextUrl.searchParams.get('chave')
  if (!(ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`) || await chaveOk(chave))) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })
  // quem recebe o resumo das 8:45 não recebe aviso solto: o que importa vai no resumo
  const resumo = await emailsDoResumo()
  const resultados = await rodar((await usuarios()).filter(u => !resumo.includes(u.email.toLowerCase())))
  // de carona na rodada de hora em hora: o motor do funil novo (lib/funil-motor.ts; desligado por padrão)
  let funil: any = null
  try { funil = await rodarFunilMotor() } catch (e: any) { funil = { ok: false, error: e?.message || 'falhou' } }
  // e o plantão da IA (lib/ia-plantao.ts; desligado por padrão): a retomada de quem parou de responder e
  // o resumo das 8h e das 19h pro time
  let plantao: any = null
  try { plantao = { cutucada: await cutucarPlantao(ORG_CND), resumo: await resumoDoPlantao(ORG_CND) } } catch (e: any) { plantao = { ok: false, error: e?.message || 'falhou' } }
  return NextResponse.json({ ok: true, resultados, funil, plantao })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const us = await usuarios(String(b.email || ''))
  if (!us.length) return NextResponse.json({ ok: false, error: 'ninguém com esse e-mail e WhatsApp cadastrado' })
  return NextResponse.json({ ok: true, resultados: await rodar(us) })
}
