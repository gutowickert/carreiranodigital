import type { NextConfig } from "next";

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
    return [{ source: '/recado/:path*', has: [{ type: 'host' as const, value: '.*\\.vercel\\.app' }], destination: 'https://recadoencantando.com.br/recado/:path*', permanent: false }]
  },
  // o link que o cliente recebe e /conversa/<codigo> (mais claro que /call); a pagina e a mesma
  async rewrites() {
    // Recado Encantado (frente da escola): quem entra por recadoencantado.com.br vê as páginas de public/recado; a API fica em /api/recado
    // os dois nomes: recadoencantado (o da marca) e recadoencantando (o que foi registrado em 09/10)
    const recado = [{ type: 'host' as const, value: '(www\\.)?recadoencant(ado|ando)\\.com\\.br' }]
    // Oito Posts (12/10): três marcas, cada uma no seu domínio, todas servidas de public/oito/<marca>; a API fica em /api/oito
    const oito = [['salao', 'salaonofeed'], ['prato', 'pratonofeed'], ['pata', 'patanofeed']].flatMap(([m, d]) => {
      const h = [{ type: 'host' as const, value: `(www\\.)?${d}\\.com\\.br` }]
      return [
        { source: '/', has: h, destination: `/oito/${m}/index.html` },
        { source: '/:path((?!api/|_next/|oito/).+)', has: h, destination: `/oito/${m}/:path` },
      ]
    })
    return {
      beforeFiles: [
        { source: '/', has: recado, destination: '/recado/index.html' },
        { source: '/:path((?!api/|_next/|recado/).+)', has: recado, destination: '/recado/:path' },
        ...oito,
        // pelo endereço da Vercel: /oito/salao abre a página de venda da marca
        { source: '/oito/:m(salao|prato|pata)', destination: '/oito/:m/index.html' },
        { source: '/oito/:m(salao|prato|pata)/', destination: '/oito/:m/index.html' },
        { source: '/oito/painel', destination: '/oito/painel/index.html' },
        { source: '/oito/painel/', destination: '/oito/painel/index.html' },
      ],
      afterFiles: [{ source: '/conversa/:codigo', destination: '/call/:codigo' }],
      fallback: [],
    }
  },
};

export default nextConfig;