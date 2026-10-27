// Recado Encantado: o AGENDADOR DO ORGÂNICO (27/10). Publica no Instagram do Recado o post do calendário que chegou na hora
// (a lógica toda está em lib/recado/organico.ts). Quem chama: o pg_cron do Supabase a cada 15 min (sql/09) e o cron da Vercel às 19h.
//   GET ?chave=RECADO_VIGIA_CHAVE                      -> uma volta de verdade
//   GET ?chave=...&seco=1[&agora=2026-11-03T19:05:00-03:00] -> modo seco: mostra o que publicaria (não grava, não chama o Instagram)
// Protegida igual ao vigia: a chave RECADO_VIGIA_CHAVE ou o cabeçalho do cron da Vercel (CRON_SECRET).
import { NextRequest, NextResponse } from 'next/server'
import { rodaAgendador } from '@/lib/recado/organico'
import { avisaDono } from '@/lib/recado/avisa-dono'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave'), ua = req.headers.get('user-agent') || '', secret = process.env.CRON_SECRET
  if (process.env.RECADO_VIGIA_CHAVE && chave === process.env.RECADO_VIGIA_CHAVE.trim()) return true
  return ua.includes('vercel-cron') || !!(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  const q = req.nextUrl.searchParams, seco = q.get('seco') === '1'
  const agora = seco && q.get('agora') && !isNaN(Date.parse(q.get('agora') as string)) ? Date.parse(q.get('agora') as string) : undefined
  try {
    const r = await rodaAgendador({ seco, agora, avisa: (t, x) => avisaDono(t, x, 'warning') })
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('recado/publicar', e)
    return NextResponse.json({ ok: false, erro: String(e.message || e).slice(0, 200) }, { status: 500 })
  }
}
