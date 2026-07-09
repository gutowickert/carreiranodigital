'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

type Turma = { id: string; codigo: string; produto: string; cidade: string; data_inicio: string; data_fim: string }
type Nps = { n: number; nps: number; prom: number; neu: number; det: number; mediaProf: number; mediaConteudo: number; mediaEstrutura: number }
type Dia = { id: string; data: string; horario_inicio: string }
type Aluno = { matricula_id: string; nome: string }
type Presenca = { matricula_id: string; turma_data_id: string; presente: boolean }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const fmtData = (d: string) => { if (!d) return ''; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}` }

export default function PortalProfessor() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [nps, setNps] = useState<Nps | null>(null)
  const [comentarios, setComentarios] = useState<{ turma: string; nota: number; comentario: string }[]>([])

  // chamada da turma aberta
  const [aberta, setAberta] = useState<Turma | null>(null)
  const [dias, setDias] = useState<Dia[]>([])
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [pres, setPres] = useState<Record<string, boolean>>({}) // `${mat}|${dia}` -> presente

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }
      const { data: p } = await supabase.from('usuarios_perfil').select('nome, email, setor, papel').eq('id', session.user.id).single()
      if (!ativo) return
      if (!p || ((p as any).setor !== 'professor' && (p as any).papel !== 'professor')) { router.replace('/dashboard'); return }
      setNome(p.nome || ''); setEmail(p.email || '')
      const j = await fetch(`/api/professor?email=${encodeURIComponent(p.email)}`).then(r => r.json()).catch(() => null)
      if (!ativo) return
      if (!j?.ok) { setErro(j?.error || 'não encontrei seu cadastro de professor'); setCarregando(false); return }
      setTurmas(j.turmas || []); setNps(j.nps || null); setComentarios(j.comentarios || [])
      setCarregando(false)
    })()
    return () => { ativo = false }
  }, [router])

  async function abrirTurma(t: Turma) {
    if (aberta?.id === t.id) { setAberta(null); return }
    setAberta(t); setDias([]); setAlunos([]); setPres({})
    const j = await fetch(`/api/chamada?turma=${t.id}`).then(r => r.json()).catch(() => null)
    if (!j?.ok) return
    setDias(j.dias || [])
    setAlunos((j.alunos || []).map((a: any) => ({ matricula_id: a.matricula_id, nome: a.nome })))
    const map: Record<string, boolean> = {}
    for (const pr of (j.presencas || []) as Presenca[]) map[`${pr.matricula_id}|${pr.turma_data_id}`] = pr.presente
    setPres(map)
  }

  async function marcar(mat: string, dia: string) {
    const k = `${mat}|${dia}`; const novo = !pres[k]
    setPres(prev => ({ ...prev, [k]: novo }))
    await fetch('/api/chamada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'presenca', matricula_id: mat, turma_data_id: dia, presente: novo }) })
  }

  async function sair() { await supabase.auth.signOut(); router.replace('/login') }

  if (carregando) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-faint)' }}>Carregando...</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* topo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <Image src="/logo.png" alt="CarreiraNoDigital" width={150} height={44} style={{ objectFit: 'contain' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Prof. {nome}</span>
          <button onClick={sair} style={{ background: 'var(--surface-2)', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>Sair</button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Olá, {nome.split(' ')[0]} 👋</h1>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 20 }}>Suas turmas, a chamada e a avaliação dos alunos.</p>

        {erro && <div style={{ ...card, padding: 16, color: 'var(--red)', fontSize: 14, marginBottom: 20 }}>{erro} <span style={{ color: 'var(--text-faint)' }}>({email})</span></div>}

        {/* NPS do professor */}
        {nps && (
          <div style={{ ...card, padding: 18, marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>⭐ Sua avaliação (NPS) — {nps.n} resposta(s)</div>
            {nps.n === 0 ? <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Ainda sem respostas dos alunos.</span> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                <Kpi label="NPS" valor={String(nps.nps)} cor={nps.nps >= 50 ? 'var(--green)' : nps.nps >= 0 ? 'var(--amber)' : 'var(--red)'} />
                <Kpi label="Nota do professor" valor={nps.mediaProf ? nps.mediaProf.toFixed(1) : '-'} cor="var(--accent-soft)" />
                <Kpi label="Conteúdo" valor={nps.mediaConteudo ? nps.mediaConteudo.toFixed(1) : '-'} cor="var(--text-2)" />
                <Kpi label="Estrutura" valor={nps.mediaEstrutura ? nps.mediaEstrutura.toFixed(1) : '-'} cor="var(--text-2)" />
                <Kpi label="Promotores" valor={`${nps.prom}`} cor="var(--green)" />
                <Kpi label="Detratores" valor={`${nps.det}`} cor="var(--red)" />
              </div>
            )}
            {comentarios.length > 0 && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>Comentários dos alunos (anônimos)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {comentarios.map((c, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px' }}>
                      <span style={{ color: c.nota >= 9 ? 'var(--green)' : c.nota <= 6 ? 'var(--red)' : 'var(--amber)', fontWeight: 700, marginRight: 8 }}>{c.nota}</span>
                      {c.comentario}
                      {c.turma && <span style={{ color: 'var(--text-faint)', fontSize: 11, marginLeft: 6 }}>· {c.turma}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Turmas */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>📚 Minhas turmas</div>
        {turmas.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma turma vinculada a você.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {turmas.map(t => (
              <div key={t.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <button onClick={() => abrirTurma(t)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t.produto || t.codigo}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t.codigo} · {t.cidade} · {fmtData(t.data_inicio)} a {fmtData(t.data_fim)}</div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--accent-soft)' }}>{aberta?.id === t.id ? 'fechar ▾' : 'chamada ▸'}</span>
                </button>

                {aberta?.id === t.id && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 16, overflowX: 'auto' }}>
                    {alunos.length === 0 ? <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem alunos matriculados.</span> : (
                      <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-faint)', fontWeight: 500, position: 'sticky', left: 0, background: 'var(--surface)' }}>Aluno</th>
                            {dias.map(d => (
                              <th key={d.id} style={{ padding: '6px 8px', color: 'var(--text-faint)', fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' }}>{fmtData(d.data)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {alunos.map(a => (
                            <tr key={a.matricula_id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 10px', color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surface)' }}>{a.nome}</td>
                              {dias.map(d => {
                                const on = !!pres[`${a.matricula_id}|${d.id}`]
                                return (
                                  <td key={d.id} style={{ padding: '4px 8px', textAlign: 'center' }}>
                                    <button onClick={() => marcar(a.matricula_id, d.id)} title={on ? 'presente' : 'ausente'}
                                      style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-strong)', background: on ? 'var(--green)' : 'var(--surface-2)', color: '#fff', fontSize: 14, lineHeight: 1 }}>
                                      {on ? '✓' : ''}
                                    </button>
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>Clique no quadradinho pra marcar presença. Salva automático.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{valor}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
