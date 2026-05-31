'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Aluno = {
  id: string
  nome: string
  email: string
  whatsapp: string
  cidade: string
  estado: string
  como_conheceu: string
  ltv: number
  criado_em: string
  matriculas: {
    id: string
    status: string
    valor_pago: number
    data_compra: string
    forma_pagamento: string
    turmas: {
      produtos: { nome: string }
      cidades: { nome: string }
      data_inicio: string
    }
  }[]
}

type Turma = { id: string; produtos: { nome: string }; cidades: { nome: string }; data_inicio: string }

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Alunos() {
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [selecionado, setSelecionado] = useState<Aluno | null>(null)
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [novoAluno, setNovoAluno] = useState(false)
  const [novaMatricula, setNovaMatricula] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const [aNome, setANome] = useState('')
  const [aEmail, setAEmail] = useState('')
  const [aWhatsapp, setAWhatsapp] = useState('')
  const [aCidade, setACidade] = useState('')
  const [aEstado, setAEstado] = useState('')
  const [aConheceu, setAConheceu] = useState('outro')
  const [mTurmaId, setMTurmaId] = useState('')
  const [mValor, setMValor] = useState('')
  const [mData, setMData] = useState('')
  const [mFormaPagamento, setMFormaPagamento] = useState('pix')

  useEffect(() => { carregarAlunos(); carregarTurmas() }, [])

  async function carregarAlunos() {
    setCarregando(true)
    const { data } = await supabase.from('alunos').select('*, matriculas(id, status, valor_pago, data_compra, forma_pagamento, turmas(produtos(nome), cidades(nome), data_inicio))').order('criado_em', { ascending: false })
    if (data) setAlunos(data)
    setCarregando(false)
  }

  async function carregarTurmas() {
    const { data } = await supabase.from('turmas').select('id, produtos(nome), cidades(nome), data_inicio').order('data_inicio', { ascending: false })
    if (data) setTurmas(data as any)
  }

  async function salvarAluno(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    const { error } = await supabase.from('alunos').insert({ nome: aNome, email: aEmail, whatsapp: aWhatsapp, cidade: aCidade, estado: aEstado, como_conheceu: aConheceu })
    if (!error) { setNovoAluno(false); setANome(''); setAEmail(''); setAWhatsapp(''); setACidade(''); setAEstado(''); carregarAlunos() }
    else setMensagem('Erro: ' + error.message)
    setSalvando(false)
  }

  async function salvarMatricula(e: React.FormEvent) {
    e.preventDefault(); if (!selecionado) return; setSalvando(true)
    const { error } = await supabase.from('matriculas').insert({ aluno_id: selecionado.id, turma_id: mTurmaId, valor_pago: parseFloat(mValor), data_compra: mData, forma_pagamento: mFormaPagamento, status: 'ativa' })
    if (!error) {
      const novoLtv = (selecionado.ltv || 0) + parseFloat(mValor)
      await supabase.from('alunos').update({ ltv: novoLtv }).eq('id', selecionado.id)
      const { data: ft } = await supabase.from('financeiro_turma').select('receita_realizada').eq('turma_id', mTurmaId).single()
      if (ft) await supabase.from('financeiro_turma').update({ receita_realizada: (ft.receita_realizada || 0) + parseFloat(mValor) }).eq('turma_id', mTurmaId)
      setMTurmaId(''); setMValor(''); setMData(''); setNovaMatricula(false); carregarAlunos()
    }
    setSalvando(false)
  }

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  const alunosFiltrados = alunos.filter(a =>
    a.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    a.email?.toLowerCase().includes(busca.toLowerCase()) ||
    a.whatsapp?.includes(busca)
  )

  const totalLtv = alunos.reduce((s, a) => s + (a.ltv || 0), 0)
  const totalMatriculas = alunos.reduce((s, a) => s + (a.matriculas?.length || 0), 0)
  const recompradores = alunos.filter(a => (a.matriculas?.length || 0) > 1).length

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Alunos</h1>
        <button onClick={() => setNovoAluno(!novoAluno)} style={btnPrimary}>+ Novo aluno</button>
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total de alunos', val: alunos.length, cor: '#ffffff' },
          { label: 'Matrículas', val: totalMatriculas, cor: '#ffffff' },
          { label: 'Fizeram 2+ cursos', val: recompradores, cor: '#a78bfa' },
          { label: 'LTV total', val: fmt(totalLtv), cor: '#34d399' },
        ].map(item => (
          <div key={item.label} style={card}>
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: '26px', fontWeight: '700', color: item.cor }}>{item.val}</div>
              <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Form novo aluno */}
      {novoAluno && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Cadastrar novo aluno</div>
          <form onSubmit={salvarAluno}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', marginBottom: '12px' }}>
              <input value={aNome} onChange={e => setANome(e.target.value)} placeholder="Nome completo *" required style={input} />
              <input value={aWhatsapp} onChange={e => setAWhatsapp(e.target.value)} placeholder="WhatsApp" style={{ ...input, width: '160px' }} />
              <input value={aEmail} onChange={e => setAEmail(e.target.value)} placeholder="E-mail" type="email" style={{ ...input, width: '200px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', marginBottom: '16px' }}>
              <input value={aCidade} onChange={e => setACidade(e.target.value)} placeholder="Cidade" style={input} />
              <input value={aEstado} onChange={e => setAEstado(e.target.value)} placeholder="UF" maxLength={2} style={{ ...input, width: '60px' }} />
              <select value={aConheceu} onChange={e => setAConheceu(e.target.value)} style={select}>
                <option value="anuncio_meta">Meta Ads</option>
                <option value="anuncio_google">Google Ads</option>
                <option value="formulario">Formulário</option>
                <option value="indicacao">Indicação</option>
                <option value="organico">Orgânico</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setNovoAluno(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Salvando...' : 'Cadastrar'}</button>
            </div>
            {mensagem && <p style={{ marginTop: '8px', fontSize: '13px', color: '#f87171' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Lista */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou WhatsApp..."
            style={{ ...input, marginBottom: '16px' }} />

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #3a3a3c' }}>
              <span style={{ fontSize: '13px', color: '#9ca3af' }}>{alunosFiltrados.length} aluno{alunosFiltrados.length !== 1 ? 's' : ''}</span>
            </div>
            {carregando ? <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Carregando...</p>
              : alunosFiltrados.length === 0 ? <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhum aluno ainda.</p>
              : alunosFiltrados.map(a => (
                <div key={a.id} onClick={() => setSelecionado(a)}
                  style={{ padding: '14px 24px', borderBottom: '1px solid #3a3a3c', cursor: 'pointer', backgroundColor: selecionado?.id === a.id ? '#2e1065' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>{a.nome}</span>
                        {(a.matriculas?.length || 0) > 1 && (
                          <span style={{ fontSize: '11px', backgroundColor: '#2e1065', color: '#a78bfa', padding: '2px 8px', borderRadius: '20px' }}>recorrente</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', display: 'flex', gap: '12px' }}>
                        {a.whatsapp && <span>📱 {a.whatsapp}</span>}
                        {a.cidade && <span>📍 {a.cidade}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#34d399' }}>{fmt(a.ltv)}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{a.matriculas?.length || 0} curso{(a.matriculas?.length || 0) !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Painel aluno */}
        {selecionado && (
          <div style={{ width: '300px', flexShrink: 0 }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #3a3a3c' }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff' }}>{selecionado.nome}</div>
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selecionado.whatsapp && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📱 {selecionado.whatsapp}</span>
                      <a href={`https://wa.me/55${selecionado.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: '11px', color: '#4ade80', textDecoration: 'none' }}>WhatsApp ↗</a>
                    </div>
                  )}
                  {selecionado.email && <div>✉️ {selecionado.email}</div>}
                  {selecionado.cidade && <div>📍 {selecionado.cidade}{selecionado.estado ? `, ${selecionado.estado}` : ''}</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                  <div style={{ backgroundColor: '#052e16', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#34d399' }}>{fmt(selecionado.ltv)}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>LTV</div>
                  </div>
                  <div style={{ backgroundColor: '#1e1b4b', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#a78bfa' }}>{selecionado.matriculas?.length || 0}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>Cursos</div>
                  </div>
                </div>
              </div>

              {/* Cursos */}
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cursos</span>
                  <button onClick={() => setNovaMatricula(!novaMatricula)} style={{ fontSize: '12px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>+ Matricular</button>
                </div>

                {novaMatricula && (
                  <form onSubmit={salvarMatricula} style={{ backgroundColor: '#3a3a3c', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                    <select value={mTurmaId} onChange={e => setMTurmaId(e.target.value)} required style={{ ...select, fontSize: '12px', marginBottom: '8px' }}>
                      <option value="">Selecione a turma</option>
                      {turmas.map(t => (
                        <option key={t.id} value={t.id}>{t.produtos?.nome} — {t.cidades?.nome} · {t.data_inicio ? new Date(t.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</option>
                      ))}
                    </select>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <input value={mValor} onChange={e => setMValor(e.target.value)} placeholder="Valor R$" type="number" required style={{ ...input, fontSize: '12px', padding: '6px 10px' }} />
                      <input value={mData} onChange={e => setMData(e.target.value)} type="date" required style={{ ...input, fontSize: '12px', padding: '6px 10px' }} />
                    </div>
                    <select value={mFormaPagamento} onChange={e => setMFormaPagamento(e.target.value)} style={{ ...select, fontSize: '12px', marginBottom: '8px' }}>
                      <option value="pix">PIX</option>
                      <option value="cartao">Cartão</option>
                      <option value="boleto">Boleto</option>
                      <option value="transferencia">Transferência</option>
                      <option value="dinheiro">Dinheiro</option>
                    </select>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" onClick={() => setNovaMatricula(false)} style={{ ...btnSecondary, flex: 1, fontSize: '12px', padding: '6px' }}>Cancelar</button>
                      <button type="submit" disabled={salvando} style={{ ...btnPrimary, flex: 1, fontSize: '12px', padding: '6px' }}>Matricular</button>
                    </div>
                  </form>
                )}

                {!selecionado.matriculas || selecionado.matriculas.length === 0
                  ? <p style={{ fontSize: '12px', color: '#6b7280' }}>Nenhuma matrícula.</p>
                  : selecionado.matriculas.map(m => (
                    <div key={m.id} style={{ backgroundColor: '#3a3a3c', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#ffffff' }}>{m.turmas?.produtos?.nome}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>
                            {m.turmas?.cidades?.nome}{m.turmas?.data_inicio ? ` · ${new Date(m.turmas.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#34d399' }}>{fmt(m.valor_pago)}</div>
                          <span style={{ fontSize: '11px', backgroundColor: m.status === 'ativa' ? '#172554' : m.status === 'concluida' ? '#052e16' : '#450a0a', color: m.status === 'ativa' ? '#60a5fa' : m.status === 'concluida' ? '#4ade80' : '#f87171', padding: '2px 6px', borderRadius: '20px' }}>
                            {m.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}