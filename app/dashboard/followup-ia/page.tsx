'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const ETAPA_LABEL: Record<string, string> = { atendimento_inicial: 'Atendimento inicial', lote_preco_ok: 'Lote e preço', oferecer_bolsa: 'Oferecer bolsa' }

export default function FollowupIA() {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => { (async () => { const j = await fetchAuth('/api/dashboard-followup').then(r => r.json()).catch(() => null); if (j?.ok) setD(j); setCarregando(false) })() }, [])

  if (carregando) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando...</div>
  if (!d) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Não consegui carregar.</div>

  const maxSerie = Math.max(1, ...(d.followups?.serie || []).map((s: any) => s.envios))
  const KPI = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || 'var(--text)' }}>{valor}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1040, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>📊 Follow-up automático</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 22px' }}>Resultados de hoje ({d.hoje}) e custo da automação — pra decidir. A IA roda os follow-ups; o time atende quem responde.</p>

      {/* KPIs do dia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 22 }}>
        <KPI label="Follow-ups enviados hoje" valor={d.followups?.hoje ?? 0} cor="var(--accent-soft)" />
        <KPI label="Responderam (foram pro time)" valor={d.resultados?.responderam ?? 0} cor="#2b8a3e" />
        <KPI label="Ganhos hoje" valor={d.resultados?.ganhos ?? 0} cor="#2b8a3e" sub={d.resultados?.ganhoValor ? `R$ ${Number(d.resultados.ganhoValor).toLocaleString('pt-BR')}` : null} />
        <KPI label="Perdas hoje" valor={d.resultados?.perdas ?? 0} cor="#e0533d" />
        <KPI label="Frios na IA (fila)" valor={d.friosIA ?? 0} cor="var(--text)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* custos */}
        <div style={{ ...card, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 14px' }}>💸 Custo de hoje</h3>
          <Linha label="🤖 IA (Claude)" valor={d.custos?.ia_fmt} />
          <Linha label="🟢 WhatsApp (templates)" valor={d.custos?.wa_fmt} />
          <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
          <Linha label="Total do dia" valor={d.custos?.total_fmt} forte />
          <Linha label="Custo por follow-up" valor={d.custos?.por_followup} muted />
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '10px 0 0' }}>Estimativa (USD→BRL 5,4; Meta Brasil por categoria).</p>
        </div>

        {/* funil */}
        <div style={{ ...card, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 14px' }}>📍 Onde estão os frios da IA</h3>
          {Object.entries(d.funil || {}).map(([et, n]: any) => (
            <div key={et} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}><span>{ETAPA_LABEL[et] || et}</span><b>{n}</b></div>
              <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4 }}><div style={{ height: 8, width: `${Math.round((n / Math.max(1, d.friosIA)) * 100)}%`, background: 'var(--accent)', borderRadius: 4 }} /></div>
            </div>
          ))}
          {!d.friosIA && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Nenhum lead na fila da IA.</p>}
        </div>
      </div>

      {/* série 7 dias */}
      <div style={{ ...card, padding: 18, marginTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 14px' }}>📈 Follow-ups por dia (7 dias)</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
          {(d.followups?.serie || []).map((s: any, i: number) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{s.envios}</div>
              <div style={{ width: '70%', height: `${Math.round((s.envios / maxSerie) * 90)}px`, minHeight: 2, background: 'var(--accent)', borderRadius: '4px 4px 0 0' }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.dia}</div>
            </div>
          ))}
        </div>
      </div>

      {/* por template */}
      {Object.keys(d.followups?.porTemplate || {}).length > 0 && (
        <div style={{ ...card, padding: 18, marginTop: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 12px' }}>Por template (hoje)</h3>
          {Object.entries(d.followups.porTemplate).sort((a: any, b: any) => b[1] - a[1]).map(([t, n]: any) => (
            <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)', padding: '4px 0' }}><span style={{ fontFamily: 'monospace' }}>{t}</span><b>{n}</b></div>
          ))}
        </div>
      )}
    </div>
  )
}

function Linha({ label, valor, forte, muted }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
      <span style={{ fontSize: 13, color: muted ? 'var(--text-faint)' : 'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize: forte ? 18 : 14, fontWeight: forte ? 800 : 600, color: forte ? 'var(--text)' : muted ? 'var(--text-faint)' : 'var(--text-2)' }}>{valor}</span>
    </div>
  )
}
