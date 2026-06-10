'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Sala = {
  id: string
  nome: string
  tipo: string
  capacidade_maxima: number
  diaria_reais: number
  ativo: boolean
  cidade_id?: string
  cidades: { nome: string }
}
type Cidade = { id: string; nome: string }

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnLink = { background: 'none', border: '1px solid #48484a', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', color: '#a78bfa', cursor: 'pointer' } as React.CSSProperties

export default function Salas() {
  const [salas, setSalas] = useState<Sala[]>([])
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [novo, setNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cidadeId, setCidadeId] = useState('')
  const [tipo, setTipo] = useState('sede_propria')
  const [capacidade, setCapacidade] = useState('')
  const [diaria, setDiaria] = useState('')

  useEffect(() => { carregar(); carregarCidades() }, [])

  async function carregar() {
    const { data } = await supabase.from('salas').select('*, cidades(nome)').order('nome')
    if (data) setSalas(data)
  }

  async function carregarCidades() {
    const { data } = await supabase.from('cidades').select('id, nome').eq('ativo', true).order('nome')
    if (data) setCidades(data)
  }

  function abrirNovo() {
    setEditandoId(null); setNome(''); setCidadeId(''); setTipo('sede_propria'); setCapacidade(''); setDiaria(''); setMensagem(''); setNovo(true)
  }

  function iniciarEdicao(s: Sala) {
    setEditandoId(s.id)
    setNome(s.nome)
    setCidadeId(s.cidade_id || '')
    setTipo(s.tipo || 'sede_propria')
    setCapacidade(s.capacidade_maxima ? String(s.capacidade_maxima) : '')
    setDiaria(s.diaria_reais ? String(s.diaria_reais) : '')
    setMensagem(''); setNovo(true)
  }

  function fecharForm() {
    setNovo(false); setEditandoId(null); setNome(''); setCidadeId(''); setTipo('sede_propria'); setCapacidade(''); setDiaria('')
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    const payload = {
      nome, cidade_id: cidadeId, tipo,
      capacidade_maxima: capacidade ? parseInt(capacidade) : null,
      diaria_reais: parseFloat(diaria) || 0,
    }
    let error
    if (editandoId) {
      ({ error } = await supabase.from('salas').update(payload).eq('id', editandoId))
    } else {
      ({ error } = await supabase.from('salas').insert({ ...payload, ativo: true }))
    }
    if (error) { setMensagem('Erro: ' + error.message); setSalvando(false); return }
    fecharForm(); carregar(); setSalvando(false)
  }

  const tipoInfo: Record<string, { label: string; bg: string; color: string }> = {
    sede_propria: { label: 'Própria', bg: '#052e16', color: '#4ade80' },
    sala_externa: { label: 'Externa', bg: '#172554', color: '#60a5fa' },
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Salas</h1>
        <button onClick={() => (novo ? fecharForm() : abrirNovo())} style={btnPrimary}>
          {novo ? 'Fechar' : '+ Cadastrar sala'}
        </button>
      </div>

      {novo && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>
            {editandoId ? 'Editar sala' : 'Nova sala'}
          </div>
          <form onSubmit={salvar}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da sala *" required style={input} />
              <select value={cidadeId} onChange={e => setCidadeId(e.target.value)} required style={select}>
                <option value="">Selecione a cidade</option>
                {cidades.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <select value={tipo} onChange={e => setTipo(e.target.value)} style={select}>
                <option value="sede_propria">Própria</option>
                <option value="sala_externa">Externa (alugada)</option>
              </select>
              <input value={capacidade} onChange={e => setCapacidade(e.target.value)} placeholder="Capacidade" type="number" style={input} />
              <input value={diaria} onChange={e => setDiaria(e.target.value)} placeholder="Diaria R$" type="number" style={input} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={fecharForm} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>
                {salvando ? 'Salvando...' : (editandoId ? 'Salvar alterações' : 'Cadastrar')}
              </button>
            </div>
            {mensagem && <p style={{ marginTop: '12px', fontSize: '13px', color: '#f87171' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3a3c' }}>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{salas.length} sala(s)</span>
        </div>
        {salas.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhuma sala cadastrada.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                {['Nome', 'Cidade', 'Tipo', 'Capacidade', 'Diaria', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 24px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salas.map(s => {
                const info = tipoInfo[s.tipo] || { label: s.tipo || '-', bg: '#3a3a3c', color: '#9ca3af' }
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                    <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>{s.nome}</td>
                    <td style={{ padding: '14px 24px', fontSize: '14px', color: '#9ca3af' }}>{s.cidades?.nome}</td>
                    <td style={{ padding: '14px 24px' }}>
                      <span style={{ fontSize: '12px', backgroundColor: info.bg, color: info.color, padding: '3px 10px', borderRadius: '20px' }}>
                        {info.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 24px', fontSize: '14px', color: '#9ca3af' }}>{s.capacidade_maxima ? s.capacidade_maxima + ' pessoas' : '-'}</td>
                    <td style={{ padding: '14px 24px', fontSize: '14px', color: s.diaria_reais > 0 ? '#f87171' : '#6b7280' }}>
                      {s.diaria_reais > 0 ? 'R$ ' + s.diaria_reais : '—'}
                    </td>
                    <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                      <button onClick={() => iniciarEdicao(s)} style={btnLink}>Editar</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
