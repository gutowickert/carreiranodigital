'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--text)', outline: 'none' } as React.CSSProperties

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
  if (m.spend <= 0) return m.leads > 0 ? { t: 'orgânico', c: 'var(--text-faint)' } : null
  const roas = m.receita / m.spend
  if (m.vendas > 0 && roas >= 1) return { t: '🟢 escalar', c: 'var(--green)' }
  if (m.vendas > 0) return { t: '🟡 observar', c: 'var(--amber)' }
  if (m.leads >= 3) return { t: '🔴 matar', c: 'var(--red)' }
  return { t: '🟡 observar', c: 'var(--amber)' }
}

export default function Trafego() {
  const hoje = hojeStr()
  const [de, setDe] = useState(hoje)
  const [ate, setAte] = useState(hoje)
  const [preset, setPreset] = useState('Hoje')
  const [carregando, setCarregando] = useState(true)
  const [leads, setLeads] = useState<any[]>([])
  const [spend, setSpend] = useState<Spend>({ ok: false, total: 0, campaigns: [], ads: [] })
  const [abertos, setAbertos] = useState<Set<string>>(new Set())

  useEffect(() => { carregar() }, [])
  useEffect(() => { carregarGasto() }, [de, ate])

  async function carregar() {
    setCarregando(true)
    const l = await supabase.from('leads').select('id, turma_id, etapa, utm_source, utm_campaign, utm_content, fbclid, valor_venda, criado_em')
    setLeads(l.data || [])
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

  // ROI por turma migrou para a página Captação (visão por turma fica lá; aqui é só criativo).

  // ---- datasets dos gráficos (panorama) ----
  const campanhasChart = campanhas.filter(c => c.m.spend > 0 || c.m.leads > 0).slice(0, 8).map(c => ({
    campanha: c.campaign.length > 22 ? c.campaign.slice(0, 22) + '…' : c.campaign,
    investido: Math.round(c.m.spend),
    receita: Math.round(c.m.receita),
    leads: c.m.leads,
  }))
  const tipProps = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }, itemStyle: { color: 'var(--text)' }, labelStyle: { color: 'var(--text-faint)' } }

  const KPI = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--text)', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
  const th = (h: string, i: number) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 14px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
  const tdNum = (v: any, cor?: string) => <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, color: cor || 'var(--text-2)', whiteSpace: 'nowrap' }}>{v}</td>

  // monta as linhas do drill-down (sem fragmentos, pra key ficar correta)
  const drillRows: any[] = []
  campanhas.forEach(c => {
    const cKey = 'c:' + c.campaign
    const cAberto = abertos.has(cKey)
    const lc = leitura(c.m)
    drillRows.push(
      <tr key={cKey} onClick={() => toggle(cKey)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg)' }}>
        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 14, color: 'var(--text-faint)' }}>{cAberto ? '▾' : '▸'}</span> {c.campaign}
        </td>
        {tdNum(c.m.spend ? fmt(c.m.spend) : '—', 'var(--red)')}
        {tdNum(c.m.leads)}{tdNum(c.m.vendas)}
        {tdNum(pct(c.m.conv), c.m.conv >= 0.15 ? 'var(--green)' : c.m.conv < 0.08 ? 'var(--red)' : 'var(--text-2)')}
        {tdNum(c.m.leads ? fmt(c.m.cpl) : '—')}{tdNum(c.m.vendas ? fmt(c.m.cpv) : '—')}
        {tdNum(c.m.spend ? c.m.roas.toFixed(2) + 'x' : '—', c.m.roas >= 1 ? 'var(--green)' : c.m.spend ? 'var(--red)' : 'var(--text-faint)')}
        {tdNum(lc ? lc.t : '—', lc ? lc.c : 'var(--text-faint)')}
      </tr>
    )
    if (!cAberto) return
    c.adsets.forEach(a => {
      const aKey = 'a:' + c.campaign + '|' + a.adset
      const aAberto = abertos.has(aKey)
      drillRows.push(
        <tr key={aKey} onClick={() => toggle(aKey)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
          <td style={{ padding: '8px 14px 8px 30px', fontSize: 12, color: 'var(--text-2)' }}>
            <span style={{ display: 'inline-block', width: 14, color: 'var(--text-faint)' }}>{aAberto ? '▾' : '▸'}</span> {a.adset}
          </td>
          {tdNum(a.m.spend ? fmt(a.m.spend) : '—', 'var(--red)')}
          {tdNum(a.m.leads)}{tdNum(a.m.vendas)}
          {tdNum(pct(a.m.conv))}
          {tdNum(a.m.leads ? fmt(a.m.cpl) : '—')}{tdNum(a.m.vendas ? fmt(a.m.cpv) : '—')}
          {tdNum(a.m.spend ? a.m.roas.toFixed(2) + 'x' : '—', a.m.roas >= 1 ? 'var(--green)' : a.m.spend ? 'var(--red)' : 'var(--text-faint)')}
          <td />
        </tr>
      )
      if (!aAberto) return
      a.adsDeriv.forEach(r => {
        const rl = leitura(r)
        drillRows.push(
          <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px 14px 8px 48px', fontSize: 12, color: 'var(--text-muted)' }}>{r.ad}</td>
            {tdNum(r.spend ? fmt(r.spend) : '—', 'var(--red)')}
            {tdNum(r.leads)}{tdNum(r.vendas)}
            {tdNum(pct(r.conv), r.conv >= 0.15 ? 'var(--green)' : r.conv < 0.08 ? 'var(--red)' : 'var(--text-2)')}
            {tdNum(r.leads ? fmt(r.cpl) : '—')}{tdNum(r.vendas ? fmt(r.cpv) : '—')}
            {tdNum(r.spend ? r.roas.toFixed(2) + 'x' : '—', r.roas >= 1 ? 'var(--green)' : r.spend ? 'var(--red)' : 'var(--text-faint)')}
            {tdNum(rl ? rl.t : '—', rl ? rl.c : 'var(--text-faint)')}
          </tr>
        )
      })
    })
  })

  // Atalhos de período (botão ativo destacado). 'de' inclui o dia; 'ate' é sempre hoje.
  const PRESETS: [string, string][] = [
    ['Hoje', hoje],
    ['Esse mês', hoje.slice(0, 7) + '-01'],
    ['Últimos 3 dias', addDays(hoje, -2)],
    ['Últimos 7 dias', addDays(hoje, -6)],
    ['Últimos 30 dias', addDays(hoje, -29)],
  ]

  if (carregando) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando tráfego...</div>

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Tráfego</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Criativos e campanhas — qual anúncio escalar e qual matar · visão por turma fica em Captação</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {PRESETS.map(([label, dDe]) => (
            <button key={label} onClick={() => { setDe(dDe); setAte(hoje); setPreset(label) }}
              style={{ ...inp, cursor: 'pointer', ...(preset === label ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' } : {}) }}>{label}</button>
          ))}
          <input type="date" value={de} onChange={e => { setDe(e.target.value); setPreset('') }} style={inp} />
          <span style={{ color: 'var(--text-faint)' }}>—</span>
          <input type="date" value={ate} onChange={e => { setAte(e.target.value); setPreset('') }} style={inp} />
        </div>
      </div>

      {!spend.ok && (
        <div style={{ ...card, padding: 14, marginBottom: 16, borderColor: 'var(--red-bg)', background: 'var(--red-bg)' }}>
          <span style={{ fontSize: 13, color: 'var(--red)' }}>Sem gasto real do Meta no período{spend.error ? `: ${spend.error}` : ''}. As métricas de gasto/ROAS/CPV ficam zeradas até a API responder.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 8 }}>
        <KPI label="Investido" valor={fmt(investido)} cor="var(--red)" />
        <KPI label="Leads" valor={totalLeads} />
        <KPI label="Vendas" valor={totalVendas} sub={`Conversão ${pct(totalLeads ? totalVendas / totalLeads : 0)}`} />
        <KPI label="Receita" valor={fmt(receita)} cor="var(--green)" />
        <KPI label="ROAS" valor={roas.toFixed(2) + 'x'} cor={roas >= 1 ? 'var(--green)' : 'var(--red)'} sub="Receita ÷ investido" />
        <KPI label="CPL" valor={fmt(cpl)} sub="Custo por lead" />
        <KPI label="CPV" valor={fmt(cpv)} sub="Custo por venda" />
        <KPI label="Origem identificada" valor={pct(cobertura)} cor={cobertura >= 0.7 ? 'var(--green)' : cobertura >= 0.4 ? 'var(--amber)' : 'var(--red)'} sub={`${leadsComAnuncio}/${totalLeads} com anúncio`} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '6px 0 28px' }}>Leads casam com o anúncio pelo <b style={{ color: 'var(--text-muted)' }}>utm_content</b> (nome do anúncio) + <b style={{ color: 'var(--text-muted)' }}>utm_campaign</b>. Gasto real do Meta por anúncio.</p>

      {/* Panorama visual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Investimento × Receita por campanha</div>
          {campanhasChart.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</p> : (
            <ResponsiveContainer width="100%" height={Math.max(190, campanhasChart.length * 46)}>
              <BarChart data={campanhasChart} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                <YAxis type="category" dataKey="campanha" width={150} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} {...tipProps} formatter={(v: any) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="investido" name="Investido" fill="#f87171" radius={[0, 3, 3, 0]} barSize={9} />
                <Bar dataKey="receita" name="Receita" fill="#34d399" radius={[0, 3, 3, 0]} barSize={9} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Leads por campanha</div>
          {campanhasChart.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</p> : (
            <ResponsiveContainer width="100%" height={Math.max(190, campanhasChart.length * 46)}>
              <BarChart data={campanhasChart} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="campanha" width={150} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} {...tipProps} />
                <Bar dataKey="leads" name="Leads" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={14} label={{ position: 'right', fill: 'var(--text-2)', fontSize: 11, fontWeight: 600 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>1. Campanha ▸ Conjunto ▸ Anúncio</h2>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 12px' }}>Clique pra abrir. 🟢 escalar (vende com ROAS ≥ 1) · 🟡 observar · 🔴 matar (gastou, gerou lead e não vendeu).</p>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Campanha / conjunto / anúncio', 'Gasto', 'Leads', 'Vendas', 'Conv', 'CPL', 'CPV', 'ROAS', 'Leitura'].map(th)}
          </tr></thead>
          <tbody>
            {campanhas.length === 0 && <tr><td colSpan={9} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</td></tr>}
            {drillRows}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>2. Ranking de criativos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>🟢 Vendem mais (por ROAS)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {melhores.length === 0 && <tr><td style={{ padding: 16, fontSize: 12, color: 'var(--text-faint)' }}>Nenhum criativo com venda no período.</td></tr>}
            {melhores.map(a => (
              <tr key={a.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--text)' }}>{a.ad}<div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.campaign}</div></td>
                {tdNum(a.vendas + 'v')}{tdNum(fmt(a.spend), 'var(--red)')}{tdNum(a.roas.toFixed(2) + 'x', 'var(--green)')}
              </tr>
            ))}
          </tbody></table>
        </div>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>🔴 Queimando verba (gastou, 0 venda)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {queimando.length === 0 && <tr><td style={{ padding: 16, fontSize: 12, color: 'var(--text-faint)' }}>Nenhum criativo gastando sem vender. 👏</td></tr>}
            {queimando.map(a => (
              <tr key={a.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--text)' }}>{a.ad}<div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.campaign}</div></td>
                {tdNum(a.leads + 'l')}{tdNum(fmt(a.spend), 'var(--red)')}{tdNum(a.leads ? fmt(a.cpl) : '—')}
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>3. Qualidade do lead por anúncio</h2>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 12px' }}>Lead barato que não fecha é caro. 🔴 = muitos leads e conversão baixa. 🟢 = lead que vira venda.</p>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Anúncio', 'Leads', 'Vendas', 'Conversão', 'CPL', 'CPV', 'Qualidade'].map(th)}
          </tr></thead>
          <tbody>
            {qualidade.length === 0 && <tr><td colSpan={7} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Sem leads com anúncio no período.</td></tr>}
            {qualidade.map(a => {
              const ruim = a.leads >= 5 && a.conv < 0.08
              const bom = a.conv >= 0.15 && a.vendas > 0
              return (
                <tr key={a.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text)' }}>{a.ad}<div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.campaign}</div></td>
                  {tdNum(a.leads)}{tdNum(a.vendas)}
                  {tdNum(pct(a.conv), bom ? 'var(--green)' : ruim ? 'var(--red)' : 'var(--text-2)')}
                  {tdNum(a.leads ? fmt(a.cpl) : '—')}{tdNum(a.vendas ? fmt(a.cpv) : '—')}
                  {tdNum(bom ? '🟢 bom' : ruim ? '🔴 lead ruim' : '—', bom ? 'var(--green)' : ruim ? 'var(--red)' : 'var(--text-faint)')}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ ...card, padding: 16, marginBottom: 40, fontSize: 13, color: 'var(--text-muted)' }}>
        A visão <b style={{ color: 'var(--text-2)' }}>por turma</b> (leads, CPL, matrículas/meta e ação de verba) agora fica em <a href="/dashboard/captacao" style={{ color: 'var(--accent-soft)', textDecoration: 'none' }}>Captação ↗</a>. Aqui o foco é o criativo.
      </div>
    </div>
  )
}
