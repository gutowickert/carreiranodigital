// Matt: aviso de venda nova no WhatsApp do Guto (26/11). Chamado pelo pg_cron do Supabase a cada 10 min (job 'matt-vigia').
// GET ?chave=<matt:chave_cron em recado_suporte_estado>. A lógica fica em lib/matt/vigia.ts.
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { vigiaMatt } from '@/lib/matt/vigia'

export const maxDuration = 60
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string

async function chaveCerta(): Promise<string> {
  const r = await fetch(`${U()}/rest/v1/recado_suporte_estado?chave=eq.matt:chave_cron&select=valor`, { headers: { apikey: K(), Authorization: 'Bearer ' + K() } }).catch(() => null)
  const j: any = await r?.json().catch(() => null)
  const v = j?.[0]?.valor
  try { return String(typeof v === 'string' ? JSON.parse(v) : v || '') } catch { return String(v || '') }
}

export async function GET(req: NextRequest) {
  const veio = req.nextUrl.searchParams.get('chave') || ''
  const certa = process.env.MATT_VIGIA_CHAVE || await chaveCerta()
  const a = Buffer.from(veio), b = Buffer.from(certa)
  if (!certa || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  const r = await vigiaMatt().catch((e: any) => ({ ok: false, erro: String(e?.message || e) }))
  return NextResponse.json(r)
}
