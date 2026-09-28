import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  // o link que o cliente recebe e /conversa/<codigo> (mais claro que /call); a pagina e a mesma
  async rewrites() { return [{ source: '/conversa/:codigo', destination: '/call/:codigo' }] },
};

export default nextConfig;