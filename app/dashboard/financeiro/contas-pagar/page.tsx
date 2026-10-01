'use client'

import { CreditCard } from 'lucide-react'
import { Card, CabecalhoPagina, Vazio } from '@/components/ui'

// Lugar reservado (01/10/2026, pedido do Rick): a tela de Contas a Pagar ainda vai ser desenhada.
// Por enquanto não lê nem grava nada.
export default function ContasPagar() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <CabecalhoPagina titulo="Contas a Pagar" sub="Financeiro" />
      <Card>
        <Vazio icone={CreditCard} titulo="Em construção" texto="Em breve aqui." />
      </Card>
    </div>
  )
}
