'use client'

import { BarChart3 } from 'lucide-react'
import { Card, CabecalhoPagina, Vazio } from '@/components/ui'

// RELATÓRIOS DO FINANCEIRO — lugar reservado (13/10/2026, pedido do Rick).
// Nasceu em 09/10 como uma central de cartões (Receitas, Despesas, Transferências, Fluxo), mas
// repetia os itens que já estão no menu. Voltou a "em construção" e foi pro fim do grupo Financeiro.
// Não lê nem grava nada.
export default function RelatoriosFinanceiro() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <CabecalhoPagina titulo="Relatórios" sub="Financeiro" />
      <Card>
        <Vazio icone={BarChart3} titulo="Em construção" texto="Em breve aqui." />
      </Card>
    </div>
  )
}
