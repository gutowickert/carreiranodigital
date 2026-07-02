'use client'

import { useEffect, useState } from 'react'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--text)', outline: 'none' } as React.CSSProperties

function hojeStr() { return new Date().toISOString().split('T')[0] }
function addDays(s: string, d: number) { const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0] }
function pctN(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0 }

type Linha = { chave: string; visitantes: number; engajaram: number; viuCta: number; clicouCta: number; cliquesWa: number; leads: number }
type LinhaPag = { chave: string; visitantes: number; engajaram: number; viuCta: number; clicouCta: number }
type Dados = {
  ok: boolean; error?: string
  funil: { visitantes: number; engajaram: number; viuCta: number; clicouCta: number; cliquesWa: number; cliquesWaVisitors: number; leads: number; leadsVisitors: number }
  porTurma: Linha[]; porCampanha: Linha[]; porPagina: LinhaPag[]
}

export default function FunilSite() {
  const hoje = hojeStr()
  const [de, setDe] = useState(addDays(hoje, -6))
  const [ate, setAte] = useState(hoje)
  const [preset, setPreset] = useState('Últimos 7 dias')
  const [carregando, setCarregando] = useState(true)
  const [d, setD] = useState<Dados | null>(null)

  useEffect(() => { carregar() }, [de, ate])
  async function carregar() {
    setCarregando(true)
    try {
      const res = await fetch(`/api/funil-site?de=${de}&ate=${ate}`)
      setD(await res.json())
    } catch { setD({ ok: false, error: 'falha ao carregar', funil: { visitantes: 0, engajaram: 0, viuCta: 0, clicouCta: 0, cliquesWa: 0, cliquesWaVisitors: 0, leads: 0, leadsVisitors: 0 }, porTurma: [], porCampanha: [], porPagina: [] }) }
    setCarregando(false)
  }

  const PRESETS: [string, string][] = [
    ['Hoje', hoje],
    ['Esse mês', hoje.slice(0, 7) + '-01'],
    ['Últimos 3 dias', addDays(hoje, -2)],
    ['Últimos 7 dias', addDays(hoje, -6)],
    ['Últimos 30 dias', addDays(hoje, -29)],
  ]

  const KPI = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--text)', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
  const th = (h: string, i: number) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 14px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
  const tdNum = (v: any, cor?: string) => <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, color: cor || 'var(--text-2)', whiteSpace: 'nowrap' }}>{v}</td>

  const f = d?.funil
  // Etapas do funil (cada uma % do topo e % de queda da anterior).
  const etapas = f ? [
    { label: 'Visitantes', n: f.visitantes, cor: '#7c3aed', desc: 'entraram no site' },
    { label: 'Engajaram', n: f.engajaram, cor: '#6d28d9', desc: 'rolaram / viram oferta / vídeo' },
    { label: 'Viram o CTA', n: f.viuCta, cor: '#4f46e5', desc: 'o botão apareceu na tela' },
    { label: 'Clicaram no CTA', n: f.clicouCta, cor: '#2563eb', desc: 'clicaram no botão de WhatsApp' },
    { label: 'Foram pro WhatsApp', n: f.cliquesWa, cor: '#0ea5e9', desc: 'clique registrado no /wa' },
    { label: 'Viraram lead', n: f.leads, cor: '#10b981', desc: 'mandaram msg e viraram lead' },
  ] : []
  const topo = f?.visitantes || 0

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Funil do Site</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Da visita ao lead: quem entrou, engajou, viu o CTA, clicou e virou lead — por turma, campanha e página.</p>
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

      {carregando ? <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando funil...</div> : !d?.ok ? (
        <div style={{ ...card, padding: 14, borderColor: 'var(--red-bg)', background: 'var(--red-bg)' }}>
          <span style={{ fontSize: 13, color: 'var(--red)' }}>Não deu pra carregar o funil{d?.error ? `: ${d.error}` : ''}.</span>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KPI label="Visitantes" valor={(f!.visitantes).toLocaleString('pt-BR')} cor="#a78bfa" />
            <KPI label="Engajaram" valor={(f!.engajaram).toLocaleString('pt-BR')} sub={`${pctN(f!.engajaram, topo)}% dos visitantes`} />
            <KPI label="Viram o CTA" valor={(f!.viuCta).toLocaleString('pt-BR')} sub={`${pctN(f!.viuCta, topo)}% dos visitantes`} />
            <KPI label="Clicaram no CTA" valor={(f!.clicouCta).toLocaleString('pt-BR')} cor="#60a5fa" sub={`${pctN(f!.clicouCta, topo)}% dos visitantes`} />
            <KPI label="Cliques no /wa" valor={(f!.cliquesWa).toLocaleString('pt-BR')} sub="clique registrado no sistema" />
            <KPI label="Viraram lead" valor={(f!.leads).toLocaleString('pt-BR')} cor="var(--green)" sub={`${pctN(f!.leads, f!.cliquesWa)}% dos cliques /wa`} />
          </div>

          {/* Funil visual */}
          <div style={{ ...card, padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>Funil — da visita ao lead</div>
            {topo === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem eventos no período. Assim que o site receber visitas, o funil aparece aqui.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {etapas.map((et, i) => {
                  const w = topo ? Math.max(3, Math.round((et.n / topo) * 100)) : 0
                  const dropPrev = i > 0 ? etapas[i - 1].n - et.n : 0
                  const dropPct = i > 0 && etapas[i - 1].n > 0 ? Math.round((dropPrev / etapas[i - 1].n) * 100) : 0
                  return (
                    <div key={et.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{et.label} <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>· {et.desc}</span></span>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                          {et.n.toLocaleString('pt-BR')} <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>({pctN(et.n, topo)}% do topo)</span>
                          {i > 0 && dropPrev > 0 && <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 8 }}>▼ {dropPct}%</span>}
                        </span>
                      </div>
                      <div style={{ background: 'var(--surface-2)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                        <div style={{ width: `${w}%`, height: '100%', background: et.cor, borderRadius: 6, transition: 'width .3s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 28px' }}>
            Visitantes contados por <b style={{ color: 'var(--text-muted)' }}>pessoa distinta</b> (visitor_id), não por evento. As 4 primeiras etapas vêm do site; “Foram pro WhatsApp” e “Viraram lead” vêm do <b style={{ color: 'var(--text-muted)' }}>/wa</b> (por clique). A costura exata pessoa→lead completa quando o <code>vid</code> viaja no link do /wa.
          </p>

          {/* Por turma */}
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>Por turma</h2>
          <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Turma', 'Visitantes', 'Engajaram', 'Viram CTA', 'Clicaram', 'Cliques /wa', 'Leads', 'Visita→Clique', 'Clique→Lead'].map(th)}
              </tr></thead>
              <tbody>
                {d.porTurma.length === 0 && <tr><td colSpan={9} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</td></tr>}
                {d.porTurma.map(r => (
                  <tr key={r.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text)' }}>{r.chave}</td>
                    {tdNum(r.visitantes)}{tdNum(r.engajaram)}{tdNum(r.viuCta)}{tdNum(r.clicouCta, '#60a5fa')}{tdNum(r.cliquesWa)}{tdNum(r.leads, 'var(--green)')}
                    {tdNum(pctN(r.clicouCta, r.visitantes) + '%', pctN(r.clicouCta, r.visitantes) >= 10 ? 'var(--green)' : 'var(--text-2)')}
                    {tdNum(pctN(r.leads, r.cliquesWa) + '%')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Por campanha */}
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>Por campanha (utm_campaign)</h2>
          <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Campanha', 'Visitantes', 'Engajaram', 'Viram CTA', 'Clicaram', 'Cliques /wa', 'Leads', 'Visita→Clique'].map(th)}
              </tr></thead>
              <tbody>
                {d.porCampanha.length === 0 && <tr><td colSpan={8} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</td></tr>}
                {d.porCampanha.map(r => (
                  <tr key={r.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text)' }}>{r.chave}</td>
                    {tdNum(r.visitantes)}{tdNum(r.engajaram)}{tdNum(r.viuCta)}{tdNum(r.clicouCta, '#60a5fa')}{tdNum(r.cliquesWa)}{tdNum(r.leads, 'var(--green)')}
                    {tdNum(pctN(r.clicouCta, r.visitantes) + '%', pctN(r.clicouCta, r.visitantes) >= 10 ? 'var(--green)' : 'var(--text-2)')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Por página */}
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>Por página</h2>
          <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 40 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Página', 'Visitantes', 'Engajaram', 'Viram CTA', 'Clicaram', 'Visita→Clique'].map(th)}
              </tr></thead>
              <tbody>
                {d.porPagina.length === 0 && <tr><td colSpan={6} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</td></tr>}
                {d.porPagina.map(r => (
                  <tr key={r.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.chave}</td>
                    {tdNum(r.visitantes)}{tdNum(r.engajaram)}{tdNum(r.viuCta)}{tdNum(r.clicouCta, '#60a5fa')}
                    {tdNum(pctN(r.clicouCta, r.visitantes) + '%', pctN(r.clicouCta, r.visitantes) >= 10 ? 'var(--green)' : 'var(--text-2)')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
