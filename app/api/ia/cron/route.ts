import { NextRequest, NextResponse } from 'next/server'
import { POST as reconciliar } from '../reconciliar/route'
import { POST as followup } from '../followup-auto/route'
import { POST as atender } from '../atender/route'

export const maxDuration = 300

// CRON diário da automação: primeiro RECONCILIA a posse (quem esfriou volta pra IA, quem está quente volta pro time),
// depois roda o MOTOR da Esteira IA (dispara os toques do fluxo nos frios). Ordem importa (reconcilia → dispara).
// Protegido: só o cron da Vercel ou o CRON_SECRET. Respeita o kill switch (ia-automacao {ligado:false}) dentro de cada um.
function reqInterno(body: any) {
  return new NextRequest('https://cron.interno/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const permitido = ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`)
  if (!permitido) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

  let reconc: any = null, motor: any = null, resp: any = null
  try { reconc = await (await reconciliar(reqInterno({ dryRun: false, confirm: true }))).json() } catch (e: any) { reconc = { ok: false, error: e?.message } }
  try { motor = await (await followup(reqInterno({ dryRun: false, confirm: true, limit: 60 }))).json() } catch (e: any) { motor = { ok: false, error: e?.message } }
  // rede de segurança: responde quem escreveu e o webhook não pegou (deploy/queda)
  try { resp = await (await atender(reqInterno({ dryRun: false, confirm: true, limit: 30 }))).json() } catch (e: any) { resp = { ok: false, error: e?.message } }

  return NextResponse.json({ ok: true, reconciliar: reconc, motor, respondedor: resp })
}
