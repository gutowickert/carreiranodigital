// Proxy público de imagem pras páginas da análise: GET ?u=<url>
// Só aceita imagens dos CDNs do Instagram/Facebook (*.cdninstagram.com, *.fbcdn.net) e do Google (*.googleusercontent.com).
// Qualquer outro host → 400. Limite 5 MB. Guarda em cache por 1 dia.
import { hostDeImagemPermitido } from '@/lib/diagnostico/proxy'

export const maxDuration = 20
export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const falha = (msg: string, status = 400) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

export async function GET(req: Request) {
  const bruto = new URL(req.url).searchParams.get('u') || ''
  let atual: URL
  try { atual = new URL(bruto) } catch { return falha('endereço inválido') }
  if (!hostDeImagemPermitido(atual)) return falha('host não permitido')

  try {
    const sinal = AbortSignal.timeout(15_000)
    let r: Response | null = null
    // segue até 3 redirecionamentos, conferindo o host em cada um
    for (let i = 0; i < 4; i++) {
      r = await fetch(atual, { redirect: 'manual', signal: sinal, cache: 'no-store', headers: { 'user-agent': UA, accept: 'image/*' } })
      const destino = r.headers.get('location')
      if (r.status >= 300 && r.status < 400 && destino) {
        atual = new URL(destino, atual)
        if (!hostDeImagemPermitido(atual)) return falha('redirecionou pra host não permitido')
        r = null
        continue
      }
      break
    }
    if (!r) return falha('redirecionamentos demais', 502)
    if (!r.ok) return falha(`origem respondeu ${r.status}`, r.status === 404 || r.status === 403 ? 404 : 502)
    const tipo = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!tipo.startsWith('image/') || tipo.includes('svg')) return falha('a origem não devolveu uma imagem', 502)
    const tamanho = Number(r.headers.get('content-length') || 0)
    if (tamanho > MAX_BYTES) return falha('imagem grande demais', 413)

    const partes: Uint8Array[] = []
    let total = 0
    if (r.body) {
      const leitor = r.body.getReader()
      while (true) {
        const { done, value } = await leitor.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_BYTES) { try { await leitor.cancel() } catch {} ; return falha('imagem grande demais', 413) }
        partes.push(value)
      }
    }
    const corpo = new Uint8Array(total)
    let pos = 0
    for (const p of partes) { corpo.set(p, pos); pos += p.byteLength }
    return new Response(corpo, {
      status: 200,
      headers: {
        'content-type': tipo,
        'content-length': String(total),
        'cache-control': 'public, max-age=86400, s-maxage=86400',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (e: unknown) {
    const nome = (e as { name?: string })?.name
    return falha(nome === 'TimeoutError' || nome === 'AbortError' ? 'a origem demorou demais' : 'falha ao baixar a imagem', 502)
  }
}
