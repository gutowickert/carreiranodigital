'use client'

import Link from 'next/link'
import { Coins, Receipt, ArrowLeftRight, TrendingUp, type LucideIcon } from 'lucide-react'

// RELATÓRIOS DO FINANCEIRO (09/10/2026, pedido do Rick) — a central: um cartão por relatório.
// Não lê nem grava nada, só leva pra cada tela. Relatório novo entra aqui como mais um cartão.
// Os itens "Relatório de ..." do menu continuam lá por enquanto, pro time se acostumar com a central.

type Relatorio = { nome: string; href: string; desc: string; icone: LucideIcon }

const RELATORIOS: Relatorio[] = [
  { nome: 'Receitas', href: '/dashboard/financeiro/receitas', icone: Coins, desc: 'Quanto entrou no período, por produto. Abre cada produto e mostra os recebimentos.' },
  { nome: 'Despesas', href: '/dashboard/financeiro/custos', icone: Receipt, desc: 'Quanto saiu no período, por categoria. Abre cada categoria e mostra os pagamentos.' },
  { nome: 'Transferências', href: '/dashboard/financeiro/transferencias', icone: ArrowLeftRight, desc: 'O dinheiro que passou de um caixa pro outro no período.' },
  { nome: 'Fluxo de Caixa', href: '/dashboard/financeiro/fluxo', icone: TrendingUp, desc: 'Entradas, saídas e saldo do mês, com o extrato e pra onde foi o dinheiro.' },
]

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }

export default function RelatoriosFinanceiro() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📊 Relatórios</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>Os relatórios do financeiro num lugar só. Clique no que quer ver.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {RELATORIOS.map(r => {
          const Icone = r.icone
          return (
            <Link key={r.href} href={r.href} style={{ ...card, padding: 18, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icone size={20} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{r.nome}</span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>{r.desc}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
