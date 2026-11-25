import { timingSafeEqual } from 'node:crypto'

// Maia: chama NA HORA um lead do quiz que ainda não foi chamado (24/11). Mesmo envio da chamada automática do quiz
// (lib/maia/vendedora-rotina.ts, modelo maia_diagnostico, 1x por lead, pula RS e quem já escreveu), a qualquer hora.
// Uso da equipe/Claude pra quem fez o quiz antes da chamada automática existir. Chave: Authorization: Bearer <service role da escola>.
export const maxDuration = 60

const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

export async function POST(req: Request) {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!chave || !igual(req.headers.get('authorization') || '', 'Bearer ' + chave)) return Response.json({ erro: 'não autorizado' }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* sem corpo */ }
  const ids: string[] = (Array.isArray(b.leads) ? b.leads : [b.lead]).filter((x: any) => typeof x === 'string' && x.length > 10).slice(0, 20)
  if (!ids.length) return Response.json({ erro: 'falta o id do lead' }, { status: 400 })
  const { chamaQuemNaoChamou } = await import('@/lib/maia/vendedora-rotina')
  const r: any[] = []
  for (const id of ids) r.push({ lead: id, r: await chamaQuemNaoChamou(new Date(), { soLead: id }) })
  return Response.json({ ok: true, r })
}
