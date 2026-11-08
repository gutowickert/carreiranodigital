// Escola: quem pode chamar as rotas de cron (07/11, segurança).
// Antes, o user-agent "vercel-cron" valia como senha: qualquer um escreve esse user-agent e disparava WhatsApp, IA e relatórios.
// Agora só vale o Authorization: Bearer CRON_SECRET, que a própria Vercel manda nos crons do vercel.json quando a variável
// CRON_SECRET existe no projeto. Sem CRON_SECRET na Vercel, a rota fica fechada (nunca aberta). Comparação em tempo constante.
import { timingSafeEqual } from 'node:crypto'

export function cronOk(req: Request) {
  const segredo = process.env.CRON_SECRET || ''
  if (!segredo) return false
  const a = Buffer.from(req.headers.get('authorization') || ''), b = Buffer.from('Bearer ' + segredo)
  return a.length === b.length && timingSafeEqual(a, b)
}
