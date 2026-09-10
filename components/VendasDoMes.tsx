'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

// Quanto EU vendi no mês, e quanto a empresa vendeu — no painel de quem não é dono.
//
// Os números vêm prontos do servidor (/api/vendas/mes). O card da empresa só aparece se a rota
// mandar o total: quando o combinado mudar e a rota parar de mandar, ele some sozinho daqui.
// Não calcula comissão, de propósito — é "quanto vendi", não "quanto vou receber".

type Soma = { total: number; quantidade: number }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const rotulo = { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' } as React.CSSProperties
const valor = { fontSize: '22px', fontWeight: 700 } as React.CSSProperties
const detalhe = { fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' } as React.CSSProperties

export default function VendasDoMes({ card }: { card: React.CSSProperties }) {
  const [d, setD] = useState<{ mes: string; minhas: Soma; empresa: Soma | null } | null>(null)

  useEffect(() => {
    fetchAuth('/api/vendas/mes').then(r => r.json()).then(j => { if (j?.ok) setD(j) }).catch(() => {})
  }, [])

  if (!d) return null
  const nomeMes = new Date(`${d.mes}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })
  const qtd = (s: Soma) => `${s.quantidade} matrícula${s.quantidade === 1 ? '' : 's'}`

  return (
    <>
      <div style={{ ...card, padding: '20px' }}>
        <div style={rotulo}>Você vendeu em {nomeMes}</div>
        <div style={{ ...valor, color: 'var(--green-strong)' }}>{brl(d.minhas.total)}</div>
        <div style={detalhe}>{qtd(d.minhas)}</div>
      </div>
      {d.empresa && (
        <div style={{ ...card, padding: '20px' }}>
          <div style={rotulo}>A empresa vendeu em {nomeMes}</div>
          <div style={{ ...valor, color: 'var(--text)' }}>{brl(d.empresa.total)}</div>
          <div style={detalhe}>{qtd(d.empresa)}</div>
        </div>
      )}
    </>
  )
}
