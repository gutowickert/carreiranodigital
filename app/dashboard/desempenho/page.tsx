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
// normaliza texto pra casar utm/codigo com nome de campanha do Meta (sem acento/maiuscula/pontuacao)
function norm(s?: string | null) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }

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
  const [vendedores, setVendedores] = useState<any[]>([])
  const [spend, setSpend] = useState<{ ok: boolean; total: number; campaigns: { name: string; spend: number }[]; error?: string }>({ ok: false, total: 0, campaigns: [] })

  useEffect(() => { carregar() }, [])
  useEffect(() => { carregarGasto() }, [de, ate])

  async function carregar() {
    setCarregando(true)
    const [t, m, l, mk, f, v] = await Promise.all([
      supabase.from('turmas').select('id, codigo, preco_venda, meta_matriculas, data_inicio, status, produto_id, cidade_id, produtos(nome), cidades(nome)'),
      supabase.from('matriculas').select('id, turma_id, valor_pago, data_compra, lead_id'),
      supabase.from('leads').select('id, turma_id, etapa, vendedor_id, utm_source, utm_campaign, fbclid, valor_venda, criado_em, atualizado_em'),
      supabase.from('lancamentos_empresa').select('valor, data_vencimento, data_pagamento, descricao').eq('categoria', 'marketing'),
      supabase.from('financeiro_turma').select('turma_id, receita_realizada, receita_prevista, margem_prevista, margem_realizada'),
      supabase.from('usuarios_perfil').select('id, nome').in('setor', ['comercial', 'comercial_externo']).eq('ativo', true).order('nome'),
    ])
    setTurmas(t.data || []); setMatriculas(m.data || []); setLeads(l.data || [])
    setMarketing(mk.data || []); setFinanceiros(f.data || []); setVendedores(v.data || [])
    setCarregando(false)
  }

  async function carregarGasto() {
    try {
      const res = await fetch(`/api/meta/spend?since=${de}&until=${ate}`)
      setSpend(await res.json())
    } catch { setSpend({ ok: false, total: 0, campaigns: [], error: 'falha ao buscar gasto' }) }
  }

  const inPeriodo = (d?: string | null) => { if (!d) return false; const day = d.substring(0, 10); return day >= de && day <= ate }

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

  const finMap: Record<string, any> = {}; financeiros.forEach(f => { finMap[f.turma_id] = f })
  const matsPorTurma: Record<string, number> = {}; matriculas.forEach(m => { matsPorTurma[m.turma_id] = (matsPorTurma[m.turma_id] || 0) + 1 })
  const leadsPorTurma: Record<string, number> = {}; leads.forEach(l => { if (l.turma_id) leadsPorTurma[l.turma_id] = (leadsPorTurma[l.turma_id] || 0) + 1 })

  // grupo = produto + cidade (turmas que dividem a mesma campanha/página, ex: POA tarde+noite)
  const grupoKey = (t: any) => `${t.produto_id || ''}|${t.cidade_id || ''}`
  const gastoPorGrupo: Record<string, number> = {}
  if (spend.ok) {
    spend.campaigns.forEach(c => {
      const nomeUpper = (c.name || '').toUpperCase()
      const turma = turmas.find(t => t.codigo && nomeUpper.includes(t.codigo.toUpperCase()))
      if (turma) gastoPorGrupo[grupoKey(turma)] = (gastoPorGrupo[grupoKey(turma)] || 0) + (c.spend || 0)
    })
  }
  // distribui o gasto do grupo entre suas turmas, proporcional aos leads (igual se ainda nao ha lead)
  const gastoPorTurma: Record<string, number> = {}
  Object.entries(gastoPorGrupo).forEach(([k, gastoGrupo]) => {
    const turmasGrupo = turmas.filter(t => grupoKey(t) === k)
    const totalLeadsGrupo = turmasGrupo.reduce((s, t) => s + (leadsPorTurma[t.id] || 0), 0)
    turmasGrupo.forEach(t => {
      gastoPorTurma[t.id] = totalLeadsGrupo > 0
        ? gastoGrupo * ((leadsPorTurma[t.id] || 0) / totalLeadsGrupo)
        : gastoGrupo / turmasGrupo.length
    })
  })

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

  // Resolve a campanha do Meta de cada lead por chaves que REALMENTE batem:
  // 1) utm_campaign casado (normalizado) com o nome da campanha do Meta
  // 2) codigo da turma presente no nome da campanha
  // 3) fbclid/utm presente mas sem campanha casada -> pago nao identificado
  // 4) nada -> organico/direto
  const codigoPorTurma: Record<string, string> = {}
  turmas.forEach(t => { if (t.codigo) codigoPorTurma[t.id] = t.codigo })
  const SEM_CAMPANHA = '⚠ Pago (campanha não identificada)'
  const ORGANICO = 'Orgânico / direto'

  function resolverCampanha(l: any): { chave: string; identificado: boolean; pago: boolean } {
    const camps = spend.campaigns || []
    const u = norm(l.utm_campaign)
    if (u) {
      const m = camps.find(c => { const n = norm(c.name); return !!n && (n.includes(u) || u.includes(n)) })
      if (m) return { chave: m.name, identificado: true, pago: true }
    }
    const cod = norm(codigoPorTurma[l.turma_id])
    if (cod) {
      const m = camps.find(c => norm(c.name).includes(cod))
      if (m) return { chave: m.name, identificado: true, pago: true }
    }
    if (l.fbclid || l.utm_source || l.utm_campaign) return { chave: SEM_CAMPANHA, identificado: false, pago: true }
    return { chave: ORGANICO, identificado: false, pago: false }
  }

  const campMap: Record<string, { leads: number; ganhos: number; receita: number }> = {}
  let leadsIdentificados = 0
  leadsPeriodo.forEach(l => {
    const r = resolverCampanha(l)
    if (r.identificado) leadsIdentificados++
    if (!campMap[r.chave]) campMap[r.chave] = { leads: 0, ganhos: 0, receita: 0 }
    campMap[r.chave].leads++
    if (l.etapa === 'ganho') { campMap[r.chave].ganhos++; campMap[r.chave].receita += (l.valor_venda || 0) }
  })
  const coberturaOrigem = leadsPeriodo.length ? leadsIdentificados / leadsPeriodo.length : 0
  const gastoCampMap: Record<string, number> = {}
  if (spend.ok) spend.campaigns.forEach(c => { gastoCampMap[c.name] = (gastoCampMap[c.name] || 0) + (c.spend || 0); if (!campMap[c.name]) campMap[c.name] = { leads: 0, ganhos: 0, receita: 0 } })
  const campanhas = Object.entries(campMap)
    .map(([nome, v]) => {
      const g = gastoCampMap[nome] || 0
      return { nome, ...v, conv: v.leads ? v.ganhos / v.leads : 0, gasto: g, cpv: v.ganhos ? g / v.ganhos : 0, roas: g ? v.receita / g : 0 }
    })
    .sort((a, b) => (b.gasto - a.gasto) || (b.leads - a.leads))

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

  // Leads por vendedor x etapa
  const etapasColunas = funil.map(f => f.etapa)
  const contaPorEtapa = (lista: any[]) => {
    const m: Record<string, number> = {}
    lista.forEach(l => { const e = l.etapa || 'sem_etapa'; m[e] = (m[e] || 0) + 1 })
    return m
  }
  const linhasVendedor = vendedores
    .map(v => { const meus = leads.filter(l => l.vendedor_id === v.id); return { nome: v.nome, total: meus.length, porEtapa: contaPorEtapa(meus) } })
    .filter(r => r.total > 0)
  const semVend = leads.filter(l => !l.vendedor_id)
  if (semVend.length > 0) linhasVendedor.push({ nome: 'Sem vendedor', total: semVend.length, porEtapa: contaPorEtapa(semVend) })

  const resultadoTurmas = turmas
    .map(t => {
      const gasto = gastoPorTurma[t.id] || 0
      const mats = matsPorTurma[t.id] || 0
      const receita = finMap[t.id]?.receita_realizada ?? 0
      return {
        t, receita, mats, gasto,
        margem: finMap[t.id]?.margem_realizada ?? finMap[t.id]?.margem_prevista ?? 0,
        cpvReal: mats ? gasto / mats : 0,
        roasReal: gasto ? receita / gasto : 0,
      }
    })
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
        <KPI label="Origem identificada" valor={pct(coberturaOrigem)} cor={coberturaOrigem >= 0.7 ? '#34d399' : coberturaOrigem >= 0.4 ? '#fbbf24' : '#f87171'} sub={`${leadsIdentificados}/${leadsPeriodo.length} leads ligados a uma campanha`} />
      </div>
      <p style={{ fontSize: 11, color: spend.error ? '#f87171' : '#6b7280', marginBottom: 24 }}>
        {usandoReal
          ? 'ROAS/CPL/CPV calculados com o gasto REAL do Meta no período.'
          : spend.error
            ? `Sem gasto real do Meta (${spend.error}). Usando tráfego provisionado.`
            : 'Usando tráfego provisionado (sem gasto real do Meta no período, ou ainda carregando).'}
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>1. Turmas: saúde e risco</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Do mais crítico pro mais tranquilo. 🔴 puxar venda / decidir cancelar · 🟡 acompanhar · 🟢 ok</p>
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

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>2. Campanhas / origens</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>No período. Gasto real do Meta quando a campanha tem o código no nome. "⚠ revisar" = gastou e não vendeu, ou muito lead com pouca conversão.</p>
      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 32 }}>
        {campanhas.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: '#6b7280' }}>Sem dados no período.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                {['Origem / campanha', 'Leads', 'Vendas', 'Conversão', 'Gasto', 'Receita', 'ROAS', 'Leitura'].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campanhas.map(c => {
                const escala = c.leads >= 5 && c.conv >= 0.15
                const revisar = (c.gasto > 0 && c.ganhos === 0) || (c.leads >= 10 && c.conv < 0.08)
                return (
                  <tr key={c.nome} style={{ borderBottom: '1px solid #3a3a3c' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#fff' }}>{c.nome}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#d1d1d1' }}>{c.leads}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#d1d1d1' }}>{c.ganhos}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: c.conv >= 0.15 ? '#34d399' : c.conv < 0.08 ? '#f87171' : '#d1d1d1' }}>{pct(c.conv)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#f87171' }}>{c.gasto ? fmt(c.gasto) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#34d399' }}>{fmt(c.receita)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: c.roas >= 1 ? '#34d399' : c.gasto ? '#f87171' : '#6b7280' }}>{c.gasto ? c.roas.toFixed(2) + 'x' : '—'}</td>
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

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Leads por vendedor</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Quantos leads cada vendedor tem em mãos, por etapa.</p>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Vendedor</th>
              <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>Total</th>
              {etapasColunas.map(e => (
                <th key={e} style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap' }}>{labelEtapa(e)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhasVendedor.length === 0 ? (
              <tr><td colSpan={2 + etapasColunas.length} style={{ padding: 20, fontSize: 13, color: '#6b7280' }}>Nenhum lead atribuído.</td></tr>
            ) : linhasVendedor.map(r => (
              <tr key={r.nome} style={{ borderBottom: '1px solid #3a3a3c' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, color: r.nome === 'Sem vendedor' ? '#fbbf24' : '#fff' }}>{r.nome}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#fff', fontWeight: 700 }}>{r.total}</td>
                {etapasColunas.map(e => (
                  <td key={e} style={{ padding: '12px 12px', textAlign: 'right', fontSize: 13, color: r.porEtapa[e] ? '#d1d1d1' : '#3f3f46' }}>{r.porEtapa[e] || 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>4. Resultado por turma</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Receita, margem e — quando há campanha com o código no nome — gasto, CPV e ROAS reais por turma.</p>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
              {['Turma', 'Matrículas', 'Receita', 'Gasto real', 'CPV real', 'ROAS real', 'Margem'].map((h, i) => (
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
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#f87171' }}>{r.gasto ? fmt(r.gasto) : '—'}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#d1d1d1' }}>{r.gasto ? fmt(r.cpvReal) : '—'}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: r.roasReal >= 1 ? '#34d399' : '#f87171' }}>{r.gasto ? r.roasReal.toFixed(2) + 'x' : '—'}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: r.margem >= 0 ? '#34d399' : '#f87171' }}>{fmt(r.margem)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}