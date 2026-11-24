// Recado Encantado: o preço de agora, pelo relógio do servidor (24/11). As páginas mostram o que vem daqui;
// quem cobra de verdade é o /api/recado/pedido, que calcula de novo na hora de criar a cobrança.
import { NextResponse } from 'next/server'
import { recadoConfig as cfg, precoDe, precoNatal, antesDaVirada, VIRADA_NATAL, PRECO_NATAL } from '@/lib/recado/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const agora = new Date()
  const pacotes: Record<string, Record<string, number | null>> = {}
  for (const [per, pacs] of Object.entries(cfg.pacotes)) { pacotes[per] = {}; for (const pac of Object.keys(pacs)) pacotes[per][pac] = precoDe(per, pac, agora) }
  return NextResponse.json({
    agora: agora.toISOString(),
    natal: { preco: precoNatal(agora), promocao: antesDaVirada(agora), ate: PRECO_NATAL.ate, depois: PRECO_NATAL.depois, virada: VIRADA_NATAL },
    prazo: cfg.prazoTexto,
    pacotes,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
