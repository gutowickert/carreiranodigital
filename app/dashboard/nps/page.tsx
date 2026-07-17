'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const corNps = (n: number) => n >= 50 ? 'var(--green)' : n >= 0 ? 'var(--amber)' : 'var(--red)'

export default function NPS() {
  const [d, setD] = useState<any>(null)
  const [turmas, setTurmas] = useState<any[]>([])
  const [copiado, setCopiado] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchAuth('/api/nps').then(r => r.json()),
      fetchAuth('/api/chamada').then(r => r.json()),
    ]).then(([nps, ch]) => { if (nps.ok) setD(nps); if (ch.ok) setTurmas(ch.turmas || []) }).finally(() => setCarregando(false))
  }, [])

  const th = (h: string, i: number) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 12px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
  const tdN = (v: any, cor?: string) => <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, color: cor || 'var(--text-2)' }}>{v}</td>
  const KPI = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || 'var(--text)', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
  const g = d?.geral

  return (
    <div style={{ padding: '32px 40px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>NPS</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 20px' }}>Avaliação anônima dos alunos. NPS = % promotores (9-10) − % detratores (0-6).</p>

      {carregando ? <div style={{ color: 'var(--text-faint)' }}>Carregando...</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KPI label="NPS Geral" valor={g?.n ? (g.nps > 0 ? '+' : '') + g.nps : '—'} cor={g?.n ? corNps(g.nps) : 'var(--text-faint)'} sub={`${g?.n || 0} respostas`} />
            <KPI label="Promotores" valor={g?.prom || 0} cor="var(--green)" />
            <KPI label="Neutros" valor={g?.neu || 0} cor="var(--amber)" />
            <KPI label="Detratores" valor={g?.det || 0} cor="var(--red)" />
            <KPI label="Média professor" valor={g?.mediaProf || '—'} />
            <KPI label="Média conteúdo" valor={g?.mediaConteudo || '—'} />
            <KPI label="Média estrutura" valor={g?.mediaEstrutura || '—'} />
          </div>

          {/* Links pra enviar */}
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Links de avaliação (manda no grupo da turma)</h2>
          <div style={{ ...card, padding: 14, marginBottom: 28, maxHeight: 240, overflowY: 'auto' }}>
            {turmas.map(t => {
              const link = typeof window !== 'undefined' ? `${window.location.origin}/avaliar/${t.id}` : ''
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, minWidth: 200 }}>{t.codigo}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t.produtos?.nome} · {t.cidades?.nome}</span>
                  <button onClick={() => { navigator.clipboard.writeText(link); setCopiado(t.id); setTimeout(() => setCopiado(''), 1500) }} style={{ marginLeft: 'auto', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-2)', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>{copiado === t.id ? '✓ copiado' : 'copiar link'}</button>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 28 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Por turma</h2>
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Turma', 'Resp.', 'NPS', 'Prof', 'Cont', 'Estr'].map(th)}</tr></thead>
                  <tbody>
                    {(d?.porTurma || []).length === 0 && <tr><td colSpan={6} style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)' }}>Sem respostas ainda.</td></tr>}
                    {(d?.porTurma || []).map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text)' }}>{r.turma}</td>
                        {tdN(r.n)}{tdN((r.nps > 0 ? '+' : '') + r.nps, corNps(r.nps))}{tdN(r.mediaProf)}{tdN(r.mediaConteudo)}{tdN(r.mediaEstrutura)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Por professor</h2>
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Professor', 'Resp.', 'NPS', 'Nota prof'].map(th)}</tr></thead>
                  <tbody>
                    {(d?.porProfessor || []).length === 0 && <tr><td colSpan={4} style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)' }}>Sem respostas ainda.</td></tr>}
                    {(d?.porProfessor || []).map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text)' }}>{r.professor}</td>
                        {tdN(r.n)}{tdN((r.nps > 0 ? '+' : '') + r.nps, corNps(r.nps))}{tdN(r.mediaProf)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Comentários</h2>
          <div style={{ ...card, padding: 16 }}>
            {(d?.comentarios || []).length === 0 ? <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhum comentário ainda.</span> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(d?.comentarios || []).map((c: any, i: number) => (
                  <div key={i} style={{ borderLeft: `3px solid ${corNps(c.nota >= 9 ? 100 : c.nota <= 6 ? -1 : 10)}`, paddingLeft: 12 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>“{c.comentario}”</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>nota {c.nota} · {c.turma}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
