// Seu 2027: o que as páginas públicas precisam saber (pixel e preço). Sem segredo nenhum aqui.
import { NextResponse } from 'next/server'
import { seu2027 } from '@/lib/seu2027/config'

export async function GET() {
  // compraPeloSite: a página do mapa dispara o Purchase do pixel (com o mesmo eventID da API de Conversões).
  // Se o Guto preferir o pixel configurado dentro da Kiwify, SEU2027_PURCHASE_PELO_SITE=0 desliga o nosso (pra não contar dobrado).
  return NextResponse.json({ pixel: seu2027.pixel() || null, preco: seu2027.preco, compraPeloSite: process.env.SEU2027_PURCHASE_PELO_SITE !== '0' }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
