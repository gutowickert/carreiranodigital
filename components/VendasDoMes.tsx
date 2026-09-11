'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'
import { CardNumero } from '@/components/ui'

// Quanto EU vendi no mês, e quanto a empresa vendeu — no painel de quem não é dono.
//
// Os números vêm prontos do servidor (/api/vendas/mes). O card da empresa só aparece se a rota
// mandar o total: quando o combinado mudar e a rota parar de mandar, ele some sozinho daqui.
// Não calcula comissão, de propósito — é "quanto vendi", não "quanto vou receber".

type Soma = { total: number; quantidade: number }
const brl = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

export default function VendasDoMes() {
  const [d, setD] = useState<{ mes: string; minhas: Soma; empresa: Soma | null } | null>(null)

  useEffect(() => {
    fetchAuth('/api/vendas/mes').then(r => r.json()).then(j => { if (j?.ok) setD(j) }).catch(() => {})
  }, [])

  if (!d) return null
  const nomeMes = new Date(`${d.mes}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })
  const qtd = (s: Soma) => `${s.quantidade} matrícula${s.quantidade === 1 ? '' : 's'}`

  return (
    <>
      {/* o número principal do vendedor: é o único da tela em relevo */}
      <CardNumero vidro destaque rotulo={`Você vendeu em ${nomeMes}`} prefixo="R$" valor={brl(d.minhas.total)} cor="var(--green-strong)" rodape={<span>{qtd(d.minhas)}</span>} />
      {d.empresa && (
        <CardNumero vidro rotulo={`A empresa vendeu em ${nomeMes}`} prefixo="R$" valor={brl(d.empresa.total)} rodape={<span>{qtd(d.empresa)}</span>} />
      )}
    </>
  )
}
