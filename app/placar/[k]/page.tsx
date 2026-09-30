import AreaDoCliente from '@/app/cliente/page'

// O LINK BONITO do placar do cliente: /placar/<chave>. É a mesma tela de /cliente?k=<chave>, que segue
// valendo pra quem já tem o link antigo. Aqui o servidor sabe a chave, então o link ganha prévia com o
// nome do cliente no WhatsApp (layout.tsx e opengraph-image.tsx ao lado).
export default async function PlacarDoCliente({ params }: { params: Promise<{ k: string }> }) {
  const { k } = await params
  return <AreaDoCliente chave={k} />
}
