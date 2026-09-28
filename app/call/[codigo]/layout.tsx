import type { Metadata } from 'next'
import { chamadaPorCodigo } from '@/lib/chamadas'

// A PRÉVIA DO LINK. Colado no WhatsApp, o link da chamada mostra a marca da escola e quem está
// convidando ("Guto te convidou pra uma conversa"), em vez de um endereço cru que parece golpe.
// A imagem vem de opengraph-image.tsx, ao lado.
type Props = { params: Promise<{ codigo: string }>; children: React.ReactNode }

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }): Promise<Metadata> {
  const { codigo } = await params
  const ch = await chamadaPorCodigo(codigo).catch(() => null)
  const quem = (ch?.criado_por_nome || 'A Carreira no Digital').toString().split(' ')[0]
  const titulo = `${quem} te convidou pra uma conversa`
  const descricao = `${ch?.com_video ? 'Chamada de vídeo' : 'Chamada de voz'} com a Carreira no Digital. Abre direto no navegador, sem instalar nada.`
  return {
    title: `${titulo} · Carreira no Digital`,
    description: descricao,
    openGraph: { title: titulo, description: descricao, siteName: 'Carreira no Digital', type: 'website', locale: 'pt_BR' },
    twitter: { card: 'summary_large_image', title: titulo, description: descricao },
    robots: { index: false, follow: false },
  }
}

export default function LayoutChamada({ children }: Props) {
  return children
}
