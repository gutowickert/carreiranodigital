'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const USD = 5.5 // aproximado p/ mostrar em R$

export default function IaUso() {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => { (async () => { const j = await fetchAuth('/api/ia-uso/resumo').then(r => r.json()).catch(() => null); setD(j); setCarregando(false) })() }, [])

  const brl = (u: number) => 'R$ ' + (u * USD).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const usd = (u: number) => '$' + (u || 0).toFixed(2)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🧮 Custo da IA</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>Quanto a IA custa de verdade, por tipo de chamada (últimos 30 dias). Base pra precificar o SaaS — meta: custo de IA ≤ 20-30% do plano.</p>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div>
        : !d?.ok ? <div style={{ ...card, textAlign: 'center', color: 'var(--text-faint)' }}>Erro ao carregar.</div>
          : d.total_chamadas === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--text-faint)', padding: 30 }}>
              Ainda sem dados de uso. A medição começou agora — volte em algumas horas/dias que os números aparecem conforme a IA roda.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                {[
                  ['Custo no período', usd(d.custo_total_usd), brl(d.custo_total_usd)],
                  ['Projeção do mês', usd(d.projecao_mes_usd), brl(d.projecao_mes_usd)],
                  ['Por dia', usd(d.custo_dia_usd), brl(d.custo_dia_usd)],
                  ['Chamadas', d.total_chamadas.toLocaleString('pt-BR'), `média ${usd(d.custo_medio_chamada)}/chamada`],
                ].map(([t, v, s]) => (
                  <div key={t as string} style={card}>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '2px 0' }}>{v}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{s}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>Por tipo de chamada</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                    {['Evento', 'Chamadas', 'Custo', 'Médio/chamada', 'Tokens'].map(h => <th key={h} style={{ padding: '8px 16px', fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.por_evento.map((e: any) => (
                      <tr key={e.evento} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                        <td style={{ padding: '8px 16px', fontWeight: 600 }}>{e.evento}</td>
                        <td style={{ padding: '8px 16px' }}>{e.chamadas.toLocaleString('pt-BR')}</td>
                        <td style={{ padding: '8px 16px' }}>{usd(e.custo_usd)} <span style={{ color: 'var(--text-faint)' }}>· {brl(e.custo_usd)}</span></td>
                        <td style={{ padding: '8px 16px' }}>{usd(e.custo_medio)}</td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-2)' }}>{e.tokens.toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12 }}>* Custo estimado pelos preços dos modelos (Sonnet $3/$15, Haiku $1/$5, Opus $5/$25 por 1M tokens). R$ ~5,50/USD. {d.dias_com_dado} dia(s) com dado.</p>
            </>
          )}
    </div>
  )
}
