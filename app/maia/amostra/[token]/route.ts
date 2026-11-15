// Maia, lançamento (15/11/2026): a PÁGINA DA AMOSTRA, pública pelo link com token (/maia/amostra/<token>).
// Cada visita conta uma abertura (menos robôs de prévia de link e a prévia da equipe, ?previa=1). A primeira abertura põe
// a pessoa na fila do Rick. O conteúdo: lib/maia/lancamento/amostra.ts (htmlAmostra).
import { contatoDoToken } from '@/lib/maia/lancamento/base'
import { htmlAmostra, abriu } from '@/lib/maia/lancamento/amostra'

export const dynamic = 'force-dynamic'

const naoAchei = () => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Amostra da Maia</title><body style="font-family:system-ui;background:#f7f5fc;color:#1b1530;padding:40px 16px;text-align:center"><h1 style="font-size:24px">Não achei essa amostra</h1><p>Confere o link que a Maia te mandou no WhatsApp.</p></body>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const c = await contatoDoToken(String(token || '')).catch(() => null)
  if (!c || !c.amostra?.pecas) return naoAchei()
  const previa = new URL(req.url).searchParams.get('previa') === '1'
  // a página só existe pro público depois de aprovada (a prévia da equipe vê antes)
  if (!previa && !c.amostra?.aprovada_em) return naoAchei()
  if (!previa) await abriu(c, req.headers.get('user-agent') || '').catch(() => null)
  return new Response(await htmlAmostra(c, { previa }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
}
