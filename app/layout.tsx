import './globals.css'
import Script from 'next/script'
import { Manrope, Bricolage_Grotesque } from 'next/font/google'

// AS FONTES pelo next/font: o Next baixa na hora de montar o site e serve junto com ele. Antes
// vinham por @import no globals.css, e o empacotador não passava o pedido adiante — o sistema
// inteiro abria na fonte do sistema operacional e ninguém percebia (achado em 11/09/2026, quando a
// Bricolage "não aparecia"). Nem a Manrope estava carregando.
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--f-manrope', display: 'swap' })
// variável, com os eixos de tamanho óptico e largura — é a largura (wdth) que dá o ar condensado do logo
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz', 'wdth'], variable: '--f-bricolage', display: 'swap' })

export const metadata = {
  title: 'Carreira No Digital',
  manifest: '/manifest.json',
}

export const viewport = {
  themeColor: '#0f0c17',
}

// Aplica o tema salvo ANTES de pintar (sem flash). Padrão: escuro.
// reset-once ('tema_reset'): zera a escolha antiga uma vez (tira quem ficou preso no claro v1).
// Também lê o interruptor de vidro desta máquina ('vidro' = 'off' → sem desfoque; components/VidroToggle.tsx).
const aplicaTema = `(function(){try{if(localStorage.getItem('tema_reset')!=='2'){localStorage.removeItem('tema');localStorage.setItem('tema_reset','2')}var t=localStorage.getItem('tema');document.documentElement.setAttribute('data-theme',t==='claro'?'light':'dark');if(localStorage.getItem('vidro')==='off'){document.documentElement.setAttribute('data-vidro','off')}}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script troca o data-theme antes do React montar, e isso é intencional
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning className={`${manrope.variable} ${bricolage.variable}`}>
      <body>
        {/* beforeInteractive: roda antes de qualquer pintura, no lugar certo do documento (antes o
            <script> solto fora de <html>/<body> gerava o aviso "Cannot render a <script> outside
            the main document" a cada tela, em desenvolvimento) */}
        <Script id="tema" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: aplicaTema }} />
        {children}
      </body>
    </html>
  )
}
