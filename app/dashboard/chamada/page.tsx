'use client'

import { useEffect, useState } from 'react'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--text)', outline: 'none' } as React.CSSProperties

type Dia = { id: string; data: string; horario_inicio: string | null; modulo_id: string | null }
type Aluno = { matricula_id: string; nome: string; nicho: string; ja_rodava_anuncios: boolean | null; rodou_campanha: boolean | null; gerou_lead: boolean | null; vendeu: boolean | null; concluido: boolean | null }
const fmt = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0

export default function Chamada() {
  const [turmas, setTurmas] = useState<any[]>([])
  const [turmaId, setTurmaId] = useState('')
  const [turma, setTurma] = useState<any>(null)
  const [dias, setDias] = useState<Dia[]>([])
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [pres, setPres] = useState<Record<string, boolean>>({}) // matricula|data -> presente
  const [carregando, setCarregando] = useState(false)

  useEffect(() => { fetch('/api/chamada').then(r => r.json()).then(j => { if (j.ok) setTurmas(j.turmas || []) }) }, [])

  useEffect(() => {
    if (!turmaId) return
    setCarregando(true)
    fetch(`/api/chamada?turma=${turmaId}`).then(r => r.json()).then(j => {
      if (j.ok) {
        setTurma(j.turma); setDias(j.dias || []); setAlunos(j.alunos || [])
        const p: Record<string, boolean> = {}
        for (const x of (j.presencas || [])) p[`${x.matricula_id}|${x.turma_data_id}`] = x.presente
        setPres(p)
      }
    }).finally(() => setCarregando(false))
  }, [turmaId])

  function togglePresenca(mat: string, dia: string) {
    const k = `${mat}|${dia}`, novo = !pres[k]
    setPres(p => ({ ...p, [k]: novo }))
    fetch('/api/chamada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'presenca', matricula_id: mat, turma_data_id: dia, presente: novo }) }).catch(() => {})
  }
  function ciclo(a: Aluno, campo: keyof Aluno) {
    const atual = a[campo] as boolean | null
    const novo = atual === null || atual === undefined ? true : atual === true ? false : null
    setAlunos(prev => prev.map(x => x.matricula_id === a.matricula_id ? { ...x, [campo]: novo } : x))
    fetch('/api/chamada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'acompanhamento', matricula_id: a.matricula_id, campo, valor: novo }) }).catch(() => {})
  }
  function setNicho(a: Aluno, v: string) {
    setAlunos(prev => prev.map(x => x.matricula_id === a.matricula_id ? { ...x, nicho: v } : x))
  }
  function salvaNicho(a: Aluno) {
    fetch('/api/chamada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'acompanhamento', matricula_id: a.matricula_id, campo: 'nicho', valor: a.nicho }) }).catch(() => {})
  }

  const presDe = (mat: string) => dias.filter(d => pres[`${mat}|${d.id}`]).length
  // resumo
  const n = alunos.length
  const presMedia = n && dias.length ? Math.round(alunos.reduce((s, a) => s + pct(presDe(a.matricula_id), dias.length), 0) / n) : 0
  const cont = (campo: keyof Aluno) => alunos.filter(a => a[campo] === true).length

  const Tri = ({ v, onClick }: { v: boolean | null; onClick: () => void }) => (
    <button onClick={onClick} style={{ width: 46, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 0', cursor: 'pointer', fontSize: 11, fontWeight: 700,
      background: v === true ? 'rgba(16,185,129,0.15)' : v === false ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)',
      color: v === true ? 'var(--green)' : v === false ? 'var(--red)' : 'var(--text-faint)' }}>
      {v === true ? 'Sim' : v === false ? 'Não' : '—'}
    </button>
  )
  const th = { padding: '8px 8px', fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const, textAlign: 'center' as const }
  const KPI = ({ label, valor, cor }: any) => (
    <div style={{ ...card, padding: '12px 14px', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--text)', marginTop: 4 }}>{valor}</div>
    </div>
  )

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Chamada</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Presença por dia + acompanhamento do aluno. Salva sozinho.</p>
        </div>
        <select value={turmaId} onChange={e => setTurmaId(e.target.value)} style={{ ...inp, cursor: 'pointer', minWidth: 320 }}>
          <option value="">Escolha a turma...</option>
          {turmas.map(t => <option key={t.id} value={t.id}>{t.codigo} — {t.produtos?.nome} ({t.cidades?.nome})</option>)}
        </select>
      </div>

      {!turmaId ? <div style={{ ...card, padding: 24, color: 'var(--text-faint)', fontSize: 13 }}>Escolhe uma turma pra fazer a chamada.</div>
        : carregando ? <div style={{ color: 'var(--text-faint)' }}>Carregando...</div> : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <KPI label="Alunos" valor={n} />
              <KPI label="Presença média" valor={presMedia + '%'} cor="var(--blue)" />
              <KPI label="Concluíram" valor={`${cont('concluido')}/${n}`} cor="var(--green)" />
              <KPI label="Rodou campanha" valor={pct(cont('rodou_campanha'), n) + '%'} />
              <KPI label="Gerou lead" valor={pct(cont('gerou_lead'), n) + '%'} cor="var(--accent-soft)" />
              <KPI label="Vendeu" valor={pct(cont('vendeu'), n) + '%'} cor="var(--green)" />
            </div>

            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface)', minWidth: 180 }}>Aluno</th>
                  {dias.map(d => <th key={d.id} style={th}>{fmt(d.data)}</th>)}
                  <th style={th}>Pres.</th>
                  <th style={th}>Anúncios<br />(antes)</th>
                  <th style={th}>Rodou<br />campanha</th>
                  <th style={th}>Gerou<br />lead</th>
                  <th style={th}>Vendeu</th>
                  <th style={th}>Concluiu</th>
                  <th style={{ ...th, textAlign: 'left' }}>Nicho / negócio</th>
                </tr></thead>
                <tbody>
                  {alunos.map(a => {
                    const p = presDe(a.matricula_id), pp = pct(p, dias.length)
                    return (
                      <tr key={a.matricula_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', fontSize: 13, color: 'var(--text)', position: 'sticky', left: 0, background: 'var(--surface)', fontWeight: 600 }}>{a.nome}</td>
                        {dias.map(d => {
                          const on = !!pres[`${a.matricula_id}|${d.id}`]
                          return <td key={d.id} style={{ textAlign: 'center', padding: '4px' }}>
                            <button onClick={() => togglePresenca(a.matricula_id, d.id)} style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${on ? 'var(--green)' : 'var(--border)'}`, background: on ? 'var(--green)' : 'transparent', color: '#062', fontWeight: 900, cursor: 'pointer', fontSize: 14 }}>{on ? '✓' : ''}</button>
                          </td>
                        })}
                        <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: pp >= 75 ? 'var(--green)' : pp >= 50 ? 'var(--amber)' : 'var(--red)' }}>{pp}%</td>
                        <td style={{ textAlign: 'center', padding: '4px' }}><Tri v={a.ja_rodava_anuncios} onClick={() => ciclo(a, 'ja_rodava_anuncios')} /></td>
                        <td style={{ textAlign: 'center', padding: '4px' }}><Tri v={a.rodou_campanha} onClick={() => ciclo(a, 'rodou_campanha')} /></td>
                        <td style={{ textAlign: 'center', padding: '4px' }}><Tri v={a.gerou_lead} onClick={() => ciclo(a, 'gerou_lead')} /></td>
                        <td style={{ textAlign: 'center', padding: '4px' }}><Tri v={a.vendeu} onClick={() => ciclo(a, 'vendeu')} /></td>
                        <td style={{ textAlign: 'center', padding: '4px' }}><Tri v={a.concluido} onClick={() => ciclo(a, 'concluido')} /></td>
                        <td style={{ padding: '4px 8px' }}><input value={a.nicho} onChange={e => setNicho(a, e.target.value)} onBlur={() => salvaNicho(a)} placeholder="ex: Barbearia" style={{ ...inp, padding: '5px 8px', fontSize: 12, width: 170 }} /></td>
                      </tr>
                    )
                  })}
                  {alunos.length === 0 && <tr><td colSpan={dias.length + 8} style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Nenhum aluno matriculado nessa turma.</td></tr>}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>Clique nos quadradinhos pra marcar presença. Os campos Sim/Não ciclam: — → Sim → Não. Tudo salva automático. “Concluiu” libera o certificado (próxima etapa).</p>
          </>
        )}
    </div>
  )
}
