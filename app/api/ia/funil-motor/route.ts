import { NextRequest, NextResponse } from 'next/server'
import { chamadaPermitida } from '@/lib/exigir-login'
import { rodarFunilMotor } from '@/lib/funil-motor'

export const maxDuration = 60

// ⚙️ Motor do funil novo, SÓ SIMULAÇÃO por aqui (nada é enviado nem movido): mostra o que ele faria agora.
// { desde?: '2026-10-20', ignorarHorario?: true } — `desde` troca a data de início só nesta simulação.
// O de verdade roda de hora em hora pela rota dos alertas, conforme o interruptor (webhook_logs 'funil-motor').
export async function POST(req: NextRequest) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  try {
    return NextResponse.json(await rodarFunilMotor({ simular: true, desde: b?.desde, ignorarHorario: b?.ignorarHorario === true }))
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
