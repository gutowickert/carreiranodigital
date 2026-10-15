// Oito Posts: o manifesto do "app" da área do cliente. É dinâmico pra o app instalado já abrir na área DAQUELE cliente (com o código).
//   /api/oito/manifest?m=salao&c=CODIGO
// 15/10: o Feed al Día (divino/sabroso/peludo) abre em /oito/feedaldia/<nicho>/ pela Vercel, ou em /<nicho>/ no domínio próprio.
import { oitoConfig as cfg, ehMarca, feedAlDia } from '@/lib/oito/config'

const COR: Record<string, [string, string]> = { salao: ['#2b1420', '#fbf4f2'], prato: ['#1d120c', '#fff7ee'], pata: ['#102a4c', '#f3f7ff'], divino: ['#1c1022', '#fbf6f2'], sabroso: ['#1c1022', '#fbf6f2'], peludo: ['#1c1022', '#fbf6f2'] }

export async function GET(req: Request) {
  const u = new URL(req.url), m = u.searchParams.get('m') || '', c = (u.searchParams.get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  if (!ehMarca(m)) return new Response('marca', { status: 400 })
  const nome = cfg.marcas[m].nome
  // no domínio da marca o app abre no endereço limpo (/conta.html); pela Vercel, no caminho /oito/<marca>/
  const host = req.headers.get('host') || new URL(req.url).hostname || ''
  const es = cfg.marcas[m].idioma === 'es'
  let base: string, icone: string
  if (feedAlDia(m)) {
    const dom = !/vercel\.app$|localhost|127\.0\.0\.1/.test(host)
    base = dom ? `/${cfg.marcas[m].pasta}/` : `/oito/feedaldia/${cfg.marcas[m].pasta}/`
    icone = '/oito/feedaldia/icone.png'
  } else {
    const dom = /nofeed\.com\.br$/.test(host) || /feed(divino|sabroso|peludo)\.com$/.test(host)
    base = dom ? '/' : `/oito/${m}/`
    icone = `/oito/${m}/icone.png`
  }
  return Response.json({
    name: nome, short_name: es ? nome : nome.replace(' no Feed', ''), description: es ? 'Tus posts del mes, listos para publicar.' : 'Seus posts do mês, prontos pra postar.',
    id: `${base}conta`, start_url: `${base}conta.html${c ? '?c=' + c : ''}`, scope: base,
    display: 'standalone', background_color: COR[m][1], theme_color: COR[m][0], lang: es ? 'es' : 'pt-BR',
    icons: [{ src: icone, sizes: '1080x1080', type: 'image/png', purpose: 'any' }, { src: icone, sizes: '1080x1080', type: 'image/png', purpose: 'maskable' }],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } })
}
