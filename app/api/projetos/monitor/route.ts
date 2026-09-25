import { NextResponse } from 'next/server'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { montarMonitor, LIMITES } from '@/lib/monitor-entregas'

export const maxDuration = 120

// O MONITOR DAS ENTREGAS: todos os clientes em entrega com cor, alertas, recomendação,
// próximo encontro, quem contatar hoje e os encontros da semana. Lê do banco (o sync
// diário) mais o estado da conta ao vivo. Interno: Guto e Mateus decidem em grupo aqui.
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const dias = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('dias')) || LIMITES.janelaDias))
    return NextResponse.json(await montarMonitor(org, dias))
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
