import type { Metadata } from 'next'
import { Anton, Poppins } from 'next/font/google'
import AgentesClient from './AgentesClient'

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--f-anton' })
const poppins = Poppins({ weight: ['400', '500', '600', '700', '800'], subsets: ['latin'], variable: '--f-poppins' })

export const metadata: Metadata = {
  title: 'Agentes de IA — Módulo 1 | Carreira no Digital',
  description: 'Do zero até ter conteúdo, anúncios e estratégia prontos pra rodar.',
}

export default function Page() {
  return (
    <div className={`${anton.variable} ${poppins.variable}`}>
      <AgentesClient />
    </div>
  )
}
