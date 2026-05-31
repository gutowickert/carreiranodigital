'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Sala = { id: string; nome: string; capacidade: number; diaria_reais: number; ativo: boolean; cidades: { nome: string } }
type Cidade = { id: string; nome: string }

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Salas() {
  const [salas, setSalas] = useState<Sala[]>([])
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [novo, setNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState('')
  const [cidadeId, setCidadeId] = useState('')
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

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true)
    await supabase.from('salas').insert({ nome, cidade_id: cidadeId, capacidade: parseInt(capacidade), diaria_reais: parseFloat(diaria) || 0, ativo: true })
    setNome(''); setCidadeId(''); setCapacidade(''); setDiaria('')
    setNovo(false); carregar(); setSalvando(false)
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Salas</h1>
        <button onClick={() => setNovo(!novo)} style={btnPrimary}>+ Cadastrar sala</button>
      </div>

      {novo && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Nova sala</div>
          <form onSubmit={salvar}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da sala *" required style={input} />
              <select value={cidadeId} onChange={e => setCidadeId(e.target.value)} required style={select}>
                <option value="">Selecione a cidade</option>
                {cidades.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <input value={capacidade} onChange={e => setCapacidade(e.target.value)} placeholder="Capacidade (pessoas)" type="number" style={input} />
              <input value={diaria} onChange={e => setDiaria(e.target.value)} placeholder="Diária R$ (0 se própria)" type="number" style={input} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setNovo(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Salvando...' : 'Cadastrar'}</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3a3c' }}>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{salas.length} sala{salas.length !== 1 ? 's' : ''}</span>
        </div>
        {salas.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhuma sala cadastrada.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                {['Nome', 'Cidade', 'Capacidade', 'Diária'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 24px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salas.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                  <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>{s.nome}</td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', color: '#9ca3af' }}>{s.cidades?.nome}</td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', color: '#9ca3af' }}>{s.capacidade ? `${s.capacidade} pessoas` : '—'}</td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', color: s.diaria_reais > 0 ? '#f87171' : '#4ade80' }}>
                    {s.diaria_reais > 0 ? `R$ ${s.diaria_reais}` : 'Própria'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}