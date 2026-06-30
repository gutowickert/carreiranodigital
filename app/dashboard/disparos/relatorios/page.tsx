'use client'

import { useEffect, useState, Fragment } from 'react'
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, Legend } from 'recharts'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const th = { padding: '8px 10px', fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', textAlign: 'left' } as React.CSSProperties
const td = { padding: '8px 10px', fontSize: 13, color: 'var(--text-2)', borderTop: '1px solid var(--border)' } as React.CSSProperties

type Campanha = {
  id: string; nome: string; template: string | null; categoria: string | null; status: string; criado_em: string
  contatos: number; enviados: number; entregues: number; lidos: number; falhas: number; respostas: number; custo: number
}

export default function RelatorioDisparos() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<string | null>(null)
  const [respostas, setRespostas] = useState<any[]>([])
  const [carregandoResp, setCarregandoResp] = useState(false)

  useEffect(() => {
    fetch('/api/wa-oficial/relatorio').then(r => r.json()).then(j => {
      if (j.ok) setCampanhas(j.campanhas || [])
    }).finally(() => setCarregando(false))
  }, [])

  async function abrir(id: string) {
    if (aberta === id) { setAberta(null); return }
    setAberta(id); setRespostas([]); setCarregandoResp(true)
    const j = await fetch('/api/wa-oficial/relatorio?disparo=' + id).then(r => r.json())
    setRespostas(j.respostas || [])
    setCarregandoResp(false)
  }

  const fmtData = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // ---- panorama (totais + por campanha) ----
  const tot = campanhas.reduce((a, c) => ({ enviados: a.enviados + (c.enviados || 0), entregues: a.entregues + (c.entregues || 0), lidos: a.lidos + (c.lidos || 0), respostas: a.respostas + (c.respostas || 0), falhas: a.falhas + (c.falhas || 0) }), { enviados: 0, entregues: 0, lidos: 0, respostas: 0, falhas: 0 })
  const taxaEntrega = tot.enviados ? tot.entregues / tot.enviados : 0
  const taxaLeitura = tot.entregues ? tot.lidos / tot.entregues : 0
  const taxaResposta = tot.lidos ? tot.respostas / tot.lidos : 0
  const pctv = (v: number) => (v * 100).toFixed(0) + '%'
  const funilData = [
    { etapa: 'Enviados', valor: tot.enviados, cor: '#9ca3af' },
    { etapa: 'Entregues', valor: tot.entregues, cor: '#60a5fa' },
    { etapa: 'Lidos', valor: tot.lidos, cor: '#34d399' },
    { etapa: 'Respostas', valor: tot.respostas, cor: '#7c3aed' },
  ]
  const campanhaData = campanhas.slice(0, 10).map(c => ({ nome: (c.nome || '').length > 20 ? c.nome.slice(0, 20) + '…' : (c.nome || '(sem nome)'), Lidos: c.lidos || 0, Respostas: c.respostas || 0 }))
  const tipProps = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }, itemStyle: { color: 'var(--text)' }, labelStyle: { color: 'var(--text-faint)' } }
  const Kpi = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--text)', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ padding: '32px clamp(12px, 4vw, 40px)', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Relatório de Disparos</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 20px' }}>Resultado de cada campanha: entrega, leitura, falhas, respostas e custo. Clique numa campanha pra ver quem respondeu.</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Kpi label="Enviados" valor={tot.enviados} />
        <Kpi label="Taxa de entrega" valor={pctv(taxaEntrega)} cor="var(--blue)" />
        <Kpi label="Taxa de leitura" valor={pctv(taxaLeitura)} cor="var(--green)" />
        <Kpi label="Respostas" valor={tot.respostas} cor="var(--accent-soft)" sub={`${pctv(taxaResposta)} dos lidos`} />
      </div>

      {/* Panorama visual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Funil de entrega</div>
          {tot.enviados === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem disparos ainda.</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funilData} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="etapa" width={86} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} {...tipProps} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={22} label={{ position: 'right', fill: 'var(--text-2)', fontSize: 11, fontWeight: 600 }}>
                  {funilData.map((f, i) => <Cell key={i} fill={f.cor} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Leitura × Respostas por campanha</div>
          {campanhaData.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem campanhas.</p> : (
            <ResponsiveContainer width="100%" height={Math.max(200, campanhaData.length * 34)}>
              <BarChart data={campanhaData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} {...tipProps} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Lidos" fill="#34d399" radius={[0, 3, 3, 0]} barSize={8} />
                <Bar dataKey="Respostas" fill="#7c3aed" radius={[0, 3, 3, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Campanha</th><th style={th}>Data</th><th style={th}>Contatos</th>
              <th style={th}>Enviados</th><th style={th}>Entregues</th><th style={th}>Lidos</th>
              <th style={th}>Falhas</th><th style={th}>Respostas</th><th style={th}>Custo</th>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td style={td} colSpan={9}>Carregando...</td></tr>}
            {!carregando && campanhas.length === 0 && <tr><td style={td} colSpan={9}>Nenhuma campanha ainda.</td></tr>}
            {campanhas.map(c => (
              <Fragment key={c.id}>
                <tr onClick={() => abrir(c.id)} style={{ cursor: 'pointer', background: aberta === c.id ? 'var(--surface-sel)' : 'transparent' }}>
                  <td style={td}>
                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>{aberta === c.id ? '▾ ' : '▸ '}{c.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.template || '—'} · {c.categoria || '—'}</div>
                  </td>
                  <td style={td}>{fmtData(c.criado_em)}</td>
                  <td style={td}>{c.contatos}</td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{c.enviados}</td>
                  <td style={{ ...td, color: 'var(--blue)' }}>{c.entregues}</td>
                  <td style={{ ...td, color: 'var(--green)' }}>{c.lidos}</td>
                  <td style={{ ...td, color: c.falhas ? 'var(--red)' : 'var(--text-faint)' }}>{c.falhas}</td>
                  <td style={{ ...td, color: 'var(--accent-soft)', fontWeight: 700 }}>{c.respostas}</td>
                  <td style={td}>{brl(c.custo)}</td>
                </tr>
                {aberta === c.id && (
                  <tr>
                    <td style={{ ...td, background: 'var(--surface-sel)' }} colSpan={9}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Quem respondeu ({c.respostas}):</div>
                      {carregandoResp ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Carregando...</div>
                        : respostas.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ninguém respondeu essa campanha ainda.</div>
                        : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {respostas.map((r, i) => (
                              <a key={i} href="/dashboard/whatsapp-disparos" title="Abrir caixa de disparos"
                                style={{ ...card, padding: '6px 10px', textDecoration: 'none', color: 'var(--text-2)', fontSize: 12 }}>
                                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{r.nome || r.telefone}</span>
                                <span style={{ color: 'var(--text-faint)' }}> · {fmtData(r.respondeu_em)}</span>
                              </a>
                            ))}
                          </div>
                        )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>Funil: <b>Enviados</b> = saíram ok · <b>Entregues</b> = chegaram · <b>Lidos</b> = abriram · <b>Respostas</b> = responderam (caem em WhatsApp Disparos).</p>
    </div>
  )
}
