import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './checkup.css'

// Check-up de IA do teunegócio OS: página pública (sem login), marca do OS (roxo escuro, selo verde).
// A Poppins 900 é só a letra do logo; o resto usa a Bricolage e a Manrope do layout raiz.
const poppins = Poppins({ subsets: ['latin'], weight: ['900'], variable: '--f-poppins', display: 'swap' })

const titulo = 'Check-up de IA do teu negócio · teunegócio OS'
const descricao = 'Em 5 minutos tu descobre quantas horas por semana a IA pode tirar das tuas costas e quanto faturamento está ficando na mesa. Grátis.'

export const metadata: Metadata = {
  title: titulo, description: descricao,
  openGraph: { title: titulo, description: descricao, siteName: 'teunegócio OS', type: 'website', locale: 'pt_BR' },
  twitter: { card: 'summary', title: titulo, description: descricao },
}

export default function LayoutCheckup({ children }: { children: React.ReactNode }) {
  return <div className={`ck ${poppins.variable}`}>{children}</div>
}
