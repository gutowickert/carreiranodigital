import type { Metadata } from 'next'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// a prévia do link no WhatsApp: "Placar do tráfego · Fabiola Lemanski", com o cartão da marca
export async function generateMetadata({ params }: { params: Promise<{ k: string }> }): Promise<Metadata> {
  const { k } = await params
  const { data } = k && k.length >= 12 ? await sb.from('projetos').select('cliente').eq('portal_chave', k).maybeSingle() : { data: null }
  const nome = data?.cliente || 'o teu negócio'
  const titulo = `Placar do tráfego · ${nome}`
  const descricao = 'Conversas, investimento, vendas e retorno da tua campanha, ao vivo. Carreira no Digital.'
  return {
    title: titulo, description: descricao,
    openGraph: { title: titulo, description: descricao, siteName: 'Carreira no Digital', type: 'website', locale: 'pt_BR' },
    twitter: { card: 'summary_large_image', title: titulo, description: descricao },
    robots: { index: false, follow: false },
  }
}

export default function LayoutPlacar({ children }: { children: React.ReactNode }) { return children }
