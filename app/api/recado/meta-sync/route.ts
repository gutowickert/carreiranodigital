// Recado Encantado: puxa o gasto da Meta (por conjunto e por dia) pros lançamentos do painel.
//   GET  → cron da Vercel, todo dia de manhã: os últimos 3 dias (a Meta ainda ajusta o gasto de ontem).
//   POST → botão "Puxar da Meta" no painel (senha do painel), { dias } até 90.
// A leitura em si fica em lib/recado/meta-gasto.ts (a aba Campanhas usa a mesma, em tempo real).
// Conta em RECADO_META_CONTA; a chave é a da escola (FB_ADS_TOKEN), com a conta do Recado atribuída ao usuário do sistema.
import { NextRequest, NextResponse } from 'next/server'
import { sincronizaGastos } from '@/lib/recado/meta-gasto'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '', secret = process.env.CRON_SECRET
  // 25/10: o pg_cron do Supabase (sql/08) também chama, a cada 2 h durante o dia, com a chave do vigia
  const chave = req.nextUrl.searchParams.get('chave'), vigia = !!process.env.RECADO_VIGIA_CHAVE && chave === process.env.RECADO_VIGIA_CHAVE.trim()
  if (!vigia && !ua.includes('vercel-cron') && !(secret && req.headers.get('authorization') === `Bearer ${secret}`)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  return NextResponse.json(await sincronizaGastos(3))
}

export async function POST(req: NextRequest) {
  if (!process.env.RECADO_PAINEL_SENHA || req.headers.get('x-senha') !== process.env.RECADO_PAINEL_SENHA) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const b: any = await req.json().catch(() => ({}))
  return NextResponse.json(await sincronizaGastos(Math.max(1, Math.min(90, +b.dias || 7))))
}
