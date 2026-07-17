'use client'

import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { fetchAuth } from '@/lib/api'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--text)', outline: 'none' } as React.CSSProperties

const TZ = 'America/Sao_Paulo' // fuso de Brasília (UTC-3), sem horário de verão
function hojeStr() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) } // YYYY-MM-DD no fuso de Brasília
function addDays(s: string, d: number) { const [y, m, dd] = s.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, dd)); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
function pctN(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0 }
function hora(s?: string) { return s ? new Date(s).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '' }
function dataHora(s?: string) { return s ? new Date(s).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '' }

type Linha = { chave: string; visitantes: number; engajaram: number; viuCta: number; clicouCta: number; cliquesWa: number; leads: number }
type LinhaPag = { chave: string; visitantes: number; engajaram: number; viuCta: number; clicouCta: number }
type Tend = { dia: string; visitantes: number; cliquesWa: number; leads: number }
type Dados = {
  ok: boolean; error?: string
  funil: { visitantes: number; engajaram: number; viuCta: number; clicouCta: number; cliquesWa: number; cliquesWaVisitors: number; leads: number; leadsVisitors: number }
  tendencia: Tend[]; porTurma: Linha[]; porCampanha: Linha[]; porPagina: LinhaPag[]
}
type Jornada = {
  visitor_id: string; inicio: string; fim: string; turma: string | null; campanha: string | null; criativo: string | null
  paginas: string[]; nEventos: number; engajou: boolean; clicou: boolean; ref: string | null
  virouLead: boolean; lead: { id: string; nome: string; whatsapp: string; etapa: string } | null
  eventos: { evento: string; em: string }[]
}
type EventoRow = { visitor_id: string; sessao_id: string; evento: string; url: string; utm_campaign: string; utm_content: string; codigo_turma: string; meta: any; criado_em: string }

const EVENTO_LABEL: Record<string, string> = {
  page_view: '👁 viu a página', scroll_50: '📜 rolou 50%', scroll_90: '📜 rolou 90%',
  video_play: '▶️ deu play', video_50: '▶️ viu metade do vídeo', viu_oferta: '🎯 viu a oferta',
  viu_preco: '💰 viu o preço', cta_view: '🔘 CTA na tela', cta_click: '👉 clicou no CTA',
}
const labelEv = (e: string) => EVENTO_LABEL[e] || e

const PRESETS = (hoje: string): [string, string][] => [
  ['Hoje', hoje], ['Esse mês', hoje.slice(0, 7) + '-01'], ['Últimos 3 dias', addDays(hoje, -2)],
  ['Últimos 7 dias', addDays(hoje, -6)], ['Últimos 30 dias', addDays(hoje, -29)],
]

export default function FunilSite() {
  const hoje = hojeStr()
  const [de, setDe] = useState(addDays(hoje, -6))
  const [ate, setAte] = useState(hoje)
  const [preset, setPreset] = useState('Últimos 7 dias')
  const [aba, setAba] = useState<'funil' | 'anuncios' | 'jornadas' | 'eventos'>('funil')

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Funil do Site</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Tudo que captamos: da visita ao lead, pessoa por pessoa.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {PRESETS(hoje).map(([label, dDe]) => (
            <button key={label} onClick={() => { setDe(dDe); setAte(hoje); setPreset(label) }}
              style={{ ...inp, cursor: 'pointer', ...(preset === label ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' } : {}) }}>{label}</button>
          ))}
          <input type="date" value={de} onChange={e => { setDe(e.target.value); setPreset('') }} style={inp} />
          <span style={{ color: 'var(--text-faint)' }}>—</span>
          <input type="date" value={ate} onChange={e => { setAte(e.target.value); setPreset('') }} style={inp} />
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {([['funil', 'Funil / Resumo'], ['anuncios', 'Do anúncio ao lead'], ['jornadas', 'Jornadas'], ['eventos', 'Eventos']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setAba(k)}
            style={{ background: 'none', border: 'none', borderBottom: aba === k ? '2px solid var(--accent)' : '2px solid transparent', color: aba === k ? 'var(--text)' : 'var(--text-faint)', fontSize: 14, fontWeight: aba === k ? 700 : 500, padding: '10px 16px', cursor: 'pointer', marginBottom: -1 }}>{lbl}</button>
        ))}
      </div>

      {aba === 'funil' && <AbaFunil de={de} ate={ate} />}
      {aba === 'anuncios' && <AbaAnuncios de={de} ate={ate} />}
      {aba === 'jornadas' && <AbaJornadas de={de} ate={ate} />}
      {aba === 'eventos' && <AbaEventos de={de} ate={ate} />}
    </div>
  )
}

// ---------- helpers de UI compartilhados ----------
const KPI = ({ label, valor, cor, sub }: any) => (
  <div style={{ ...card, padding: 16 }}>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--text)', marginTop: 6 }}>{valor}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
  </div>
)
const th = (h: string, i: number) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 14px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
const tdNum = (v: any, cor?: string) => <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, color: cor || 'var(--text-2)', whiteSpace: 'nowrap' }}>{v}</td>
const tipProps = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }, itemStyle: { color: 'var(--text)' }, labelStyle: { color: 'var(--text-faint)' } }

// ============ ABA FUNIL / RESUMO ============
function AbaFunil({ de, ate }: { de: string; ate: string }) {
  const [carregando, setCarregando] = useState(true)
  const [d, setD] = useState<Dados | null>(null)
  useEffect(() => { (async () => {
    setCarregando(true)
    try { const res = await fetchAuth(`/api/funil-site?de=${de}&ate=${ate}`); setD(await res.json()) }
    catch { setD(null) }
    setCarregando(false)
  })() }, [de, ate])

  if (carregando) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando funil...</div>
  if (!d?.ok) return <div style={{ ...card, padding: 14, borderColor: 'var(--red-bg)', background: 'var(--red-bg)' }}><span style={{ fontSize: 13, color: 'var(--red)' }}>Não deu pra carregar{d?.error ? `: ${d.error}` : ''}.</span></div>

  const f = d.funil
  const topo = f.visitantes || 0
  // Ordem cronológica real: no load dispara page_view + cta_view; depois rolam
  // (engajam); depois clicam; depois o clique chega no /wa; depois vira lead.
  // As duas últimas são CASADAS por pessoa (mesmo visitor_id) — não o total de
  // cliques de todas as origens.
  const etapas = [
    { label: 'Visitantes', n: f.visitantes, cor: '#7c3aed', desc: 'entraram no site' },
    { label: 'Viram o CTA', n: f.viuCta, cor: '#5b21b6', desc: 'o botão apareceu na tela (no load)' },
    { label: 'Engajaram', n: f.engajaram, cor: '#4f46e5', desc: 'rolaram / viram oferta / vídeo' },
    { label: 'Clicaram no CTA', n: f.clicouCta, cor: '#2563eb', desc: 'clicaram no botão de WhatsApp' },
    { label: 'Foram pro WhatsApp', n: f.cliquesWaVisitors, cor: '#0ea5e9', desc: 'o clique chegou no /wa (mesma pessoa)' },
    { label: 'Viraram lead', n: f.leadsVisitors, cor: '#10b981', desc: 'mandaram msg e viraram lead' },
  ]

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KPI label="Visitantes" valor={f.visitantes.toLocaleString('pt-BR')} cor="#a78bfa" />
        <KPI label="Engajaram" valor={f.engajaram.toLocaleString('pt-BR')} sub={`${pctN(f.engajaram, topo)}% dos visitantes`} />
        <KPI label="Viram o CTA" valor={f.viuCta.toLocaleString('pt-BR')} sub={`${pctN(f.viuCta, topo)}% dos visitantes`} />
        <KPI label="Clicaram no CTA" valor={f.clicouCta.toLocaleString('pt-BR')} cor="#60a5fa" sub={`${pctN(f.clicouCta, topo)}% dos visitantes`} />
        <KPI label="Foram pro WhatsApp" valor={f.cliquesWaVisitors.toLocaleString('pt-BR')} cor="#38bdf8" sub="visitantes rastreados que clicaram" />
        <KPI label="Viraram lead" valor={f.leadsVisitors.toLocaleString('pt-BR')} cor="var(--green)" sub={`${pctN(f.leadsVisitors, f.clicouCta)}% de quem clicou`} />
      </div>
      <div style={{ ...card, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'var(--text-muted)' }}>
        No mesmo período houve <b style={{ color: 'var(--text-2)' }}>{f.cliquesWa.toLocaleString('pt-BR')}</b> cliques no /wa e <b style={{ color: 'var(--text-2)' }}>{f.leads.toLocaleString('pt-BR')}</b> leads de <b>todas as origens</b> (tráfego pago, links, indicações…) — esses ficam no Tráfego/Captação. Aqui o funil conta só quem foi <b>rastreado no site</b> e casado pela mesma pessoa.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.1fr) minmax(300px, 1fr)', gap: 16, marginBottom: 12 }}>
        {/* Funil */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>Funil — da visita ao lead</div>
          {topo === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem eventos no período.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {etapas.map((et, i) => {
                const w = topo ? Math.max(3, Math.round((et.n / topo) * 100)) : 0
                const dropPrev = i > 0 ? etapas[i - 1].n - et.n : 0
                const dropPct = i > 0 && etapas[i - 1].n > 0 ? Math.round((dropPrev / etapas[i - 1].n) * 100) : 0
                return (
                  <div key={et.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{et.label} <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>· {et.desc}</span></span>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{et.n.toLocaleString('pt-BR')} <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>({pctN(et.n, topo)}%)</span>{i > 0 && dropPrev > 0 && <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 8 }}>▼ {dropPct}%</span>}</span>
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
        {/* Tendência */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Tendência por dia</div>
          {(!d.tendencia || d.tendencia.length === 0) ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</p> : (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={d.tendencia} margin={{ left: -18, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tipProps} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="visitantes" name="Visitantes" stroke="#a78bfa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cliquesWa" name="Cliques /wa" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="leads" name="Leads" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 28px' }}>Cada etapa = <b style={{ color: 'var(--text-muted)' }}>pessoas distintas</b> (visitor_id), na ordem em que acontece. “Foram pro WhatsApp” e “Viraram lead” contam só os visitantes do site que foram casados <b style={{ color: 'var(--text-muted)' }}>pela mesma pessoa</b> (via vid no /wa) — por isso o funil sempre cai, nunca sobe.</p>

      <TabelaGrupo titulo="Por turma" linhas={d.porTurma} colClique />
      <TabelaGrupo titulo="Por campanha (utm_campaign)" linhas={d.porCampanha} />
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>Por página</h2>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 40 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Página', 'Visitantes', 'Engajaram', 'Viram CTA', 'Clicaram', 'Visita→Clique'].map(th)}</tr></thead>
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
  )
}

function TabelaGrupo({ titulo, linhas, colClique }: { titulo: string; linhas: Linha[]; colClique?: boolean }) {
  const cols = ['Turma/Campanha', 'Visitantes', 'Engajaram', 'Viram CTA', 'Clicaram', 'Foram p/ WA', 'Leads', 'Visita→Clique']
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{titulo}</h2>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{cols.map((c, i) => th(i === 0 ? titulo.includes('turma') ? 'Turma' : 'Campanha' : c, i))}</tr></thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={8} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</td></tr>}
            {linhas.map(r => (
              <tr key={r.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text)' }}>{r.chave}</td>
                {tdNum(r.visitantes)}{tdNum(r.engajaram)}{tdNum(r.viuCta)}{tdNum(r.clicouCta, '#60a5fa')}{tdNum(r.cliquesWa)}{tdNum(r.leads, 'var(--green)')}
                {tdNum(pctN(r.clicouCta, r.visitantes) + '%', pctN(r.clicouCta, r.visitantes) >= 10 ? 'var(--green)' : 'var(--text-2)')}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============ ABA JORNADAS ============
function AbaJornadas({ de, ate }: { de: string; ate: string }) {
  const [carregando, setCarregando] = useState(true)
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [soLead, setSoLead] = useState(false)

  useEffect(() => { (async () => {
    setCarregando(true)
    try { const res = await fetchAuth(`/api/funil-site/jornadas?de=${de}&ate=${ate}&q=${encodeURIComponent(busca)}`); const j = await res.json(); setJornadas(j.jornadas || []); setTotal(j.total || 0) }
    catch { setJornadas([]) }
    setCarregando(false)
  })() }, [de, ate, busca])

  const lista = soLead ? jornadas.filter(j => j.virouLead) : jornadas

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setBusca(q) }} placeholder="Buscar por turma, campanha, nome, página..." style={{ ...inp, minWidth: 300 }} />
        <button onClick={() => setBusca(q)} style={{ ...inp, cursor: 'pointer', background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }}>Buscar</button>
        <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={soLead} onChange={e => setSoLead(e.target.checked)} /> só quem virou lead
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 'auto' }}>{carregando ? 'carregando...' : `${lista.length} de ${total} pessoas`}</span>
      </div>

      {!carregando && lista.length === 0 && <div style={{ ...card, padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma jornada no período/filtro.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lista.map(j => {
          const ab = aberto === j.visitor_id
          return (
            <div key={j.visitor_id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div onClick={() => setAberto(ab ? null : j.visitor_id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-faint)', width: 12 }}>{ab ? '▾' : '▸'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: j.virouLead ? 'var(--green)' : 'var(--text)' }}>
                  {j.virouLead ? `🟢 ${j.lead?.nome || 'Lead'}` : j.clicou ? '🔵 Clicou (sem lead)' : '⚪ Só visitou'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{j.visitor_id.slice(0, 12)}</span>
                {j.turma && <Tag>{j.turma}</Tag>}
                {j.campanha && <Tag c="#a78bfa">{j.campanha}</Tag>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
                  {j.nEventos} eventos · {j.paginas.length} pág · {dataHora(j.inicio)}
                </span>
              </div>
              {ab && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: 'var(--bg)' }}>
                  {j.lead && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>Lead: <b style={{ color: 'var(--text)' }}>{j.lead.nome}</b> · {j.lead.whatsapp} · etapa <b>{j.lead.etapa}</b>{j.ref && <> · ref <code style={{ color: 'var(--text-faint)' }}>{j.ref}</code></>}</div>}
                  {j.criativo && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Criativo: {j.criativo}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>Páginas: {j.paginas.join(' · ')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {j.eventos.map((e, i) => (
                      <span key={i} style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                        <span style={{ color: 'var(--text-faint)' }}>{hora(e.em)}</span> {labelEv(e.evento)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

const Tag = ({ children, c }: { children: any; c?: string }) => (
  <span style={{ fontSize: 11, color: c || 'var(--text-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>{children}</span>
)

// ============ ABA EVENTOS ============
function AbaEventos({ de, ate }: { de: string; ate: string }) {
  const [carregando, setCarregando] = useState(true)
  const [eventos, setEventos] = useState<EventoRow[]>([])
  const [total, setTotal] = useState(0)
  const [mostrando, setMostrando] = useState(0)
  const [tipos, setTipos] = useState<string[]>([])
  const [fEvento, setFEvento] = useState('')
  const [fTurma, setFTurma] = useState('')
  const [fVid, setFVid] = useState('')

  useEffect(() => { (async () => {
    setCarregando(true)
    try {
      const p = new URLSearchParams({ de, ate, limit: '300' })
      if (fEvento) p.set('evento', fEvento); if (fTurma) p.set('turma', fTurma); if (fVid) p.set('vid', fVid)
      const res = await fetchAuth(`/api/funil-site/eventos?${p.toString()}`); const j = await res.json()
      setEventos(j.eventos || []); setTotal(j.total || 0); setMostrando(j.mostrando || 0)
      if (!fEvento && !fTurma && !fVid && j.tipos?.length) setTipos(j.tipos)
    } catch { setEventos([]) }
    setCarregando(false)
  })() }, [de, ate, fEvento, fTurma, fVid])

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={fEvento} onChange={e => setFEvento(e.target.value)} style={inp}>
          <option value="">Todos os eventos</option>
          {tipos.map(t => <option key={t} value={t}>{labelEv(t)}</option>)}
        </select>
        <input value={fTurma} onChange={e => setFTurma(e.target.value)} placeholder="filtrar por turma (código exato)" style={{ ...inp, minWidth: 220 }} />
        <input value={fVid} onChange={e => setFVid(e.target.value)} placeholder="filtrar por visitor_id" style={{ ...inp, minWidth: 220 }} />
        {(fEvento || fTurma || fVid) && <button onClick={() => { setFEvento(''); setFTurma(''); setFVid('') }} style={{ ...inp, cursor: 'pointer' }}>limpar</button>}
        <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 'auto' }}>{carregando ? 'carregando...' : `${mostrando} de ${total} eventos`}</span>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 40 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Quando', 'Evento', 'Turma', 'Visitor', 'Campanha', 'Página'].map(th)}</tr></thead>
          <tbody>
            {!carregando && eventos.length === 0 && <tr><td colSpan={6} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Nenhum evento no período/filtro.</td></tr>}
            {eventos.map((e, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{dataHora(e.criado_em)}</td>
                <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text)' }}>{labelEv(e.evento)}</td>
                <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-2)' }}>{e.codigo_turma || '—'}</td>
                <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace', cursor: 'pointer' }} onClick={() => setFVid(e.visitor_id)} title="filtrar por este visitante">{(e.visitor_id || '').slice(0, 12)}</td>
                <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-2)' }}>{e.utm_campaign || '—'}</td>
                <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-faint)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(e.url || '').replace(/^https?:\/\//, '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============ ABA DO ANÚNCIO AO LEAD ============
function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function nrm(x?: string | null) { return (x || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }
type AdMeta = { campaign: string; adset: string; ad: string; spend: number; impressions: number; clicks: number }
type AdSite = { key: string; campaign: string; ad: string; visitou: number; engajou: number; clicou: number; whats: number; leads: number; vendas: number; receita: number }
type Full = { key: string; campaign: string; ad: string; impressions: number; clicks: number; spend: number; visitou: number; engajou: number; clicou: number; whats: number; leads: number; vendas: number; receita: number }

function AbaAnuncios({ de, ate }: { de: string; ate: string }) {
  const [carregando, setCarregando] = useState(true)
  const [ads, setAds] = useState<AdSite[]>([])
  const [spend, setSpend] = useState<{ ok: boolean; ads: AdMeta[]; error?: string }>({ ok: false, ads: [] })

  useEffect(() => { (async () => {
    setCarregando(true)
    try {
      const [a, s] = await Promise.all([
        fetchAuth(`/api/funil-site/anuncios?de=${de}&ate=${ate}`).then(r => r.json()),
        fetch(`/api/meta/spend?since=${de}&until=${ate}`).then(r => r.json()).catch(() => ({ ok: false, ads: [] })),
      ])
      setAds(a.ads || [])
      setSpend({ ok: !!s.ok, ads: s.ads || [], error: s.error })
    } catch { setAds([]) }
    setCarregando(false)
  })() }, [de, ate])

  const keyOf = (camp?: string | null, ad?: string | null) => nrm(camp) + '||' + nrm(ad)
  const metaByKey: Record<string, AdMeta> = {}
  for (const m of spend.ads) { const k = keyOf(m.campaign, m.ad); if (!metaByKey[k]) metaByKey[k] = { ...m }; else { metaByKey[k].spend += m.spend; metaByKey[k].impressions += m.impressions; metaByKey[k].clicks += m.clicks } }
  const siteByKey: Record<string, AdSite> = {}
  for (const a of ads) siteByKey[a.key] = a

  const rows: Full[] = [...new Set([...Object.keys(metaByKey), ...Object.keys(siteByKey)])].map(k => {
    const m = metaByKey[k]; const s = siteByKey[k]
    return { key: k, campaign: s?.campaign || m?.campaign || '(sem campanha)', ad: s?.ad || m?.ad || '(sem anúncio)', impressions: m?.impressions || 0, clicks: m?.clicks || 0, spend: m?.spend || 0, visitou: s?.visitou || 0, engajou: s?.engajou || 0, clicou: s?.clicou || 0, whats: s?.whats || 0, leads: s?.leads || 0, vendas: s?.vendas || 0, receita: s?.receita || 0 }
  }).sort((a, b) => b.leads - a.leads || b.visitou - a.visitou || b.spend - a.spend)

  const T = rows.reduce((a, r) => { a.impressions += r.impressions; a.clicks += r.clicks; a.spend += r.spend; a.visitou += r.visitou; a.engajou += r.engajou; a.clicou += r.clicou; a.whats += r.whats; a.leads += r.leads; a.receita += r.receita; return a }, { impressions: 0, clicks: 0, spend: 0, visitou: 0, engajou: 0, clicou: 0, whats: 0, leads: 0, receita: 0 })

  // Funil = caminho do dinheiro (atribuição por utm_content), sempre monotônico:
  // cliques pagos >= foram pro WhatsApp >= viraram lead. O comportamento do site
  // (visita/engajou/clicou) fica na tabela — o rastreio ainda cobre parte do
  // tráfego, então misturá-lo aqui faria o funil "subir".
  const etapas = [
    { label: 'Cliques no anúncio', n: T.clicks, cor: '#f59e0b', desc: 'Meta' },
    { label: 'Foi pro WhatsApp', n: T.whats, cor: '#0ea5e9', desc: 'atribuído ao anúncio (utm)' },
    { label: 'Virou lead', n: T.leads, cor: '#10b981', desc: 'lead no CRM' },
  ]
  const etapasView = T.clicks > 0 ? etapas : etapas.slice(1)
  const topoView = etapasView[0]?.n || 0
  const cpl = T.leads ? T.spend / T.leads : 0
  const ctr = T.impressions ? T.clicks / T.impressions : 0
  const c2v = T.clicks ? T.visitou / T.clicks : 0
  const roas = T.spend ? T.receita / T.spend : 0

  // Onde o anúncio mais perde gente. Usa o caminho do dinheiro (CTR, WhatsApp→lead)
  // e a página só quando há visita rastreada suficiente. NÃO usa clique→visita como
  // "vazamento" enquanto o rastreio do site ainda cobre parte do tráfego (seria
  // confundido com falta de rastreio, não com perda real).
  function leitura(r: Full): { t: string; c: string } {
    if (r.leads > 0 && (r.spend === 0 || r.receita >= r.spend)) return { t: '🟢 escalar', c: 'var(--green)' }
    const stages = [
      { k: 'anúncio (CTR)', from: r.impressions, to: r.clicks },
      { k: 'oferta (WhatsApp→lead)', from: r.whats, to: r.leads },
    ]
    if (r.visitou >= 10) stages.push({ k: 'página (não clicou)', from: r.visitou, to: r.clicou })
    const valid = stages.filter(s => s.from >= 5)
    let worst: any = null, wd = -1
    for (const s of valid) { const d = (s.from - s.to) / s.from; if (d > wd) { wd = d; worst = s } }
    if (!worst || wd <= 0) return { t: '—', c: 'var(--text-faint)' }
    return { t: `🔴 ${worst.k}`, c: 'var(--red)' }
  }

  if (carregando) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando...</div>

  return (
    <>
      {!spend.ok && (
        <div style={{ ...card, padding: 12, marginBottom: 16, borderColor: 'var(--amber-bg, var(--border))', background: 'var(--surface-2)' }}>
          <span style={{ fontSize: 12, color: 'var(--amber)' }}>Sem gasto real do Meta no período{spend.error ? ` (${spend.error})` : ''}. Mostro o funil do site→lead; impressões/cliques/CPL do anúncio ficam zerados até a API do Meta responder.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPI label="Investido" valor={fmt(T.spend)} cor="var(--red)" />
        <KPI label="Impressões" valor={T.impressions.toLocaleString('pt-BR')} sub={`CTR ${(ctr * 100).toFixed(1)}%`} />
        <KPI label="Cliques anúncio" valor={T.clicks.toLocaleString('pt-BR')} cor="#f59e0b" />
        <KPI label="Rastreio do site" valor={`${Math.round(c2v * 100)}%`} cor={c2v >= 0.6 ? 'var(--green)' : c2v >= 0.3 ? 'var(--amber)' : 'var(--red)'} sub={`captou ${T.visitou.toLocaleString('pt-BR')} dos cliques`} />
        <KPI label="Leads" valor={T.leads.toLocaleString('pt-BR')} cor="var(--green)" />
        <KPI label="CPL" valor={T.leads ? fmt(cpl) : '—'} sub="custo por lead" />
        <KPI label="ROAS" valor={T.spend ? roas.toFixed(2) + 'x' : '—'} cor={roas >= 1 ? 'var(--green)' : 'var(--red)'} />
      </div>

      <div style={{ ...card, padding: 20, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>Funil — do anúncio ao lead</div>
        {topoView === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {etapasView.map((et, i) => {
              const w = topoView ? Math.max(3, Math.round((et.n / topoView) * 100)) : 0
              const prev = i > 0 ? etapasView[i - 1].n : 0
              const dropPct = i > 0 && prev > 0 ? Math.round(((prev - et.n) / prev) * 100) : 0
              return (
                <div key={et.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{et.label} <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>· {et.desc}</span></span>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{et.n.toLocaleString('pt-BR')} <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>({pctN(et.n, topoView)}%)</span>{i > 0 && dropPct > 0 && <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 8 }}>▼ {dropPct}%</span>}</span>
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
      <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 28px' }}>Funil casado pelo nome do anúncio (<b style={{ color: 'var(--text-muted)' }}>utm_content</b>): cliques do <b style={{ color: 'var(--text-muted)' }}>Meta</b> → WhatsApp (<b style={{ color: 'var(--text-muted)' }}>/wa</b>) → lead (<b style={{ color: 'var(--text-muted)' }}>CRM</b>). Visita/engajou/clicou (na tabela) vêm do <b style={{ color: 'var(--text-muted)' }}>rastreio do site</b>, que ainda cobre parte do tráfego — por isso podem ficar menores que o WhatsApp por enquanto.</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Diagnóstico por anúncio</h2>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 12px' }}>“Vazou em” = a etapa onde o anúncio mais perde gente. Aí você sabe se mexe no criativo, na página ou na oferta.</p>
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 40 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Anúncio', 'Invest', 'Impr', 'Cliques', 'CTR', 'Visitou', 'Clq→Vis', 'Engajou', 'Clicou', 'WhatsApp', 'Leads', 'CPL', 'Vazou em'].map(th)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={13} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no período.</td></tr>}
            {rows.map(r => {
              const lt = leitura(r)
              const cv = r.clicks ? Math.round((r.visitou / r.clicks) * 100) : null
              return (
                <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text)', maxWidth: 240 }}>{r.ad}<div style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.campaign}</div></td>
                  {tdNum(r.spend ? fmt(r.spend) : '—', 'var(--red)')}
                  {tdNum(r.impressions ? r.impressions.toLocaleString('pt-BR') : '—')}
                  {tdNum(r.clicks ? r.clicks.toLocaleString('pt-BR') : '—', '#f59e0b')}
                  {tdNum(r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(1) + '%' : '—')}
                  {tdNum(r.visitou, '#a78bfa')}
                  {tdNum(cv == null ? '—' : cv + '%', cv == null ? 'var(--text-faint)' : cv >= 60 ? 'var(--green)' : cv >= 30 ? 'var(--amber)' : 'var(--red)')}
                  {tdNum(r.engajou)}{tdNum(r.clicou, '#60a5fa')}{tdNum(r.whats)}{tdNum(r.leads, 'var(--green)')}
                  {tdNum(r.leads && r.spend ? fmt(r.spend / r.leads) : '—')}
                  {tdNum(lt.t, lt.c)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
