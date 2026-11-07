// Maia: a rotina de hora em hora (03/11): retomadas, resumo de segunda (vai pra equipe) e números da Meta.
// Chamada pelo agendador do banco (pg_cron, cabeçalho x-chave = MAIA_ROTINA_CHAVE), pelo cron da Vercel (Authorization: Bearer CRON_SECRET)
// ou pelo painel (rodar_rotina).
// 07/11 (segurança): o user-agent "vercel-cron" NÃO vale mais como senha (qualquer um escreve esse user-agent e disparava
// as retomadas pros clientes, os relatórios e o gasto de IA). Comparação em tempo constante. Sem nenhuma chave na Vercel, fica fechada.
import { timingSafeEqual } from 'node:crypto'
import { roda } from '@/lib/maia/rotina'

export const maxDuration = 300

const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

export async function GET(req: Request) {
  const cron = process.env.CRON_SECRET || '', rotina = process.env.MAIA_ROTINA_CHAVE || ''
  const segredo = !!cron && igual(req.headers.get('authorization') || '', 'Bearer ' + cron)
  const chave = !!rotina && igual(req.headers.get('x-chave') || '', rotina)
  if (!segredo && !chave) return Response.json({ erro: 'não autorizado' }, { status: 401 })
  return Response.json(await roda())
}
