// Oito Posts: o manifesto do "app" da área do cliente. É dinâmico pra o app instalado já abrir na área DAQUELE cliente (com o código).
//   /api/oito/manifest?m=salao&c=CODIGO
import { oitoConfig as cfg, ehMarca } from '@/lib/oito/config'

const COR: Record<string, [string, string]> = { salao: ['#2b1420', '#fbf4f2'], prato: ['#1d120c', '#fff7ee'], pata: ['#102a4c', '#f3f7ff'] }

export async function GET(req: Request) {
  const u = new URL(req.url), m = u.searchParams.get('m') || '', c = (u.searchParams.get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  if (!ehMarca(m)) return new Response('marca', { status: 400 })
  const nome = cfg.marcas[m].nome
  // no domínio da marca o app abre no endereço limpo (/conta.html); pela Vercel, no caminho /oito/<marca>/
  const dom = /(^|.)(salao|prato|pata)nofeed.com.br$/.test(new URL(req.url).hostname || '') || /nofeed.com.br/.test(req.headers.get('host') || '')
  const base = dom ? '/' : `/oito/${m}/`
  return Response.json({
    name: nome, short_name: nome.replace(' no Feed', ''), description: 'Seus posts do mês, prontos pra postar.',
    id: `${base}conta`, start_url: `${base}conta.html${c ? '?c=' + c : ''}`, scope: base,
    display: 'standalone', background_color: COR[m][1], theme_color: COR[m][0], lang: 'pt-BR',
    icons: [{ src: `/oito/${m}/icone.png`, sizes: '1080x1080', type: 'image/png', purpose: 'any' }, { src: `/oito/${m}/icone.png`, sizes: '1080x1080', type: 'image/png', purpose: 'maskable' }],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } })
}
