import type { Metadata } from 'next'
import { Instrument_Sans } from 'next/font/google'
import { headers } from 'next/headers'
import { reuniaoPorCodigo, marcaDaEmpresa } from '@/lib/reunioes'
import { diaDoConvite } from '@/lib/reuniao-imagens'

// A PRÉVIA DO LINK da reunião. Colado no WhatsApp, mostra a miniatura (public/reuniao/capa-link.png: só a marca)
// e, ao lado, este título e esta descrição (quem convida, o assunto, o dia). Encaminhado, é igual.
const fonte = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--rj-fonte' })

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }): Promise<Metadata> {
  const { codigo } = await params
  const r = await reuniaoPorCodigo(codigo).catch(() => null)
  const marca = await marcaDaEmpresa(r?.org_id).catch(() => ({ nome: '', cor: '', logo: null }))
  // o WhatsApp escreve isto AO LADO da miniatura (que só tem a marca): é aqui que vai a frase
  const quem = (r?.criado_por_nome || marca.nome).toString().split(' ')[0]
  const titulo = r ? `${quem} te convidou pra uma reunião · ${r.titulo}` : `Reunião com a ${marca.nome}`
  const dia = diaDoConvite(r?.quando)
  // a reunião pode ser de outros (na JamRock: a Liga com a Mormaii): aí vale o texto dela, não o nome da empresa do sistema
  const quemE = r?.apresentacao ? r.apresentacao.replace(/\.+$/, '') : `Reunião por vídeo com a ${marca.nome.replace(/\.+$/, '')}`
  const descricao = `${dia ? dia + '. ' : ''}${quemE}. Toque para entrar, sem instalar nada.`
  // o endereço da imagem da capa tem que ser o desta instalação (não o de quem compilou)
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  return {
    metadataBase: host ? new URL(`${h.get('x-forwarded-proto') || 'https'}://${host}`) : undefined,
    title: titulo,
    description: descricao,
    // A CAPA É UM ARQUIVO PRONTO (public/reuniao/capa-link.png, 630×630, só a marca — igual pra toda
    // reunião). Era desenhada na hora pra cada link (buscando fonte na internet): no primeiro acesso de
    // um link novo demorava, o WhatsApp desistia e o convite saía como link puro (Nando, 29/09).
    // Pra trocar o desenho: gerar a imagem de novo e substituir o arquivo.
    openGraph: { title: titulo, description: descricao, siteName: marca.nome, type: 'website', locale: 'pt_BR',
      images: [{ url: '/reuniao/capa-link.png', width: 630, height: 630, type: 'image/png', alt: `Reunião por vídeo com a ${marca.nome.replace(/\.+$/, '')}` }] },
    twitter: { card: 'summary', title: titulo, description: descricao, images: ['/reuniao/capa-link.png'] },
    robots: { index: false, follow: false },
  }
}

export const viewport = { themeColor: '#0f0c17', viewportFit: 'cover' }

export default function LayoutReuniao({ children }: { children: React.ReactNode }) {
  return <div className={fonte.variable} style={{ fontFamily: 'var(--rj-fonte)' }}>{children}</div>
}
