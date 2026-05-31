'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Professor = { id: string; nome: string; email: string; whatsapp: string; especialidade: string; diaria_reais: number; ativo: boolean }

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Professores() {
  const [professores, setProfessores] = useState<Professor[]>([])
  const [novo, setNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [especialidade, setEspecialidade] = useState('')
  const [diaria, setDiaria] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data } = await supabase.from('professores').select('*').order('nome')
    if (data) setProfessores(data)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true)
    await supabase.from('professores').insert({ nome, email, whatsapp, especialidade, diaria_reais: parseFloat(diaria), ativo: true })
    setNome(''); setEmail(''); setWhatsapp(''); setEspecialidade(''); setDiaria('')
    setNovo(false); carregar(); setSalvando(false)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('professores').update({ ativo: !ativo }).eq('id', id)
    carregar()
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Professores</h1>
        <button onClick={() => setNovo(!novo)} style={btnPrimary}>+ Cadastrar professor</button>
      </div>

      {novo && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Novo professor</div>
          <form onSubmit={salvar}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo *" required style={input} />
              <input value={especialidade} onChange={e => setEspecialidade(e.target.value)} placeholder="Especialidade" style={input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" type="email" style={input} />
              <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="WhatsApp" style={input} />
              <input value={diaria} onChange={e => setDiaria(e.target.value)} placeholder="Diária R$" type="number" required style={input} />
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
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{professores.length} professor{professores.length !== 1 ? 'es' : ''}</span>
        </div>
        {professores.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhum professor cadastrado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                {['Nome', 'Especialidade', 'WhatsApp', 'Diária', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 24px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {professores.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                  <td style={{ padding: '14px 24px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>{p.nome}</div>
                    {p.email && <div style={{ fontSize: '12px', color: '#6b7280' }}>{p.email}</div>}
                  </td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', color: '#9ca3af' }}>{p.especialidade || '—'}</td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', color: '#9ca3af' }}>{p.whatsapp || '—'}</td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: '600', color: '#34d399' }}>
                    R$ {(p.diaria_reais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 24px' }}>
                    <button onClick={() => toggleAtivo(p.id, p.ativo)} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: p.ativo ? '#052e16' : '#3a3a3c', color: p.ativo ? '#4ade80' : '#9ca3af' }}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </button>
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