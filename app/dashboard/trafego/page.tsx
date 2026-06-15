'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#fff', outline: 'none' } as React.CSSProperties

function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function pct(v: number) { return (isFinite(v) ? v * 100 : 0).toFixed(0) + '%' }
function hojeStr() { return new Date().toISOString().split('T')[0] }
function addDays(s: string, d: number) { const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0] }
// normaliza texto pra casar utm (do lead) com nome de campanha/anuncio (do Meta)
function norm(s?: string | null) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }

type AdRow = { campaign: string; adset: string; ad: string; spend: number; impressions: number; clicks: number }
type Spend = { ok: boolean; total: number; campaigns: { name: string; spend: number }[]; ads: AdRow[]; error?: string }

type Metricas = { spend: number; leads: number; vendas: number; receita: number; impressions: number; clicks: number }
function zero(): Metricas { return { spend: 0, leads: 0, vendas: 0, receita: 0, impressions: 0, clicks: 0 } }
function soma(acc: Metricas, r: Metricas) {
  acc.spend += r.spend; acc.leads += r.leads; acc.vendas += r.vendas
  acc.receita += r.receita; acc.impressions += r.impressions; acc.clicks += r.clicks
  return acc
}
function deriv(m: Metricas) {
  return { ...m, conv: m.leads ? m.vendas / m.leads : 0, cpl: m.leads ? m.spend / m.leads : 0, cpv: m.vendas ? m.spend / m.vendas : 0, roas: m.spend ? m.receita / m.spend : 0 }
}
function leitura(m: Metricas): { t: string; c: string } | null {
  if (m.spend <= 0) return m.leads > 0 ? { t: 'orgânico', c: '#6b7280' } : null
  const roas = m.receita / m.spend
  if (m.vendas > 0 && roas >= 1) return { t: '🟢 escalar', c: '#34d399' }
  if (m.vendas > 0) return { t: '🟡 observar', c: '#fbbf24' }
  if (m.leads >= 3) return { t: '🔴 matar', c: '#f87171' }
  return { t: '🟡 observar', c: '#fbbf24' }
}

export default function Trafego() {
  const hoje = hojeStr()
  const [de, setDe] = useState(addDays(hoje, -30))
  const [ate, setAte] = useState(hoje)
  const [carregando, setCarregando] = useState(true)
  const [leads, setLeads] = useState<any[]>([])
  const [turmas, setTurmas] = useState<any[]>([])
  const [spend, setSpend] = useState<Spend>({ ok: false, total: 0, campaigns: [], ads: [] })
  const [abertos, setAbertos] = useState<Set<string>>(new Set())

  useEffect(() => { carregar() }, [])
  useEffect(() => { carregarGasto() }, [de, ate])

  async function carregar() {
    setCarregando(true)
    const [l, t] = await Promise.all([
      supabase.from('leads').select('id, turma_id, etapa, utm_source, utm_campaign, utm_content, fbclid, valor_venda, criado_em'),
      supabase.from('turmas').select('id, codigo, produto_id, cidade_id, produtos(nome), cidades(nome)'),
    ])
    setLeads(l.data || []); setTurmas(t.data || [])
    setCarregando(false)
  }
  async function carregarGasto() {
    try {
      const res = await fetch(`/api/meta/spend?since=${de}&until=${ate}`)
      setSpend(await res.json())
    } catch { setSpend({ ok: false, total: 0, campaigns: [], ads: [], error: 'falha ao buscar gasto' }) }
  }

  function toggle(k: string) {
    setAbertos(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }

  const inPeriodo = (d?: string | null) => { if (!d) return false; const day = d.substring(0, 10); return day >= de && day <= ate }
  const leadsPeriodo = leads.filter(l => inPeriodo(l.criado_em))
  const ganhos = leadsPeriodo.filter(l => l.etapa === 'ganho')

  // ---- KPIs ----
  const investido = spend.total || 0
  const totalLeads = leadsPeriodo.length
  const totalVendas = ganhos.length
  const receita = ganhos.reduce((s, l) => s + (l.valor_venda || 0), 0)
  const roas = investido ? receita / investido : 0
  const cpl = totalLeads ? investido / totalLeads : 0
  const cpv = totalVendas ? investido / totalVendas : 0
  const leadsComAnuncio = leadsPeriodo.filter(l => l.utm_content).length
  const cobertura = totalLeads ? leadsComAnuncio / totalLeads : 0

  // ---- chave do anúncio = campanha + anúncio (normalizados) ----
  const adKey = (camp?: string | null, ad?: string | null) => `${norm(camp)}||${norm(ad)}`

  const spendByKey: Record<string, AdRow> = {}
  ;(spend.ads || []).forEach(a => {
    const k = adKey(a.campaign, a.ad)
    if (!spendByKey[k]) spendByKey[k] = { ...a }
    else { spendByKey[k].spend += a.spend; spendByKey[k].impressions += a.impressions; spendByKey[k].clicks += a.clicks }
  })

  const leadByKey: Record<string, { campaign: string; ad: string } & Metricas> = {}
  leadsPeriodo.forEach(l => {
    if (!l.utm_content) return
    const k = adKey(l.utm_campaign, l.utm_content)
    if (!leadByKey[k]) leadByKey[k] = { campaign: l.utm_campaign || '(sem campanha)', ad: l.utm_content, ...zero() }
    leadByKey[k].leads++
    if (l.etapa === 'ganho') { leadByKey[k].vendas++; leadByKey[k].receita += (l.valor_venda || 0) }
  })

  const allKeys = new Set([...Object.keys(spendByKey), ...Object.keys(leadByKey)])
  type Linha = { key: string; campaign: string; adset: string; ad: string } & Metricas
  const adRows: Linha[] = [...allKeys].map(k => {
    const s = spendByKey[k]; const ld = leadByKey[k]
    return {
      key: k,
      campaign: s ? s.campaign : (ld ? ld.campaign : '(sem campanha)'),
      adset: s ? s.adset : '(sem gasto no período)',
      ad: s ? s.ad : (ld ? ld.ad : '(sem anúncio)'),
      spend: s ? s.spend : 0,
      impressions: s ? s.impressions : 0,
      clicks: s ? s.clicks : 0,
      leads: ld ? ld.leads : 0,
      vendas: ld ? ld.vendas : 0,
      receita: ld ? ld.receita : 0,
    }
  })

  // árvore campanha ▸ conjunto ▸ anúncio
  const tree: Record<string, { campaign: string; adsets: Record<string, { adset: string; ads: Linha[] }> }> = {}
  adRows.forEach(r => {
    if (!tree[r.campaign]) tree[r.campaign] = { campaign: r.campaign, adsets: {} }
    if (!tree[r.campaign].adsets[r.adset]) tree[r.campaign].adsets[r.adset] = { adset: r.adset, ads: [] }
    tree[r.campaign].adsets[r.adset].ads.push(r)
  })
  const campanhas = Object.values(tree).map(c => {
    const ads = Object.values(c.adsets).flatMap(a => a.ads)
    const m = deriv(ads.reduce((acc, r) => soma(acc, r), zero()))
    const adsets = Object.values(c.adsets).map(a => ({
      adset: a.adset,
      m: deriv(a.ads.reduce((acc, r) => soma(acc, r), zero())),
      adsDeriv: a.ads.map(r => ({ ...r, ...deriv(r) })).sort((x, y) => y.spend - x.spend),
    })).sort((x, y) => y.m.spend - x.m.spend)
    return { campaign: c.campaign, m, adsets }
  }).sort((a, b) => b.m.spend - a.m.spend)

  // ---- ranking de criativos ----
  const adsDeriv = adRows.map(r => ({ ...r, ...deriv(r) }))
  const melhores = adsDeriv.filter(a => a.spend > 0 && a.vendas > 0).sort((a, b) => b.roas - a.roas).slice(0, 6)
  const queimando = adsDeriv.filter(a => a.spend > 0 && a.vendas === 0).sort((a, b) => b.spend - a.spend).slice(0, 6)
  const qualidade = adsDeriv.filter(a => a.leads >= 1).sort((a, b) => b.leads - a.leads).slice(0, 15)

  // ---- ROI por turma ----
  const leadsPorTurma: Record<string, number> = {}
  const vendasPorTurma: Record<string, number> = {}
  const receitaPorTurma: Record<string, number> = {}
  leadsPeriodo.forEach(l => {
    if (!l.turma_id) return
    leadsPorTurma[l.turma_id] = (leadsPorTurma[l.turma_id] || 0) + 1
    if (l.etapa === 'ganho') {
      vendasPorTurma[l.turma_id] = (vendasPorTurma[l.turma_id] || 0) + 1
      receitaPorTurma[l.turma_id] = (receitaPorTurma[l.turma_id] || 0) + (l.valor_venda || 0)
    }
  })
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
  const roiTurmas = turmas
    .map(t => {
      const g = gastoPorTurma[t.id] || 0, lds = leadsPorTurma[t.id] || 0, vds = vendasPorTurma[t.id] || 0, rec = receitaPorTurma[t.id] || 0
      return { t, g, lds, vds, rec, cpl: lds ? g / lds : 0, cpv: vds ? g / vds : 0, roas: g ? rec / g : 0 }
    })
    .filter(r => r.g > 0 || r.lds > 0)
    .sort((a, b) => b.g - a.g)

  const KPI = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || '#fff', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
    </div>
  )
  const th = (h: string, i: number) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 14px', fontSize: 11, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
  const tdNum = (v: any, cor?: string) => <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, color: cor || '#d1d1d1', whiteSpace: 'nowrap' }}>{v}</td>

  // monta as linhas do drill-down (sem fragmentos, pra key ficar correta)
  const drillRows: any[] = []
  campanhas.forEach(c => {
    const cKey = 'c:' + c.campaign
    const cAberto = abertos.has(cKey)
    const lc = leitura(c.m)
    drillRows.push(
      <tr key={cKey} onClick={() => toggle(cKey)} style={{ borderBottom: '1px solid #3a3a3c', cursor: 'pointer', background: '#222' }}>
        <td style={{ padding: '10px 14px', fontSize: 13, color: '#fff', fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 14, color: '#6b7280' }}>{cAberto ? '▾' : '▸'}</span> {c.campaign}
        </td>
        {tdNum(c.m.spend ? fmt(c.m.spend) : '—', '#f87171')}
        {tdNum(c.m.leads)}{tdNum(c.m.vendas)}
        {tdNum(pct(c.m.conv), c.m.conv >= 0.15 ? '#34d399' : c.m.conv < 0.08 ? '#f87171' : '#d1d1d1')}
        {tdNum(c.m.leads ? fmt(c.m.cpl) : '—')}{tdNum(c.m.vendas ? fmt(c.m.cpv) : '—')}
        {tdNum(c.m.spend ? c.m.roas.toFixed(2) + 'x' : '—', c.m.roas >= 1 ? '#34d399' : c.m.spend ? '#f87171' : '#6b7280')}
        {tdNum(lc ? lc.t : '—', lc ? lc.c : '#6b7280')}
      </tr>
    )
    if (!cAberto) return
    c.adsets.forEach(a => {
      const aKey = 'a:' + c.campaign + '|' + a.adset
      const aAberto = abertos.has(aKey)
      drillRows.push(
        <tr key={aKey} onClick={() => toggle(aKey)} style={{ borderBottom: '1px solid #3a3a3c', cursor: 'pointer' }}>
          <td style={{ padding: '8px 14px 8px 30px', fontSize: 12, color: '#d1d1d1' }}>
            <span style={{ display: 'inline-block', width: 14, color: '#6b7280' }}>{aAberto ? '▾' : '▸'}</span> {a.adset}
          </td>
          {tdNum(a.m.spend ? fmt(a.m.spend) : '—', '#f87171')}
          {tdNum(a.m.leads)}{tdNum(a.m.vendas)}
          {tdNum(pct(a.m.conv))}
          {tdNum(a.m.leads ? fmt(a.m.cpl) : '—')}{tdNum(a.m.vendas ? fmt(a.m.cpv) : '—')}
          {tdNum(a.m.spend ? a.m.roas.toFixed(2) + 'x' : '—', a.m.roas >= 1 ? '#34d399' : a.m.spend ? '#f87171' : '#6b7280')}
          <td />
        </tr>
      )
      if (!aAberto) return
      a.adsDeriv.forEach(r => {
        const rl = leitura(r)
        drillRows.push(
          <tr key={r.key} style={{ borderBottom: '1px solid #2a2a2c' }}>
            <td style={{ padding: '8px 14px 8px 48px', fontSize: 12, color: '#9ca3af' }}>{r.ad}</td>
            {tdNum(r.spend ? fmt(r.spend) : '—', '#f87171')}
            {tdNum(r.leads)}{tdNum(r.vendas)}
            {tdNum(pct(r.conv), r.conv >= 0.15 ? '#34d399' : r.conv < 0.08 ? '#f87171' : '#d1d1d1')}
            {tdNum(r.leads ? fmt(r.cpl) : '—')}{tdNum(r.vendas ? fmt(r.cpv) : '—')}
            {tdNum(r.spend ? r.roas.toFixed(2) + 'x' : '—', r.roas >= 1 ? '#34d399' : r.spend ? '#f87171' : '#6b7280')}
            {tdNum(rl ? rl.t : '—', rl ? rl.c : '#6b7280')}
          </tr>
        )
      })
    })
  })

  if (carregando) return <div style={{ padding: 40, color: '#6b7280' }}>Carregando tráfego...</div>

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Tráfego</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Investimento, criativos e retorno — onde colocar e onde tirar verba</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} />
          <span style={{ color: '#6b7280' }}>—</span>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} />
          <button onClick={() => { setDe(addDays(hoje, -7)); setAte(hoje) }} style={{ ...inp, cursor: 'pointer' }}>7d</button>
          <button onClick={() => { setDe(addDays(hoje, -30)); setAte(hoje) }} style={{ ...inp, cursor: 'pointer' }}>30d</button>
        </div>
      </div>

      {!spend.ok && (
        <div style={{ ...card, padding: 14, marginBottom: 16, borderColor: '#7f1d1d', background: '#2a1414' }}>
          <span style={{ fontSize: 13, color: '#f87171' }}>Sem gasto real do Meta no período{spend.error ? `: ${spend.error}` : ''}. As métricas de gasto/ROAS/CPV ficam zeradas até a API responder.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 8 }}>
        <KPI label="Investido" valor={fmt(investido)} cor="#f87171" />
        <KPI label="Leads" valor={totalLeads} />
        <KPI label="Vendas" valor={totalVendas} sub={`Conversão ${pct(totalLeads ? totalVendas / totalLeads : 0)}`} />
        <KPI label="Receita" valor={fmt(receita)} cor="#34d399" />
        <KPI label="ROAS" valor={roas.toFixed(2) + 'x'} cor={roas >= 1 ? '#34d399' : '#f87171'} sub="Receita ÷ investido" />
        <KPI label="CPL" valor={fmt(cpl)} sub="Custo por lead" />
        <KPI label="CPV" valor={fmt(cpv)} sub="Custo por venda" />
        <KPI label="Origem identificada" valor={pct(cobertura)} cor={cobertura >= 0.7 ? '#34d399' : cobertura >= 0.4 ? '#fbbf24' : '#f87171'} sub={`${leadsComAnuncio}/${totalLeads} com anúncio`} />
      </div>
      <p style={{ fontSize: 11, color: '#6b7280', margin: '6px 0 28px' }}>Leads casam com o anúncio pelo <b style={{ color: '#9ca3af' }}>utm_content</b> (nome do anúncio) + <b style={{ color: '#9ca3af' }}>utm_campaign</b>. Gasto real do Meta por anúncio.</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>1. Campanha ▸ Conjunto ▸ Anúncio</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Clique pra abrir. 🟢 escalar (vende com ROAS ≥ 1) · 🟡 observar · 🔴 matar (gastou, gerou lead e não vendeu).</p>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead><tr style={{ borderBottom: '1px solid #3a3a3c' }}>
            {['Campanha / conjunto / anúncio', 'Gasto', 'Leads', 'Vendas', 'Conv', 'CPL', 'CPV', 'ROAS', 'Leitura'].map(th)}
          </tr></thead>
          <tbody>
            {campanhas.length === 0 && <tr><td colSpan={9} style={{ padding: 20, fontSize: 13, color: '#6b7280' }}>Sem dados no período.</td></tr>}
            {drillRows}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>2. Ranking de criativos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #3a3a3c', fontSize: 13, fontWeight: 600, color: '#34d399' }}>🟢 Vendem mais (por ROAS)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {melhores.length === 0 && <tr><td style={{ padding: 16, fontSize: 12, color: '#6b7280' }}>Nenhum criativo com venda no período.</td></tr>}
            {melhores.map(a => (
              <tr key={a.key} style={{ borderBottom: '1px solid #3a3a3c' }}>
                <td style={{ padding: '9px 16px', fontSize: 12, color: '#fff' }}>{a.ad}<div style={{ fontSize: 10, color: '#6b7280' }}>{a.campaign}</div></td>
                {tdNum(a.vendas + 'v')}{tdNum(fmt(a.spend), '#f87171')}{tdNum(a.roas.toFixed(2) + 'x', '#34d399')}
              </tr>
            ))}
          </tbody></table>
        </div>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #3a3a3c', fontSize: 13, fontWeight: 600, color: '#f87171' }}>🔴 Queimando verba (gastou, 0 venda)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {queimando.length === 0 && <tr><td style={{ padding: 16, fontSize: 12, color: '#6b7280' }}>Nenhum criativo gastando sem vender. 👏</td></tr>}
            {queimando.map(a => (
              <tr key={a.key} style={{ borderBottom: '1px solid #3a3a3c' }}>
                <td style={{ padding: '9px 16px', fontSize: 12, color: '#fff' }}>{a.ad}<div style={{ fontSize: 10, color: '#6b7280' }}>{a.campaign}</div></td>
                {tdNum(a.leads + 'l')}{tdNum(fmt(a.spend), '#f87171')}{tdNum(a.leads ? fmt(a.cpl) : '—')}
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>3. Qualidade do lead por anúncio</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Lead barato que não fecha é caro. 🔴 = muitos leads e conversão baixa. 🟢 = lead que vira venda.</p>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead><tr style={{ borderBottom: '1px solid #3a3a3c' }}>
            {['Anúncio', 'Leads', 'Vendas', 'Conversão', 'CPL', 'CPV', 'Qualidade'].map(th)}
          </tr></thead>
          <tbody>
            {qualidade.length === 0 && <tr><td colSpan={7} style={{ padding: 20, fontSize: 13, color: '#6b7280' }}>Sem leads com anúncio no período.</td></tr>}
            {qualidade.map(a => {
              const ruim = a.leads >= 5 && a.conv < 0.08
              const bom = a.conv >= 0.15 && a.vendas > 0
              return (
                <tr key={a.key} style={{ borderBottom: '1px solid #3a3a3c' }}>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: '#fff' }}>{a.ad}<div style={{ fontSize: 10, color: '#6b7280' }}>{a.campaign}</div></td>
                  {tdNum(a.leads)}{tdNum(a.vendas)}
                  {tdNum(pct(a.conv), bom ? '#34d399' : ruim ? '#f87171' : '#d1d1d1')}
                  {tdNum(a.leads ? fmt(a.cpl) : '—')}{tdNum(a.vendas ? fmt(a.cpv) : '—')}
                  {tdNum(bom ? '🟢 bom' : ruim ? '🔴 lead ruim' : '—', bom ? '#34d399' : ruim ? '#f87171' : '#6b7280')}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>4. ROI por turma / produto</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Gasto casado pelo código da turma no nome da campanha, rateado por leads quando turmas dividem a mesma campanha.</p>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 40 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr style={{ borderBottom: '1px solid #3a3a3c' }}>
            {['Turma', 'Gasto', 'Leads', 'Vendas', 'CPL', 'CPV', 'Receita', 'ROAS'].map(th)}
          </tr></thead>
          <tbody>
            {roiTurmas.length === 0 && <tr><td colSpan={8} style={{ padding: 20, fontSize: 13, color: '#6b7280' }}>Sem gasto/leads por turma no período.</td></tr>}
            {roiTurmas.map(r => (
              <tr key={r.t.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                <td style={{ padding: '9px 14px', fontSize: 12, color: '#fff' }}>{r.t.produtos?.nome} — {r.t.cidades?.nome}<div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>{r.t.codigo}</div></td>
                {tdNum(r.g ? fmt(r.g) : '—', '#f87171')}
                {tdNum(r.lds)}{tdNum(r.vds)}
                {tdNum(r.lds ? fmt(r.cpl) : '—')}{tdNum(r.vds ? fmt(r.cpv) : '—')}
                {tdNum(fmt(r.rec), '#34d399')}
                {tdNum(r.g ? r.roas.toFixed(2) + 'x' : '—', r.roas >= 1 ? '#34d399' : r.g ? '#f87171' : '#6b7280')}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
