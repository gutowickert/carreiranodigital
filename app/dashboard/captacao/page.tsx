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

const CORES = { verde: '#34d399', amarelo: '#fbbf24', vermelho: '#f87171' }
const ETAPA_LABEL: Record<string, string> = {
  aguardando_atendimento: 'Aguardando atendimento', em_atendimento: 'Em atendimento',
  qualificado: 'Qualificado', proposta: 'Proposta enviada', negociacao: 'Negociação',
  matricula: 'Matrícula', ganho: 'Ganho', perda: 'Perda', perdido: 'Perdido',
}
const ETAPAS_TERMINAIS = ['ganho', 'perda', 'perdido', 'cancelado']
function labelEtapa(e: string) { return ETAPA_LABEL[e] || (e ? e.replace(/_/g, ' ') : '—') }

type Spend = { ok: boolean; total: number; campaigns: { name: string; spend: number }[]; ads: any[]; error?: string }

export default function Captacao() {
  const hoje = hojeStr()
  const [de, setDe] = useState(hoje)
  const [ate, setAte] = useState(hoje)
  const [preset, setPreset] = useState('Hoje')
  const [carregando, setCarregando] = useState(true)
  const [leads, setLeads] = useState<any[]>([])
  const [turmas, setTurmas] = useState<any[]>([])
  const [matriculas, setMatriculas] = useState<any[]>([])
  const [financeiros, setFinanceiros] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [spend, setSpend] = useState<Spend>({ ok: false, total: 0, campaigns: [], ads: [] })
  // CPL alvo como % do ticket da turma (auto-escala FC caro x ANL barato). Ajustável.
  const [alvoPct, setAlvoPct] = useState(4)

  async function carregar() {
    setCarregando(true)
    const [l, t, m, f, v] = await Promise.all([
      supabase.from('leads').select('id, turma_id, etapa, origem, vendedor_id, utm_campaign, utm_content, criado_em, atualizado_em'),
      supabase.from('turmas').select('id, codigo, preco_venda, meta_matriculas, data_inicio, status, produto_id, cidade_id, produtos(nome), cidades(nome)'),
      supabase.from('matriculas').select('id, turma_id, valor_pago, data_compra'),
      supabase.from('financeiro_turma').select('turma_id, margem_prevista'),
      supabase.from('usuarios_perfil').select('id, nome').in('setor', ['comercial', 'comercial_externo']).eq('ativo', true).order('nome'),
    ])
    setLeads(l.data || []); setTurmas(t.data || []); setMatriculas(m.data || [])
    setFinanceiros(f.data || []); setVendedores(v.data || [])
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

  // ---- bases por turma (matriculas = fonte única de venda; conversão usa leads de todo o histórico) ----
  const matsPorTurma: Record<string, number> = {}
  matriculas.forEach(m => { matsPorTurma[m.turma_id] = (matsPorTurma[m.turma_id] || 0) + 1 })
  const leadsTurmaTotal: Record<string, number> = {}
  leads.forEach(l => { if (l.turma_id) leadsTurmaTotal[l.turma_id] = (leadsTurmaTotal[l.turma_id] || 0) + 1 })
  const finMap: Record<string, any> = {}; financeiros.forEach(f => { finMap[f.turma_id] = f })

  // ---- um card por turma (captação + saúde) ----
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
      const conv = leadsTurmaTotal[t.id] ? mats / leadsTurmaTotal[t.id] : 0
      const margem = finMap[t.id]?.margem_prevista ?? 0
      const alvoCpl = (t.preco_venda || 0) * (alvoPct / 100)
      const saude = avaliarSaude({ mats, meta, dias, margem })
      const acao = decidir({ total, gasto, cpl, alvoCpl, mats, meta, dias })
      return { t, total, canais, gasto, cpl, alvoCpl, mats, meta, dias, conv, margem, saude, acao }
    })
    .filter(c => c.total > 0 || c.gasto > 0 || c.mats > 0)
    .sort((a, b) => ordemSaude[a.saude.nivel] - ordemSaude[b.saude.nivel] || ordemAcao[a.acao.tipo] - ordemAcao[b.acao.tipo] || b.gasto - a.gasto)

  // ---- KPIs do topo ----
  const totLeads = leadsPeriodo.length
  const totAnuncio = leadsPeriodo.filter(l => canalDoLead(l) === 'anuncio').length
  const totVendas = matsPeriodo.length
  const totReceita = matsPeriodo.reduce((s, m) => s + (m.valor_pago || 0), 0)
  const totInvest = spend.total || 0
  const cplMedio = totLeads ? totInvest / totLeads : 0

  // ---- funil: onde os leads travam (estado atual, todo o pipeline) ----
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

  // ---- leads por vendedor x etapa ----
  const etapasColunas = funil.map(f => f.etapa)
  const contaPorEtapa = (lista: any[]) => { const m: Record<string, number> = {}; lista.forEach(l => { const e = l.etapa || 'sem_etapa'; m[e] = (m[e] || 0) + 1 }); return m }
  const linhasVendedor = vendedores
    .map(v => { const meus = leads.filter(l => l.vendedor_id === v.id); return { nome: v.nome, total: meus.length, porEtapa: contaPorEtapa(meus) } })
    .filter(r => r.total > 0)
  const semVend = leads.filter(l => !l.vendedor_id)
  if (semVend.length > 0) linhasVendedor.push({ nome: 'Sem vendedor', total: semVend.length, porEtapa: contaPorEtapa(semVend) })

  // Atalhos de período (botão ativo destacado). 'de' inclui o dia; 'ate' é sempre hoje.
  const PRESETS: [string, string][] = [
    ['Hoje', hoje],
    ['Esse mês', hoje.slice(0, 7) + '-01'],
    ['Últimos 3 dias', addDays(hoje, -2)],
    ['Últimos 7 dias', addDays(hoje, -6)],
    ['Últimos 30 dias', addDays(hoje, -29)],
  ]

  if (carregando) return <div style={{ padding: 40, color: '#6b7280' }}>Carregando captação...</div>

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Captação</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Por turma: leads, origem, custo e saúde · onde o lead trava · carga por vendedor</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {PRESETS.map(([label, dDe]) => (
            <button key={label} onClick={() => { setDe(dDe); setAte(hoje); setPreset(label) }}
              style={{ ...inp, cursor: 'pointer', ...(preset === label ? { background: '#7c3aed', borderColor: '#7c3aed', color: '#fff' } : {}) }}>{label}</button>
          ))}
          <input type="date" value={de} onChange={e => { setDe(e.target.value); setPreset('') }} style={inp} />
          <span style={{ color: '#6b7280' }}>—</span>
          <input type="date" value={ate} onChange={e => { setAte(e.target.value); setPreset('') }} style={inp} />
        </div>
      </div>

      {!spend.ok && (
        <div style={{ ...card, padding: 14, marginBottom: 16, borderColor: '#7f1d1d', background: '#2a1414' }}>
          <span style={{ fontSize: 13, color: '#f87171' }}>Sem gasto real do Meta no período{spend.error ? `: ${spend.error}` : ''}. CPL e a ação por verba ficam parciais até a API responder.</span>
        </div>
      )}

      {/* KPIs topo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 10 }}>
        <KpiCard label="Leads no período" valor={String(totLeads)} />
        <KpiCard label="Vindos de anúncio" valor={pct(totLeads ? totAnuncio / totLeads : 0)} sub={`${totAnuncio} de ${totLeads}`} cor={CANAL.anuncio.cor} />
        <KpiCard label="Matrículas" valor={String(totVendas)} sub={`Conversão ${pct(totLeads ? totVendas / totLeads : 0)}`} cor="#34d399" />
        <KpiCard label="Receita" valor={fmt0(totReceita)} cor="#34d399" />
        <KpiCard label="Investido" valor={fmt0(totInvest)} cor="#f87171" />
        <KpiCard label="CPL médio" valor={fmt(cplMedio)} sub="investido ÷ leads" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 24px', fontSize: 12, color: '#6b7280', flexWrap: 'wrap' }}>
        <span>CPL alvo = </span>
        <input type="number" value={alvoPct} min={1} max={20} onChange={e => setAlvoPct(Number(e.target.value) || 0)} style={{ ...inp, width: 60, padding: '4px 8px' }} />
        <span>% do ticket da turma · acima disso o CPL fica vermelho e a ação vira “trocar criativo”.</span>
      </div>

      {/* 1. Cards por turma */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>1. Turmas: captação e saúde</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 14px' }}>Borda colorida = risco de fechar a turma (🔴/🟡/🟢). A pílula = o que fazer com a verba.</p>
      {cards.length === 0 ? (
        <div style={{ ...card, padding: 28, color: '#6b7280', fontSize: 13, marginBottom: 32 }}>Sem leads, gasto ou matrículas no período.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 36 }}>
          {cards.map(c => {
            const barras = (['anuncio', 'disparo', 'organico'] as const).filter(k => c.canais[k] > 0)
            return (
              <div key={c.t.id} style={{ ...card, padding: 18, borderTop: `3px solid ${CORES[c.saude.nivel]}`, display: 'flex', flexDirection: 'column', gap: 13 }}>
                {/* header + situação */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{c.t.produtos?.nome} <span style={{ color: '#9ca3af', fontWeight: 500 }}>— {c.t.cidades?.nome}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{c.t.codigo}</span>
                    <span style={{ fontSize: 11, color: CORES[c.saude.nivel], fontWeight: 600, textAlign: 'right' }}>{c.saude.motivo}</span>
                  </div>
                </div>

                {/* leads + barra de canais */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{c.total}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>leads no período</span>
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

                {/* mini-stats: aquisição + saúde */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, borderTop: '1px solid #3a3a3c', paddingTop: 12 }}>
                  <Mini label="Investido" valor={c.gasto ? fmt0(c.gasto) : '—'} cor="#f87171" />
                  <Mini label="CPL" valor={c.cpl ? fmt0(c.cpl) : '—'} cor={c.cpl && c.alvoCpl && c.cpl > c.alvoCpl ? '#f87171' : '#34d399'} />
                  <Mini label="Conversão" valor={pct(c.conv)} />
                  <Mini label="Matríc/meta" valor={`${c.mats}/${c.meta}`} />
                  <Mini label="Margem prev." valor={c.margem ? fmt0(c.margem) : '—'} cor={c.margem >= 0 ? '#34d399' : '#f87171'} />
                  <Mini label="Início" valor={c.dias > 0 ? `${c.dias}d` : c.dias === 0 ? 'hoje' : `−${-c.dias}d`} />
                </div>

                <div><Pill a={c.acao} /></div>
              </div>
            )
          })}
        </div>
      )}

      {/* 2. Funil */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>2. Funil: onde os leads travam</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
        {gargalo
          ? <>Maior gargalo: <b style={{ color: '#fbbf24' }}>{labelEtapa(gargalo.etapa)}</b> — {gargalo.count} leads parados há ~{gargalo.diasMedio.toFixed(0)} dias em média. Vale cobrar atendimento.</>
          : 'Sem gargalo evidente.'}
      </p>
      <div style={{ ...card, padding: 16, marginBottom: 36 }}>
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

      {/* 3. Vendedores */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>3. Leads por vendedor</h2>
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
    </div>
  )
}

// ---------- saúde da turma (vai fechar?) ----------
const ordemSaude = { vermelho: 0, amarelo: 1, verde: 2 }
function avaliarSaude({ mats, meta, dias, margem }: { mats: number; meta: number; dias: number; margem: number }): { nivel: keyof typeof CORES; motivo: string } {
  const faltam = Math.max(0, meta - mats)
  let nivel: keyof typeof CORES = 'amarelo'
  let motivo = ''
  if (meta > 0 && mats >= meta) { nivel = 'verde'; motivo = 'Meta atingida' }
  else if (dias <= 0) { nivel = 'vermelho'; motivo = `Já começou ${mats}/${meta}` }
  else if (dias <= 7 && mats < meta * 0.7) { nivel = 'vermelho'; motivo = `Faltam ${faltam} em ${dias}d` }
  else { nivel = 'amarelo'; motivo = `Faltam ${faltam} em ${dias}d` }
  if (margem < 0) { nivel = 'vermelho'; motivo += ' · margem neg.' }
  return { nivel, motivo }
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
function Pill({ a }: { a: Acao }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: a.cor + '22', border: `1px solid ${a.cor}55`, color: a.cor, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}>
      {a.emoji} {a.label}{a.sub && <span style={{ color: '#9ca3af', fontWeight: 400 }}>· {a.sub}</span>}
    </div>
  )
}
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
