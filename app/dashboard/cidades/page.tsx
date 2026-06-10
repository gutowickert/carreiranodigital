'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Cidade = { id: string; nome: string; estado: string; tipo: string; ativo: boolean }

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnLink = { background: 'none', border: '1px solid #48484a', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', color: '#a78bfa', cursor: 'pointer' } as React.CSSProperties

export default function Cidades() {
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [novo, setNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [estado, setEstado] = useState('RS')
  const [tipo, setTipo] = useState('sede_propria')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data } = await supabase.from('cidades').select('*').order('nome')
    if (data) setCidades(data)
  }

  function abrirNovo() {
    setEditandoId(null); setNome(''); setEstado('RS'); setTipo('sede_propria'); setNovo(true)
  }

  function iniciarEdicao(c: Cidade) {
    setEditandoId(c.id); setNome(c.nome); setEstado(c.estado); setTipo(c.tipo); setNovo(true)
  }

  function fecharForm() {
    setNovo(false); setEditandoId(null); setNome(''); setEstado('RS'); setTipo('sede_propria')
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true)
    if (editandoId) {
      await supabase.from('cidades').update({ nome, estado, tipo }).eq('id', editandoId)
    } else {
      await supabase.from('cidades').insert({ nome, estado, tipo, ativo: true })
    }
    fecharForm(); carregar(); setSalvando(false)
  }

  const tipoInfo: Record<string, { label: string; bg: string; color: string }> = {
    sede_propria: { label: 'Sede própria', bg: '#052e16', color: '#4ade80' },
    cidade_externa: { label: 'Cidade externa', bg: '#172554', color: '#60a5fa' },
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Cidades</h1>
        <button onClick={() => (novo ? fecharForm() : abrirNovo())} style={btnPrimary}>
          {novo ? 'Fechar' : '+ Cadastrar cidade'}
        </button>
      </div>

      {novo && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>
            {editandoId ? 'Editar cidade' : 'Nova cidade'}
          </div>
          <form onSubmit={salvar}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', marginBottom: '16px' }}>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da cidade *" required style={input} />
              <input value={estado} onChange={e => setEstado(e.target.value)} placeholder="UF" maxLength={2} style={{ ...input, width: '60px' }} />
              <select value={tipo} onChange={e => setTipo(e.target.value)} style={select}>
                <option value="sede_propria">Sede própria</option>
                <option value="cidade_externa">Cidade externa</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={fecharForm} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>
                {salvando ? 'Salvando...' : (editandoId ? 'Salvar alterações' : 'Cadastrar')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3a3c' }}>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{cidades.length} cidade{cidades.length !== 1 ? 's' : ''}</span>
        </div>
        {cidades.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhuma cidade cadastrada.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                {['Cidade', 'Estado', 'Tipo', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 24px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cidades.map(c => {
                const info = tipoInfo[c.tipo] || { label: c.tipo, bg: '#3a3a3c', color: '#9ca3af' }
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                    <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>{c.nome}</td>
                    <td style={{ padding: '14px 24px', fontSize: '14px', color: '#9ca3af' }}>{c.estado}</td>
                    <td style={{ padding: '14px 24px' }}>
                      <span style={{ fontSize: '12px', backgroundColor: info.bg, color: info.color, padding: '3px 10px', borderRadius: '20px' }}>
                        {info.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                      <button onClick={() => iniciarEdicao(c)} style={btnLink}>Editar</button>
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
