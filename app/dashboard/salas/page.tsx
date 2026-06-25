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

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnLink = { background: 'none', border: '1px solid var(--border-strong)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', color: 'var(--accent-soft)', cursor: 'pointer' } as React.CSSProperties

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
    sede_propria: { label: 'Própria', bg: 'var(--green-bg)', color: 'var(--green-strong)' },
    sala_externa: { label: 'Externa', bg: 'var(--blue-bg)', color: 'var(--blue)' },
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)' }}>Salas</h1>
        <button onClick={() => (novo ? fecharForm() : abrirNovo())} style={btnPrimary}>
          {novo ? 'Fechar' : '+ Cadastrar sala'}
        </button>
      </div>

      {novo && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px' }}>
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
            {mensagem && <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--red)' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{salas.length} sala(s)</span>
        </div>
        {salas.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: 'var(--text-faint)' }}>Nenhuma sala cadastrada.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nome', 'Cidade', 'Tipo', 'Capacidade', 'Diaria', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 24px', fontSize: '12px', color: 'var(--text-faint)', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salas.map(s => {
                const info = tipoInfo[s.tipo] || { label: s.tipo || '-', bg: 'var(--surface-2)', color: 'var(--text-muted)' }
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{s.nome}</td>
                    <td style={{ padding: '14px 24px', fontSize: '14px', color: 'var(--text-muted)' }}>{s.cidades?.nome}</td>
                    <td style={{ padding: '14px 24px' }}>
                      <span style={{ fontSize: '12px', backgroundColor: info.bg, color: info.color, padding: '3px 10px', borderRadius: '20px' }}>
                        {info.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 24px', fontSize: '14px', color: 'var(--text-muted)' }}>{s.capacidade_maxima ? s.capacidade_maxima + ' pessoas' : '-'}</td>
                    <td style={{ padding: '14px 24px', fontSize: '14px', color: s.diaria_reais > 0 ? 'var(--red)' : 'var(--text-faint)' }}>
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
