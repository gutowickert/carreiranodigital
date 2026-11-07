import type { Metadata, Viewport } from 'next'
import { Fraunces } from 'next/font/google'
import './psi.css'

// PSI — o consultório da Morgana (psicóloga). Área separada do sistema da escola, com o próprio
// manifest (instala como app próprio na tela inicial), a própria cor e nenhum menu da escola.
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], variable: '--f-fraunces', display: 'swap' })

export const metadata: Metadata = {
  title: 'Morgana Schena Wickert · Consultório',
  description: 'Agenda, atendimentos e prontuário.',
  manifest: '/psi/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Consultório' },
  icons: { icon: '/psi/favicon.png', apple: '/psi/icone-192.png' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#F6EFE8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function PsiLayout({ children }: { children: React.ReactNode }) {
  return <div className={`psi ${fraunces.variable}`}>{children}</div>
}
