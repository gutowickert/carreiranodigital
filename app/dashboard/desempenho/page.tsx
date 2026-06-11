'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#fff', outline: 'none' } as React.CSSProperties

function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function pct(v: number) { return (isFinite(v) ? v * 100 : 0).toFixed(0) + '%' }
function hojeStr() { return new Date().toISOString().split('T')[0] }
function addDays(s: string, d: number) { const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0] }
function diasEntre(a: string, b: string) { return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000) }

const ETAPA_LABEL: Record<string, string> = {
  aguardando_atendimento: 'Aguardando atendimento', em_atendimento: 'Em atendimento',
  qualificado: 'Qualificado', proposta: 'Proposta enviada', negociacao: 'Negociação',
  matricula: 'Matrícula', ganho: 'Ganho', perda: 'Perda', perdido: 'Perdido',
}
const ETAPAS_TERMINAIS = ['ganho', 'perda', 'perdido', 'cancelado']
function labelEtapa(e: string) { return ETAPA_LABEL[e] || (e ? e.replace(/_/g, ' ') : '—') }

const CORES = { verde: '#34d399', amarelo: '#fbbf24', vermelho: '#f87171' }

export default function Desempenho() {
  const hoje = hojeStr()
  const [de, setDe] = useState(addDays(hoje, -30))
  const [ate, setAte] = useState(hoje)
  const [carregando, setCarregando] = useState(true)

  const [turmas, setTurmas] = useState<any[]>([])
  const [matriculas, setMatriculas] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [marketing, setMarketing] = useState<any[]>([])
  const [financeiros, setFinanceiros] = useState<any[]>([])
  const [spend, setSpend] = useState<{ ok: boolean; total: number; campaigns: { name: string; spend: number }[]; error?: string }>({ ok: false, total: 0, campaigns: [] })

  useEffect(() => { carregar() }, [])
  useEffect(() => { carregarGasto() }, [de, ate])

  async function carregarGasto() {
    try {
      const res = await fetch(`/api/meta/spend?since=${de}&until=${ate}`)
      setSpend(await res.json())
    } catch { setSpend({ ok: false, total: 0, campaigns: [], error: 'falha ao buscar gasto' }) }
  }

  async function carregar() {
    setCarregando(true)
    const [t, m, l, mk, f] = await Promise.all([
      supabase.from('turmas').select('id, codigo, preco_venda, meta_matriculas, data_inicio, status, produtos(nome), cidades(nome)'),
      supabase.from('matriculas').select('id, turma_id, valor_pago, data_compra, lead_id'),
      supabase.from('leads').select('id, turma_id, etapa, utm_source, utm_campaign, valor_venda, criado_em, atualizado_em'),
      supabase.from('lancamentos_empresa').select('valor, data_vencimento, data_pagamento, descricao').eq('categoria', 'marketing'),
      supabase.from('financeiro_turma').select('turma_id, receita_realizada, receita_prevista, margem_prevista, margem_realizada'),
    ])
    setTurmas(t.data || []); setMatriculas(m.data || []); setLeads(l.data || [])
    setMarketing(mk.data || []); setFinanceiros(f.data || [])
    setCarregando(false)
  }

  const inPeriodo = (d?: string | null) => { if (!d) return false; const day = d.substring(0, 10); return day >= de && day <= ate }

  // KPIs do período
  const leadsPeriodo = leads.filter(l => inPeriodo(l.criado_em))
  const matsPeriodo = matriculas.filter(m => inPeriodo(m.data_compra))
  const receitaPeriodo = matsPeriodo.reduce((s, m) => s + (m.valor_pago || 0), 0)
  const trafegoProvisionado = marketing.filter(x => inPeriodo(x.data_pagamento || x.data_vencimento)).reduce((s, x) => s + (x.valor || 0), 0)
  const usandoReal = spend.ok && spend.total > 0
  const trafegoPeriodo = usandoReal ? spend.total : trafegoProvisionado
  const cpl = leadsPeriodo.length ? trafegoPeriodo / leadsPeriodo.length : 0
  const cpv = matsPeriodo.length ? trafegoPeriodo / matsPeriodo.length : 0
  const roas = trafegoPeriodo ? receitaPeriodo / trafegoPeriodo : 0
  const convGeral = leadsPeriodo.length ? matsPeriodo.length / leadsPeriodo.length : 0

  // mapas auxiliares
  const finMap: Record<string, any> = {}; financeiros.forEach(f => { finMap[f.turma_id] = f })
  const matsPorTurma: Record<string, number> = {}; matriculas.forEach(m => { matsPorTurma[m.turma_id] = (matsPorTurma[m.turma_id] || 0) + 1 })
  const leadsPorTurma: Record<string, number> = {}; leads.forEach(l => { if (l.turma_id) leadsPorTurma[l.turma_id] = (leadsPorTurma[l.turma_id] || 0) + 1 })

  // Bloco 1: turmas em risco
  const turmasAvaliadas = turmas
    .filter(t => !['realizada', 'cancelada'].includes(t.status))
    .map(t => {
      const mats = matsPorTurma[t.id] || 0
      const meta = t.meta_matriculas || 0
      const dias = t.data_inicio ? diasEntre(hoje, t.data_inicio) : 999
      const leadsT = leadsPorTurma[t.id] || 0
      const conv = leadsT ? mats / leadsT : 0
      const margem = finMap[t.id]?.margem_prevista ?? 0
      const faltam = Math.max(0, meta - mats)
      let nivel: 'verde' | 'amarelo' | 'vermelho' = 'amarelo'
      let motivo = ''
      if (meta > 0 && mats >= meta) { nivel = 'verde'; motivo = 'Meta atingida' }
      else if (dias <= 0) { nivel = 'vermelho'; motivo = `Já começou com ${mats}/${meta}` }
      else if (dias <= 7 && mats < meta * 0.7) { nivel = 'vermelho'; motivo = `Faltam ${faltam} em ${dias} dia(s)` }
      else { nivel = 'amarelo'; motivo = `Faltam ${faltam} em ${dias} dia(s)` }
      if (margem < 0) { nivel = 'vermelho'; motivo += ' · margem negativa' }
      return { t, mats, meta, dias, leadsT, conv, margem, nivel, motivo }
    })
    .sort((a, b) => {
      const ordem: any = { vermelho: 0, amarelo: 1, verde: 2 }
      if (ordem[a.nivel] !== ordem[b.nivel]) return ordem[a.nivel] - ordem[b.nivel]
      return a.dias - b.dias
    })

  // Bloco 2: campanhas/origens (período)
  const campMap: Record<string, { leads: number; ganhos: number; receita: number }> = {}
  leadsPeriodo.forEach(l => {
    const k = l.utm_campaign || l.utm_source || 'sem origem'
    if (!campMap[k]) campMap[k] = { leads: 0, ganhos: 0, receita: 0 }
    campMap[k].leads++
    if (l.etapa === 'ganho') { campMap[k].ganhos++; campMap[k].receita += (l.valor_venda || 0) }
  })
  const campanhas = Object.entries(campMap)
    .map(([nome, v]) => ({ nome, ...v, conv: v.leads ? v.ganhos / v.leads : 0 }))
    .sort((a, b) => b.leads - a.leads)

  // Bloco 3: funil
  const etapaMap: Record<string, { count: number; somaDias: number }> = {}
  leads.forEach(l => {
    const e = l.etapa || 'sem_etapa'
    if (!etapaMap[e]) etapaMap[e] = { count: 0, somaDias: 0 }
    etapaMap[e].count++
    const ref = l.atualizado_em || l.criado_em
    if (ref) etapaMap[e].somaDias += Math.max(0, diasEntre(ref.substring(0, 10), hoje))
  })
  const totalLeadsFunil = leads.length || 1
  const funil = Object.entries(etapaMap)
    .map(([etapa, v]) => ({ etapa, count: v.count, pctv: v.count / totalLeadsFunil, diasMedio: v.count ? v.somaDias / v.count : 0, terminal: ETAPAS_TERMINAIS.includes(etapa) }))
    .sort((a, b) => b.count - a.count)
  const gargalo = funil.filter(f => !f.terminal).sort((a, b) => (b.count * b.diasMedio) - (a.count * a.diasMedio))[0]

  // Bloco 4: resultado por turma
  const resultadoTurmas = turmas
    .map(t => ({ t, receita: finMap[t.id]?.receita_realizada ?? 0, margem: finMap[t.id]?.margem_realizada ?? finMap[t.id]?.margem_prevista ?? 0, mats: matsPorTurma[t.id] || 0 }))
    .sort((a, b) => b.receita - a.receita)

  const KPI = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || '#fff', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  if (carregando) return <div style={{ padding: 40, color: '#6b7280' }}>Carregando desempenho...</div>

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Desempenho</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>O que está bom, o que está em risco e onde agir</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Período:</span>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} />
          <span style={{ color: '#6b7280' }}>—</span>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} />
          <button onClick={() => { setDe(addDays(hoje, -30)); setAte(hoje) }} style={{ ...inp, cursor: 'pointer' }}>30d</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 10 }}>
        <KPI label="Leads" valor={leadsPeriodo.length} />
        <KPI label="Vendas" valor={matsPeriodo.length} sub={`Conversão ${pct(convGeral)}`} />
        <KPI label="Receita" valor={fmt(receitaPeriodo)} cor="#34d399" />
        <KPI label="Tráfego gasto" valor={fmt(trafegoPeriodo)} cor="#f87171" sub={usandoReal ? 'real (Meta)' : 'provisionado'} />
        <KPI label="ROAS geral" valor={(roas).toFixed(2) + 'x'} cor={roas >= 1 ? '#34d399' : '#f87171'} sub="Receita ÷ tráfego" />
        <KPI label="CPL / CPV" valor={`${fmt(cpl)} / ${fmt(cpv)}`} sub="Custo por lead / por venda" />
      </div>
      <p style={{ fontSize: 11, color: spend.error ? '#f87171' : '#6b7280', marginBottom: 24 }}>
        {usandoReal
          ? 'ROAS/CPL/CPV calculados com o gasto REAL do Meta no período.'
          : spend.error
            ? `Sem gasto real do Meta (${spend.error}). Usando tráfego provisionado.`
            : 'Usando tráfego provisionado (sem gasto real do Meta no período, ou ainda carregando).'}
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>1. Turmas: saúde e risco</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Ordenadas do mais crítico pro mais tranquilo. 🔴 puxar venda / decidir cancelar · 🟡 acompanhar · 🟢 ok</p>
      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 32 }}>
        {turmasAvaliadas.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: '#6b7280' }}>Nenhuma turma aberta no momento.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                {['', 'Turma', 'Matrículas / meta', 'Início', 'Conversão', 'Margem prev.', 'Situação'].map((h, i) => (
                  <th key={i} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '10px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {turmasAvaliadas.map(r => (
                <tr key={r.t.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                  <td style={{ padding: '12px 16px', width: 24 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: CORES[r.nivel] }} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{r.t.produtos?.nome} — {r.t.cidades?.nome}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{r.t.codigo}</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#d1d1d1' }}>{r.mats} / {r.meta}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: '#9ca3af' }}>
                    {r.dias > 0 ? `em ${r.dias}d` : r.dias === 0 ? 'hoje' : `há ${-r.dias}d`}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: '#9ca3af' }}>{pct(r.conv)} <span style={{ color: '#6b7280' }}>({r.leadsT}l)</span></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: r.margem >= 0 ? '#34d399' : '#f87171' }}>{fmt(r.margem)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: CORES[r.nivel] }}>{r.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>2. Campanhas / origens que convertem</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>No período. Muitos leads com conversão baixa = revisar criativo/segmentação. Conversão alta = escalar.</p>
      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 32 }}>
        {campanhas.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: '#6b7280' }}>Sem leads no período.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                {['Origem / campanha', 'Leads', 'Vendas', 'Conversão', 'Receita', 'Leitura'].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campanhas.map(c => {
                const escala = c.leads >= 5 && c.conv >= 0.15
                const revisar = c.leads >= 10 && c.conv < 0.08
                return (
                  <tr key={c.nome} style={{ borderBottom: '1px solid #3a3a3c' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#fff' }}>{c.nome}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#d1d1d1' }}>{c.leads}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#d1d1d1' }}>{c.ganhos}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: c.conv >= 0.15 ? '#34d399' : c.conv < 0.08 ? '#f87171' : '#d1d1d1' }}>{pct(c.conv)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#34d399' }}>{fmt(c.receita)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, color: escala ? '#34d399' : revisar ? '#f87171' : '#6b7280' }}>
                      {escala ? '↑ escalar' : revisar ? '⚠ revisar' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {spend.ok && spend.campaigns.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Gasto real por campanha (Meta)</h2>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Gasto real do Meta no período. Pra cruzar com as vendas por campanha, configure os parâmetros de URL do anúncio passando o nome da campanha no utm_campaign.</p>
          <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Campanha</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Gasto</th>
                </tr>
              </thead>
              <tbody>
                {[...spend.campaigns].sort((a, b) => b.spend - a.spend).map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #3a3a3c' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#fff' }}>{c.name}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#f87171' }}>{fmt(c.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>3. Funil: onde os leads travam</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
        {gargalo
          ? <>Maior gargalo: <b style={{ color: '#fbbf24' }}>{labelEtapa(gargalo.etapa)}</b> — {gargalo.count} leads parados há ~{gargalo.diasMedio.toFixed(0)} dias em média. Vale cobrar atendimento.</>
          : 'Sem gargalo evidente.'}
      </p>
      <div style={{ ...card, padding: 16, marginBottom: 32 }}>
        {funil.map(f => (
          <div key={f.etapa} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <div style={{ width: 180, fontSize: 13, color: f.terminal ? '#6b7280' : '#d1d1d1' }}>{labelEtapa(f.etapa)}</div>
            <div style={{ flex: 1, background: '#1c1c1e', borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(2, f.pctv * 100)}%`, background: f.terminal ? '#3a3a3c' : (gargalo && f.etapa === gargalo.etapa ? '#fbbf24' : '#7c3aed'), borderRadius: 6 }} />
              <span style={{ position: 'absolute', left: 8, top: 3, fontSize: 12, color: '#fff', fontWeight: 600 }}>{f.count}</span>
            </div>
            <div style={{ width: 90, textAlign: 'right', fontSize: 11, color: '#6b7280' }}>
              {!f.terminal && f.diasMedio > 0 ? `~${f.diasMedio.toFixed(0)}d parado` : ''}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>4. Resultado por turma</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Receita e margem realizadas (ou previstas quando ainda não fechou).</p>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
              {['Turma', 'Matrículas', 'Receita', 'Margem'].map((h, i) => (
                <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resultadoTurmas.map(r => (
              <tr key={r.t.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#fff' }}>{r.t.produtos?.nome} — {r.t.cidades?.nome} <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{r.t.codigo}</span></td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#d1d1d1' }}>{r.mats}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#34d399' }}>{fmt(r.receita)}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: r.margem >= 0 ? '#34d399' : '#f87171' }}>{fmt(r.margem)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}