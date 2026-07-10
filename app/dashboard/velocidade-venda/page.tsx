'use client'

import { useEffect, useState } from 'react'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const periodos = [{ v: 30, l: '30 dias' }, { v: 90, l: '90 dias' }, { v: 365, l: '12 meses' }, { v: 0, l: 'Tudo' }]

function corDias(d: number) { return d <= 3 ? 'var(--green)' : d <= 7 ? 'var(--amber)' : 'var(--red)' }

export default function VelocidadeVenda() {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState(365)

  useEffect(() => {
    setCarregando(true)
    const desde = periodo ? new Date(Date.now() - periodo * 864e5).toISOString() : ''
    fetch(`/api/velocidade-venda${desde ? `?desde=${desde}` : ''}`).then(r => r.json())
      .then(j => { if (j.ok) setD(j) }).finally(() => setCarregando(false))
  }, [periodo])

  const g = d?.geral
  const KPI = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || 'var(--text)', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
  const maxPct = Math.max(1, ...(d?.distribuicao || []).map((b: any) => b.pct))

  const Tabela = ({ titulo, linhas }: { titulo: string; linhas: any[] }) => (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{titulo}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {[titulo.split(' ').pop(), 'Vendas', 'Média (dias)', 'Mediana'].map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 16px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500 }}>{i === 0 ? '' : h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? <tr><td colSpan={4} style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</td></tr> :
            linhas.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 16px', fontSize: 13, color: 'var(--text)' }}>{r.label}</td>
                <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>{r.n}</td>
                <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: corDias(r.media) }}>{r.media}</td>
                <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>{r.mediana}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Velocidade de Venda</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {periodos.map(p => (
            <button key={p.v} onClick={() => setPeriodo(p.v)}
              style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-strong)', background: periodo === p.v ? 'var(--accent)' : 'var(--surface-2)', color: periodo === p.v ? 'var(--on-accent)' : 'var(--text-2)', fontWeight: periodo === p.v ? 700 : 400 }}>{p.l}</button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 20px' }}>Tempo entre o lead <b style={{ color: 'var(--text-muted)' }}>entrar no sistema</b> e <b style={{ color: 'var(--text-muted)' }}>fechar a compra</b> (data de entrada → data do ganho).</p>

      {carregando ? <div style={{ color: 'var(--text-faint)' }}>Carregando...</div> : !g?.n ? <div style={{ color: 'var(--text-faint)' }}>Nenhuma venda com dados no período.</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KPI label="Tempo médio" valor={`${g.media} dias`} cor={corDias(g.media)} sub={`${g.n} vendas`} />
            <KPI label="Mediana" valor={`${g.mediana} dias`} cor={corDias(g.mediana)} sub="metade fecha em até isso" />
            <KPI label="75% fecham em até" valor={`${g.p75} dias`} />
            <KPI label="90% fecham em até" valor={`${g.p90} dias`} />
            <KPI label="Mais rápido / lento" valor={`${g.min} / ${g.max}`} sub="dias" />
          </div>

          {/* distribuição */}
          <div style={{ ...card, padding: 18, marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Distribuição</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(d.distribuicao || []).map((b: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 90, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{b.label}</div>
                  <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                    <div style={{ width: `${(b.pct / maxPct) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 6, minWidth: b.n ? 2 : 0 }} />
                  </div>
                  <div style={{ width: 78, fontSize: 12, color: 'var(--text-2)', textAlign: 'right', flexShrink: 0 }}>{b.n} · {b.pct}%</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <Tabela titulo="Por Origem" linhas={d.porOrigem || []} />
            <Tabela titulo="Por Vendedor" linhas={d.porVendedor || []} />
            <Tabela titulo="Por Produto" linhas={d.porProduto || []} />
          </div>

          {d.via_herospark > 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 16 }}>
              ⚠️ {d.via_herospark} venda(s) foram importadas via HeroSpark — nelas a data de entrada pode não ser o 1º contato real, então o tempo verdadeiro pode ser um pouco menor.
            </p>
          )}
        </>
      )}
    </div>
  )
}
