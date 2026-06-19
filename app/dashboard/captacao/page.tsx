'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '14px' } as React.CSSProperties
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#fff', outline: 'none' } as React.CSSProperties

function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmt0(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) }
function pct(v: number) { return (isFinite(v) ? v * 100 : 0).toFixed(0) + '%' }
function hojeStr() { return new Date().toISOString().split('T')[0] }
function addDays(s: string, d: number) { const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0] }
function diasEntre(a: string, b: string) { return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000) }

// Canais de origem do lead.
// anúncio = tem UTM (casou com um clique de anúncio) · disparo = origem 'disparo' · resto = orgânico/direto
const CANAL = {
  anuncio: { nome: 'Anúncio', cor: '#a78bfa' },
  disparo: { nome: 'Disparo', cor: '#38bdf8' },
  organico: { nome: 'Orgânico', cor: '#6b7280' },
}
function canalDoLead(l: any): 'anuncio' | 'disparo' | 'organico' {
  if (l.utm_campaign || l.utm_content) return 'anuncio'
  if ((l.origem || '').toLowerCase() === 'disparo') return 'disparo'
  return 'organico'
}

type Spend = { ok: boolean; total: number; campaigns: { name: string; spend: number }[]; ads: any[]; error?: string }

export default function Captacao() {
  const hoje = hojeStr()
  const [de, setDe] = useState(addDays(hoje, -7))
  const [ate, setAte] = useState(hoje)
  const [carregando, setCarregando] = useState(true)
  const [leads, setLeads] = useState<any[]>([])
  const [turmas, setTurmas] = useState<any[]>([])
  const [matriculas, setMatriculas] = useState<any[]>([])
  const [spend, setSpend] = useState<Spend>({ ok: false, total: 0, campaigns: [], ads: [] })
  // CPL alvo como % do ticket da turma (auto-escala FC caro x ANL barato). Ajustável.
  const [alvoPct, setAlvoPct] = useState(4)

  async function carregar() {
    setCarregando(true)
    const [l, t, m] = await Promise.all([
      supabase.from('leads').select('id, turma_id, etapa, origem, utm_campaign, utm_content, valor_venda, criado_em'),
      supabase.from('turmas').select('id, codigo, preco_venda, meta_matriculas, data_inicio, status, produto_id, cidade_id, produtos(nome), cidades(nome)'),
      supabase.from('matriculas').select('id, turma_id, data_compra'),
    ])
    setLeads(l.data || []); setTurmas(t.data || []); setMatriculas(m.data || [])
    setCarregando(false)
  }
  async function carregarGasto() {
    try {
      const res = await fetch(`/api/meta/spend?since=${de}&until=${ate}`)
      setSpend(await res.json())
    } catch { setSpend({ ok: false, total: 0, campaigns: [], ads: [], error: 'falha ao buscar gasto' }) }
  }

  useEffect(() => { carregar() }, [])
  useEffect(() => { carregarGasto() }, [de, ate])

  const inPeriodo = (d?: string | null) => { if (!d) return false; const day = d.substring(0, 10); return day >= de && day <= ate }
  const leadsPeriodo = leads.filter(l => inPeriodo(l.criado_em))
  const matsPeriodo = matriculas.filter(m => inPeriodo(m.data_compra))

  // ---- gasto por turma: casa pelo código da turma no nome da campanha, rateado por leads quando dividem campanha ----
  const leadsPorTurma: Record<string, number> = {}
  leadsPeriodo.forEach(l => { if (l.turma_id) leadsPorTurma[l.turma_id] = (leadsPorTurma[l.turma_id] || 0) + 1 })
  const grupoKey = (t: any) => `${t.produto_id || ''}|${t.cidade_id || ''}`
  const gastoPorGrupo: Record<string, number> = {}
  ;(spend.campaigns || []).forEach(c => {
    const nomeUpper = (c.name || '').toUpperCase()
    const turma = turmas.find(t => t.codigo && nomeUpper.includes(t.codigo.toUpperCase()))
    if (turma) gastoPorGrupo[grupoKey(turma)] = (gastoPorGrupo[grupoKey(turma)] || 0) + (c.spend || 0)
  })
  const gastoPorTurma: Record<string, number> = {}
  Object.entries(gastoPorGrupo).forEach(([k, gastoGrupo]) => {
    const turmasGrupo = turmas.filter(t => grupoKey(t) === k)
    const totalLeadsGrupo = turmasGrupo.reduce((s, t) => s + (leadsPorTurma[t.id] || 0), 0)
    turmasGrupo.forEach(t => {
      gastoPorTurma[t.id] = totalLeadsGrupo > 0 ? gastoGrupo * ((leadsPorTurma[t.id] || 0) / totalLeadsGrupo) : gastoGrupo / turmasGrupo.length
    })
  })

  // ---- monta um card por turma ----
  const matsPorTurma: Record<string, number> = {}
  matriculas.forEach(m => { matsPorTurma[m.turma_id] = (matsPorTurma[m.turma_id] || 0) + 1 })

  const cards = turmas
    .filter(t => !['realizada', 'cancelada'].includes(t.status))
    .map(t => {
      const meus = leadsPeriodo.filter(l => l.turma_id === t.id)
      const total = meus.length
      const canais = { anuncio: 0, disparo: 0, organico: 0 }
      meus.forEach(l => { canais[canalDoLead(l)]++ })
      const gasto = gastoPorTurma[t.id] || 0
      const cpl = total ? gasto / total : 0
      const mats = matsPorTurma[t.id] || 0
      const meta = t.meta_matriculas || 0
      const dias = t.data_inicio ? diasEntre(hoje, t.data_inicio) : 999
      const conv = total ? (meus.filter(l => l.etapa === 'ganho').length) / total : 0
      const alvoCpl = (t.preco_venda || 0) * (alvoPct / 100)
      return { t, total, canais, gasto, cpl, alvoCpl, mats, meta, dias, conv, acao: decidir({ total, gasto, cpl, alvoCpl, mats, meta, dias }) }
    })
    .filter(c => c.total > 0 || c.gasto > 0)
    .sort((a, b) => ordemAcao[a.acao.tipo] - ordemAcao[b.acao.tipo] || b.gasto - a.gasto)

  // ---- KPIs do topo ----
  const totLeads = leadsPeriodo.length
  const totAnuncio = leadsPeriodo.filter(l => canalDoLead(l) === 'anuncio').length
  const totInvest = spend.total || 0
  const cplMedio = totLeads ? totInvest / totLeads : 0

  const Pill = ({ a }: { a: Acao }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: a.cor + '22', border: `1px solid ${a.cor}55`, color: a.cor, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}>
      {a.emoji} {a.label}{a.sub && <span style={{ color: '#9ca3af', fontWeight: 400 }}>· {a.sub}</span>}
    </div>
  )

  if (carregando) return <div style={{ padding: 40, color: '#6b7280' }}>Carregando captação...</div>

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Captação</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Leads por turma, de onde vieram e o que fazer com a verba</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} />
          <span style={{ color: '#6b7280' }}>—</span>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} />
          <button onClick={() => { setDe(addDays(hoje, -7)); setAte(hoje) }} style={{ ...inp, cursor: 'pointer' }}>7d</button>
          <button onClick={() => { setDe(addDays(hoje, -30)); setAte(hoje) }} style={{ ...inp, cursor: 'pointer' }}>30d</button>
        </div>
      </div>

      {!spend.ok && (
        <div style={{ ...card, padding: 14, marginBottom: 16, borderColor: '#7f1d1d', background: '#2a1414' }}>
          <span style={{ fontSize: 13, color: '#f87171' }}>Sem gasto real do Meta no período{spend.error ? `: ${spend.error}` : ''}. CPL e a ação por verba ficam parciais até a API responder.</span>
        </div>
      )}

      {/* KPIs topo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 10 }}>
        <KpiCard label="Leads no período" valor={String(totLeads)} />
        <KpiCard label="Vindos de anúncio" valor={pct(totLeads ? totAnuncio / totLeads : 0)} sub={`${totAnuncio} de ${totLeads}`} cor={CANAL.anuncio.cor} />
        <KpiCard label="Investido" valor={fmt0(totInvest)} cor="#f87171" />
        <KpiCard label="CPL médio" valor={fmt(cplMedio)} sub="investido ÷ leads" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 24px', fontSize: 12, color: '#6b7280', flexWrap: 'wrap' }}>
        <span>CPL alvo = </span>
        <input type="number" value={alvoPct} min={1} max={20} onChange={e => setAlvoPct(Number(e.target.value) || 0)} style={{ ...inp, width: 60, padding: '4px 8px' }} />
        <span>% do ticket da turma · acima disso o CPL fica vermelho e a ação vira “trocar criativo”.</span>
      </div>

      {/* Cards por turma */}
      {cards.length === 0 ? (
        <div style={{ ...card, padding: 28, color: '#6b7280', fontSize: 13 }}>Sem leads ou gasto no período.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
          {cards.map(c => {
            const barras = (['anuncio', 'disparo', 'organico'] as const).filter(k => c.canais[k] > 0)
            return (
              <div key={c.t.id} style={{ ...card, padding: 18, borderTop: `3px solid ${c.acao.cor}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* header */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{c.t.produtos?.nome} <span style={{ color: '#9ca3af', fontWeight: 500 }}>— {c.t.cidades?.nome}</span></div>
                  <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace', marginTop: 3 }}>{c.t.codigo}</div>
                </div>

                {/* leads + barra de canais */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{c.total}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>leads</span>
                  </div>
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10, background: '#1c1c1e' }}>
                    {barras.map(k => <div key={k} style={{ width: `${(c.canais[k] / c.total) * 100}%`, background: CANAL[k].cor }} />)}
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                    {(['anuncio', 'disparo', 'organico'] as const).map(k => (
                      <span key={k} style={{ fontSize: 11, color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: CANAL[k].cor, display: 'inline-block' }} />
                        {CANAL[k].nome} <b style={{ color: '#fff' }}>{c.canais[k]}</b>
                      </span>
                    ))}
                  </div>
                </div>

                {/* mini-stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, borderTop: '1px solid #3a3a3c', paddingTop: 12 }}>
                  <Mini label="Investido" valor={c.gasto ? fmt0(c.gasto) : '—'} cor="#f87171" />
                  <Mini label="CPL" valor={c.cpl ? fmt0(c.cpl) : '—'} cor={c.cpl && c.alvoCpl && c.cpl > c.alvoCpl ? '#f87171' : '#34d399'} />
                  <Mini label="Matríc." valor={`${c.mats}/${c.meta}`} />
                  <Mini label="Início" valor={c.dias > 0 ? `${c.dias}d` : c.dias === 0 ? 'hoje' : `−${-c.dias}d`} />
                </div>

                <div><Pill a={c.acao} /></div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- decisão de verba por turma ----------
type Acao = { tipo: keyof typeof ordemAcao; label: string; sub?: string; emoji: string; cor: string }
const ordemAcao = { cortar: 0, trocar: 1, subir: 2, segurar: 3, organico: 4, semdados: 5 }
function decidir({ total, gasto, cpl, alvoCpl, mats, meta, dias }: { total: number; gasto: number; cpl: number; alvoCpl: number; mats: number; meta: number; dias: number }): Acao {
  if (gasto <= 0) return total > 0 ? { tipo: 'organico', label: 'orgânico', sub: 'sem verba', emoji: '🌱', cor: '#34d399' } : { tipo: 'semdados', label: 'sem dados', emoji: '·', cor: '#6b7280' }
  if (mats === 0 && total >= 8) return { tipo: 'cortar', label: 'cortar / revisar', sub: 'gastou, 0 matrícula', emoji: '⚫', cor: '#9ca3af' }
  const atras = meta > 0 && mats < meta * 0.7 && dias <= 12
  const caro = alvoCpl > 0 && cpl > alvoCpl
  if (atras && caro) return { tipo: 'trocar', label: 'trocar criativo', sub: 'CPL alto', emoji: '🔴', cor: '#f87171' }
  if (atras && !caro) return { tipo: 'subir', label: 'subir verba', sub: 'CPL ok, falta volume', emoji: '🟢', cor: '#34d399' }
  return { tipo: 'segurar', label: 'segurar', sub: 'no ritmo', emoji: '🟡', cor: '#fbbf24' }
}

// ---------- componentes auxiliares ----------
function KpiCard({ label, valor, cor, sub }: { label: string; valor: string; cor?: string; sub?: string }) {
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || '#fff', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}
function Mini({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: cor || '#d1d1d1', marginTop: 3, whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )
}
