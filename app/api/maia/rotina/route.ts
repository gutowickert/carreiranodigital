// Maia: a rotina de hora em hora (03/11): retomadas, resumo de segunda (vai pra equipe) e números da Meta.
// Chamada pelo cron (user-agent vercel-cron ou CRON_SECRET) ou pelo painel (rodar_rotina).
import { roda } from '@/lib/maia/rotina'

export const maxDuration = 300

export async function GET(req: Request) {
  const cron = /vercel-cron/i.test(req.headers.get('user-agent') || '')
  const segredo = process.env.CRON_SECRET && req.headers.get('authorization') === 'Bearer ' + process.env.CRON_SECRET
  if (!cron && !segredo) return Response.json({ erro: 'não autorizado' }, { status: 401 })
  return Response.json(await roda())
}
