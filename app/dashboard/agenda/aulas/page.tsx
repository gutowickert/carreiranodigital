'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import CalendarioBase, { EventoCalendario } from '@/components/CalendarioBase'
import { supabase } from '@/lib/supabase'

const CORES_TURMA = [
  '#7c3aed', '#2563eb', '#16a34a', '#dc2626', '#ea580c',
  '#0891b2', '#7c3aed', '#be185d', '#65a30d', '#7c3aed',
]

interface Filtros {
  professor_id: string
  turma_id: string
  sala_id: string
}

function parseLocal(iso: string): Date {
  if (!iso) return new Date()
  const clean = iso.replace('Z', '').split('+')[0].split('-00:00')[0]
  const [datePart, timePart] = clean.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [h, mi, s] = (timePart || '00:00:00').split(':').map(Number)
  return new Date(y, m - 1, d, h, mi || 0, s || 0)
}

export default function AgendaAulas() {
  const [eventos, setEventos] = useState<EventoCalendario[]>([])
  const [aulasRaw, setAulasRaw] = useState<any[]>([])
  const [professores, setProfessores] = useState<any[]>([])
  const [turmas, setTurmas] = useState<any[]>([])
  const [salas, setSalas] = useState<any[]>([])
  const [filtros, setFiltros] = useState<Filtros>({ professor_id: '', turma_id: '', sala_id: '' })
  const [modalAberto, setModalAberto] = useState(false)
  const [inicioSugerido, setInicioSugerido] = useState<Date>()
  const [fimSugerido, setFimSugerido] = useState<Date>()
  const [aulaEditando, setAulaEditando] = useState<any>(null)
  const [visao, setVisao] = useState<'calendario' | 'grade'>('calendario')
  const [mesGrade, setMesGrade] = useState(new Date().toISOString().slice(0, 7))

  async function carregarFiltros() {
    const [{ data: p }, { data: t }, { data: s }] = await Promise.all([
      supabase.from('professores').select('id, nome').order('nome'),
      supabase.from('turmas').select('id, codigo, produtos(nome), cidades(nome)').order('data_inicio', { ascending: false }),
      supabase.from('salas').select('id, nome').order('nome'),
    ])
    setProfessores(p || [])
    setTurmas((t || []).map((x: any) => ({
      id: x.id,
      nome: `${x.produtos?.nome || 'Turma'}${x.cidades?.nome ? ' - ' + x.cidades.nome : ''}${x.codigo ? ' (' + x.codigo + ')' : ''}`,
    })))
    setSalas(s || [])
  }

  async function carregar() {
    let query = supabase
      .from('agenda_aulas')
      .select(`
        *,
        turmas(id, codigo, produtos(nome), cidades(nome)),
        professores(id, nome),
        salas(id, nome)
      `)
      .order('inicio')

    if (filtros.professor_id) query = query.eq('professor_id', filtros.professor_id)
    if (filtros.turma_id) query = query.eq('turma_id', filtros.turma_id)
    if (filtros.sala_id) query = query.eq('sala_id', filtros.sala_id)

    const { data, error } = await query
    if (error) { console.error('Erro:', error); return }

    if (data) {
      setAulasRaw(data)
      const turmaIndex: Record<string, number> = {}
      let colorIdx = 0
      setEventos(data.map((a: any) => {
        if (a.turma_id && !(a.turma_id in turmaIndex)) {
          turmaIndex[a.turma_id] = colorIdx++ % CORES_TURMA.length
        }
        const cor = a.turma_id ? CORES_TURMA[turmaIndex[a.turma_id]] : '#7c3aed'
        const professor = a.professores?.nome || ''
        const sala = a.salas?.nome || ''
        const cidade = a.turmas?.cidades?.nome || ''
        const partes = [a.titulo, cidade, professor, sala].filter(Boolean)
        return {
          id: a.id,
          title: partes.join(' · '),
          start: parseLocal(a.inicio),
          end: parseLocal(a.fim),
          color: cor,
          resource: a,
        }
      }))
    }
  }

  useEffect(() => { carregarFiltros() }, [])
  useEffect(() => { carregar() }, [filtros])

  async function salvar(form: any) {
    const inicioStr = form.inicio.length === 16 ? form.inicio + ':00' : form.inicio
    const fimStr = form.fim.length === 16 ? form.fim + ':00' : form.fim

    if (form.id) {
      await supabase.from('agenda_aulas').update({
        titulo: form.titulo, turma_id: form.turma_id || null,
        professor_id: form.professor_id || null, sala_id: form.sala_id || null,
        inicio: inicioStr, fim: fimStr,
        recorrente: form.recorrente,
        regra_recorrencia: form.regra_recorrencia || null,
        descricao: form.descricao,
      }).eq('id', form.id)
    } else {
      await supabase.from('agenda_aulas').insert({
        titulo: form.titulo, turma_id: form.turma_id || null,
        professor_id: form.professor_id || null, sala_id: form.sala_id || null,
        inicio: inicioStr, fim: fimStr,
        recorrente: form.recorrente,
        regra_recorrencia: form.regra_recorrencia || null,
        descricao: form.descricao,
      })
    }
    setModalAberto(false); setAulaEditando(null); carregar()
  }

  async function excluir(id: string) {
    await supabase.from('agenda_aulas').delete().eq('id', id)
    setModalAberto(false); setAulaEditando(null); carregar()
  }

  const selectStyle = { background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 8, padding: '8px 12px', color: '#f4f4f5', fontSize: 13, cursor: 'pointer', outline: 'none' }

  // Aulas filtradas pelo mês (grade)
  const aulasMes = aulasRaw.filter((a: any) => {
    const d = parseLocal(a.inicio)
    const mesAula = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return mesAula === mesGrade
  }).sort((a: any, b: any) => a.inicio.localeCompare(b.inicio))

  function abrirEdicao(r: any) {
    function fmt(d: Date) {
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setAulaEditando({
      id: r.id, titulo: r.titulo,
      turma_id: r.turma_id || '', professor_id: r.professor_id || '', sala_id: r.sala_id || '',
      inicio: fmt(parseLocal(r.inicio)), fim: fmt(parseLocal(r.fim)),
      recorrente: r.recorrente || false, regra_recorrencia: r.regra_recorrencia || '',
      descricao: r.descricao || '',
    })
    setModalAberto(true)
  }

  function fmtHora(d: Date) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5' }}>Agenda de Aulas</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Clique em um horario para agendar uma aula</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setVisao('calendario')}
                style={{ padding: '8px 16px', background: visao === 'calendario' ? '#7c3aed' : 'transparent', color: visao === 'calendario' ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Calendário
              </button>
              <button onClick={() => setVisao('grade')}
                style={{ padding: '8px 16px', background: visao === 'grade' ? '#7c3aed' : 'transparent', color: visao === 'grade' ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Grade
              </button>
            </div>
            <button
              onClick={() => { setAulaEditando(null); setInicioSugerido(new Date()); setFimSugerido(new Date()); setModalAberto(true) }}
              style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              + Nova aula
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <select style={selectStyle} value={filtros.professor_id} onChange={e => setFiltros(f => ({ ...f, professor_id: e.target.value }))}>
            <option value="">Todos os professores</option>
            {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select style={selectStyle} value={filtros.turma_id} onChange={e => setFiltros(f => ({ ...f, turma_id: e.target.value }))}>
            <option value="">Todas as turmas</option>
            {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select style={selectStyle} value={filtros.sala_id} onChange={e => setFiltros(f => ({ ...f, sala_id: e.target.value }))}>
            <option value="">Todas as salas</option>
            {salas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          {visao === 'grade' && (
            <input type="month" value={mesGrade} onChange={e => setMesGrade(e.target.value)} style={selectStyle} />
          )}
          {(filtros.professor_id || filtros.turma_id || filtros.sala_id) && (
            <button onClick={() => setFiltros({ professor_id: '', turma_id: '', sala_id: '' })}
              style={{ ...selectStyle, background: 'transparent', color: '#9ca3af', border: '1px solid #3a3a3c' }}>
              Limpar filtros
            </button>
          )}
        </div>

        {visao === 'calendario' ? (
          <CalendarioBase
            eventos={eventos}
            onSlotSelect={(inicio, fim) => { setAulaEditando(null); setInicioSugerido(inicio); setFimSugerido(fim); setModalAberto(true) }}
            onEventClick={(evento) => abrirEdicao(evento.resource)}
          />
        ) : (
          <div style={{ background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #3a3a3c', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5' }}>
                {aulasMes.length} aula(s) em {new Date(mesGrade + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            {aulasMes.length === 0 ? (
              <p style={{ padding: 24, fontSize: 13, color: '#6b7280' }}>Nenhuma aula neste mês.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3c', background: '#1c1c1e' }}>
                    {['Dia', 'Horário', 'Produto', 'Cidade', 'Sala', 'Professor'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aulasMes.map((a: any) => {
                    const inicio = parseLocal(a.inicio)
                    const fim = parseLocal(a.fim)
                    return (
                      <tr key={a.id} onClick={() => abrirEdicao(a)}
                        style={{ borderBottom: '1px solid #3a3a3c', cursor: 'pointer' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#f4f4f5', fontWeight: 500 }}>
                          {inicio.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#a78bfa', fontFamily: 'monospace' }}>
                          {fmtHora(inicio)} - {fmtHora(fim)}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#f4f4f5' }}>
                          {a.turmas?.produtos?.nome || a.titulo}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#9ca3af' }}>
                          {a.turmas?.cidades?.nome || '-'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#9ca3af' }}>
                          {a.salas?.nome || '-'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#9ca3af' }}>
                          {a.professores?.nome || '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {modalAberto && (
          <ModalAula aberto={modalAberto} aula={aulaEditando} inicioSugerido={inicioSugerido} fimSugerido={fimSugerido}
            professores={professores} turmas={turmas} salas={salas}
            onSalvar={salvar} onExcluir={excluir} onFechar={() => { setModalAberto(false); setAulaEditando(null) }} />
        )}
      </div>
    </Layout>
  )
}

interface ModalAulaProps {
  aberto: boolean; aula?: any; inicioSugerido?: Date; fimSugerido?: Date
  professores: any[]; turmas: any[]; salas: any[]
  onSalvar: (form: any) => void; onExcluir?: (id: string) => void; onFechar: () => void
}

function toInputDatetime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function ModalAula({ aberto, aula, inicioSugerido, fimSugerido, professores, turmas, salas, onSalvar, onExcluir, onFechar }: ModalAulaProps) {
  const [form, setForm] = useState<any>({ titulo: '', turma_id: '', professor_id: '', sala_id: '', inicio: '', fim: '', recorrente: false, regra_recorrencia: '', descricao: '' })
  const [conflito, setConflito] = useState(false)

  useEffect(() => {
    if (aula) setForm(aula)
    else setForm({
      titulo: '', turma_id: '', professor_id: '', sala_id: '',
      inicio: inicioSugerido ? toInputDatetime(inicioSugerido) : '',
      fim: fimSugerido ? toInputDatetime(fimSugerido) : '',
      recorrente: false, regra_recorrencia: '', descricao: '',
    })
    setConflito(false)
  }, [aula, inicioSugerido, fimSugerido, aberto])

  useEffect(() => {
    if (form.sala_id && form.inicio && form.fim) verificarConflito()
  }, [form.sala_id, form.inicio, form.fim])

  async function verificarConflito() {
    let query = supabase.from('agenda_aulas').select('id')
      .eq('sala_id', form.sala_id).lt('inicio', form.fim).gt('fim', form.inicio)
    if (form.id) query = query.neq('id', form.id)
    const { data } = await query
    setConflito((data?.length || 0) > 0)
  }

  if (!aberto) return null

  const inputStyle = { background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, padding: '8px 12px', color: '#f4f4f5', fontSize: 14, outline: 'none', width: '100%' }
  const labelStyle = { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' as const }

  const diasSemana = [
    { value: 'mon', label: 'Seg' }, { value: 'tue', label: 'Ter' },
    { value: 'wed', label: 'Qua' }, { value: 'thu', label: 'Qui' },
    { value: 'fri', label: 'Sex' }, { value: 'sat', label: 'Sab' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 12, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5' }}>{aula?.id ? 'Editar aula' : 'Nova aula'}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 20, cursor: 'pointer' }}>x</button>
        </div>

        <div>
          <label style={labelStyle}>Titulo</label>
          <input style={inputStyle} value={form.titulo} onChange={e => setForm((f: any) => ({ ...f, titulo: e.target.value }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Turma</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.turma_id} onChange={e => setForm((f: any) => ({ ...f, turma_id: e.target.value }))}>
              <option value="">—</option>
              {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Professor</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.professor_id} onChange={e => setForm((f: any) => ({ ...f, professor_id: e.target.value }))}>
              <option value="">—</option>
              {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sala</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.sala_id} onChange={e => setForm((f: any) => ({ ...f, sala_id: e.target.value }))}>
              <option value="">—</option>
              {salas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
        </div>

        {conflito && (
          <div style={{ background: '#3a1a1a', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444' }}>
            Sala ocupada neste horario - escolha outro horario ou outra sala.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Inicio</label>
            <input type="datetime-local" style={inputStyle} value={form.inicio} onChange={e => setForm((f: any) => ({ ...f, inicio: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Fim</label>
            <input type="datetime-local" style={inputStyle} value={form.fim} onChange={e => setForm((f: any) => ({ ...f, fim: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" id="recorrente" checked={form.recorrente} onChange={e => setForm((f: any) => ({ ...f, recorrente: e.target.checked }))} style={{ accentColor: '#7c3aed', width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="recorrente" style={{ fontSize: 13, color: '#9ca3af', cursor: 'pointer' }}>Aula recorrente (semanal)</label>
        </div>

        {form.recorrente && (
          <div>
            <label style={labelStyle}>Dias da semana</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {diasSemana.map(d => {
                const selecionado = form.regra_recorrencia?.includes(d.value)
                return (
                  <button key={d.value}
                    onClick={() => {
                      const dias = form.regra_recorrencia ? form.regra_recorrencia.split(',').filter(Boolean) : []
                      const novos = selecionado ? dias.filter((x: string) => x !== d.value) : [...dias, d.value]
                      setForm((f: any) => ({ ...f, regra_recorrencia: novos.join(',') }))
                    }}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + (selecionado ? '#7c3aed' : '#3a3a3c'), background: selecionado ? '#2d1f4a' : 'transparent', color: selecionado ? '#a78bfa' : '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <label style={labelStyle}>Descricao (opcional)</label>
          <input style={inputStyle} value={form.descricao} onChange={e => setForm((f: any) => ({ ...f, descricao: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {aula?.id && onExcluir && (
            <button onClick={() => onExcluir(aula.id)}
              style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontSize: 13, cursor: 'pointer' }}>
              Excluir
            </button>
          )}
          <button onClick={onFechar}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #3a3a3c', background: 'transparent', color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={() => !conflito && onSalvar(form)} disabled={conflito}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: conflito ? '#3a3a3c' : '#7c3aed', color: conflito ? '#6b7280' : '#fff', fontSize: 13, fontWeight: 600, cursor: conflito ? 'not-allowed' : 'pointer' }}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}