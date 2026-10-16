import type { NextConfig } from "next";

// 15/10: o Feed al Día (espanhol, os 3 nichos num site só; primeiro se chamou No Feed). As chaves internas antigas viram as pastas novas.
// O domínio: feedaldia.com (o mesmo DOMINIO_FEEDALDIA de lib/oito/config.ts), ou OITO_DOMINIO_FEEDALDIA / OITO_DOMINIO_NOFEED na Vercel (sem www).
const ES_PASTAS: [string, string][] = [['divino', 'salon'], ['sabroso', 'restaurante'], ['peludo', 'mascotas']]
const ES_DOMINIOS = [...new Set([process.env.OITO_DOMINIO_FEEDALDIA, process.env.OITO_DOMINIO_NOFEED, 'feedaldia.com'].filter(Boolean).map(d => String(d).replace(/^www\./, '')))]

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  // Recado aberto pelo endereço da Vercel (ex.: painel em carreiranodigital.vercel.app) vai pro domínio do Recado,
  // pra família nunca ver o endereço da Vercel (Guto 10/10). Só páginas: a API fica onde está (webhook do Asaas).
  async redirects() {
    // 15/10: as páginas antigas do espanhol (Feed Divino, Sabroso, Peludo) levam pras do Feed al Día, com o ?c= do cliente junto.
    // Só as páginas: as imagens de exemplo continuam em /oito/<chave>/exemplos/ (as páginas novas usam de lá).
    // E tudo do /oito/nofeed (o primeiro nome, que ficou no ar umas horas) vai pro /oito/feedaldia, no mesmo caminho.
    const espanholAntigo = [
      ...ES_PASTAS.flatMap(([m, pasta]) => [
        { source: `/oito/${m}`, destination: `/oito/feedaldia/${pasta}/`, permanent: false },
        { source: `/oito/${m}/`, destination: `/oito/feedaldia/${pasta}/`, permanent: false },
        { source: `/oito/${m}/index.html`, destination: `/oito/feedaldia/${pasta}/`, permanent: false },
        { source: `/oito/${m}/:p(comecar|teste|conta|termos|guia).html`, destination: `/oito/feedaldia/${pasta}/:p.html`, permanent: false },
      ]),
      { source: '/oito/nofeed', destination: '/oito/feedaldia/', permanent: false },
      { source: '/oito/nofeed/:path*', destination: '/oito/feedaldia/:path*', permanent: false },
    ]
    return [{ source: '/recado/:path*', has: [{ type: 'host' as const, value: '.*\\.vercel\\.app' }], destination: 'https://recadoencantando.com.br/recado/:path*', permanent: false }, ...espanholAntigo]
  },
  // o link que o cliente recebe e /conversa/<codigo> (mais claro que /call); a pagina e a mesma
  async rewrites() {
    // Recado Encantado (frente da escola): quem entra por recadoencantado.com.br vê as páginas de public/recado; a API fica em /api/recado
    // os dois nomes: recadoencantado (o da marca) e recadoencantando (o que foi registrado em 09/10)
    const recado = [{ type: 'host' as const, value: '(www\\.)?recadoencant(ado|ando)\\.com\\.br' }]
    // Oito Posts (12/10): três marcas, cada uma no seu domínio, todas servidas de public/oito/<marca>; a API fica em /api/oito
    // 15/10: os domínios das três em espanhol (feeddivino/feedsabroso/feedpeludo) saíram: o espanhol agora é o Feed al Día (logo abaixo)
    const oito = [['salao', 'salaonofeed.com.br'], ['prato', 'pratonofeed.com.br'], ['pata', 'patanofeed.com.br']].flatMap(([m, d]) => {
      const h = [{ type: 'host' as const, value: `(www\\.)?${d.replace(/\./g, '\\.')}` }]
      return [
        { source: '/', has: h, destination: `/oito/${m}/index.html` },
        { source: '/:path((?!api/|_next/|oito/).+)', has: h, destination: `/oito/${m}/:path` },
      ]
    })
    // o Feed al Día no domínio próprio: / é a home; /salon/, /restaurante/ e /mascotas/ são as páginas de cada nicho
    const feedaldia = ES_DOMINIOS.flatMap(d => {
      const h = [{ type: 'host' as const, value: `(www\\.)?${d.replace(/\./g, '\\.')}` }]
      return [
        { source: '/', has: h, destination: '/oito/feedaldia/index.html' },
        { source: '/:n(salon|restaurante|mascotas)', has: h, destination: '/oito/feedaldia/:n/index.html' },
        { source: '/:n(salon|restaurante|mascotas)/', has: h, destination: '/oito/feedaldia/:n/index.html' },
        { source: '/:path((?!api/|_next/|oito/).+)', has: h, destination: '/oito/feedaldia/:path' },
      ]
    })
    return {
      beforeFiles: [
        { source: '/', has: recado, destination: '/recado/index.html' },
        { source: '/:path((?!api/|_next/|recado/).+)', has: recado, destination: '/recado/:path' },
        ...oito,
        ...feedaldia,
        // pelo endereço da Vercel: /oito/salao abre a página de venda da marca
        { source: '/oito/:m(salao|prato|pata)', destination: '/oito/:m/index.html' },
        { source: '/oito/:m(salao|prato|pata)/', destination: '/oito/:m/index.html' },
        // o Feed al Día pela Vercel: /oito/feedaldia (home) e /oito/feedaldia/salon (a página do nicho)
        { source: '/oito/feedaldia', destination: '/oito/feedaldia/index.html' },
        { source: '/oito/feedaldia/', destination: '/oito/feedaldia/index.html' },
        { source: '/oito/feedaldia/:n(salon|restaurante|mascotas)', destination: '/oito/feedaldia/:n/index.html' },
        { source: '/oito/feedaldia/:n(salon|restaurante|mascotas)/', destination: '/oito/feedaldia/:n/index.html' },
        { source: '/oito/painel', destination: '/oito/painel/index.html' },
        { source: '/oito/painel/', destination: '/oito/painel/index.html' },
        { source: '/oito/acessos', destination: '/oito/acessos/index.html' },
        { source: '/oito/acessos/', destination: '/oito/acessos/index.html' },
        // 16/10: o Rastro (o rastreador próprio, no lugar da Utmify), com senha própria
        { source: '/rastro', destination: '/rastro/index.html' },
        { source: '/rastro/', destination: '/rastro/index.html' },
      ],
      afterFiles: [{ source: '/conversa/:codigo', destination: '/call/:codigo' }],
      fallback: [],
    }
  },
};

export default nextConfig;
