import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { transcreverLigacao } from '@/lib/transcrever-ligacao'

export const maxDuration = 60

// Check diário: garante que TODA ligação gravada fique transcrita (rede de segurança do webhook).
// Alimenta copiloto/fila/simulação/relatórios. Roda em produção (onde API4COM_TOKEN + DEEPGRAM existem).
export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const permitido = ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`)
  if (!permitido) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

  const { data: ligs } = await sb.from('ligacoes').select('id, metadata')
    .not('gravacao_url', 'is', null).gt('duracao', 10)
    .order('criado_em', { ascending: false }).limit(300)
  const pend = (ligs || []).filter((l: any) => !(l.metadata && l.metadata.transcricao))
  let ok = 0
  for (const l of pend.slice(0, 6)) { const t = await transcreverLigacao(l.id); if (t) ok++ }
  return NextResponse.json({ ok: true, transcritos: ok, restam: Math.max(0, pend.length - ok) })
}
