'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Professor = {
  id: string
  nome: string
  email: string
  whatsapp: string
  diaria_reais: number
  pix_chave: string
  pix_tipo: string
  banco: string
  observacoes: string
  ativo: boolean
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Professores() {
  const [professores, setProfessores] = useState<Professor[]>([])
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [diaria, setDiaria] = useState('')
  const [pixChave, setPixChave] = useState('')
  const [pixTipo, setPixTipo] = useState('cpf')
  const [banco, setBanco] = useState('')
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data } = await supabase.from('professores').select('*').order('nome')
    if (data) setProfessores(data)
  }

  function limparForm() {
    setNome(''); setEmail(''); setWhatsapp(''); setDiaria('')
    setPixChave(''); setPixTipo('cpf'); setBanco(''); setObservacoes('')
    setMensagem(''); setEditandoId(null)
  }

  function abrirNovo() {
    limparForm()
    setAberto(true)
  }

  function abrirEdicao(p: Professor) {
    setEditandoId(p.id)
    setNome(p.nome || '')
    setEmail(p.email || '')
    setWhatsapp(p.whatsapp || '')
    setDiaria(p.diaria_reais ? p.diaria_reais.toString() : '')
    setPixChave(p.pix_chave || '')
    setPixTipo(p.pix_tipo || 'cpf')
    setBanco(p.banco || '')
    setObservacoes(p.observacoes || '')
    setMensagem('')
    setAberto(true)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    const payload = {
      nome,
      email: email || null,
      whatsapp: whatsapp || null,
      diaria_reais: parseFloat(diaria),
      pix_chave: pixChave || null,
      pix_tipo: pixChave ? pixTipo : null,
      banco: banco || null,
      observacoes: observacoes || null,
    }

    if (editandoId) {
      const { error } = await supabase.from('professores').update(payload).eq('id', editandoId)
      if (error) { setMensagem('Erro: ' + error.message); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('professores').insert({ ...payload, ativo: true })
      if (error) { setMensagem('Erro: ' + error.message); setSalvando(false); return }
    }

    limparForm(); setAberto(false); carregar(); setSalvando(false)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('professores').update({ ativo: !ativo }).eq('id', id)
    carregar()
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Professores</h1>
        <button onClick={() => aberto ? (setAberto(false), limparForm()) : abrirNovo()} style={btnPrimary}>
          {aberto ? 'Fechar' : '+ Cadastrar professor'}
        </button>
      </div>

      {aberto && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>
            {editandoId ? 'Editar professor' : 'Novo professor'}
          </div>
          <form onSubmit={salvar}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo *" required style={input} />
              <input value={diaria} onChange={e => setDiaria(e.target.value)} placeholder="Diaria R$ *" type="number" required style={input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" style={input} />
              <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="WhatsApp" style={input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: '12px', marginBottom: '12px' }}>
              <select value={pixTipo} onChange={e => setPixTipo(e.target.value)} style={select}>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">Email</option>
                <option value="telefone">Telefone</option>
                <option value="aleatoria">Aleatoria</option>
              </select>
              <input value={pixChave} onChange={e => setPixChave(e.target.value)} placeholder="Chave PIX" style={input} />
              <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Banco" style={input} />
            </div>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observacoes (opcional)" rows={2}
              style={{ ...input, resize: 'none', marginBottom: '16px' } as React.CSSProperties} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => { setAberto(false); limparForm() }} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>
                {salvando ? 'Salvando...' : (editandoId ? 'Atualizar' : 'Cadastrar')}
              </button>
            </div>
            {mensagem && <p style={{ marginTop: '12px', fontSize: '13px', color: '#f87171' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3a3c' }}>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{professores.length} professor(es)</span>
        </div>
        {professores.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhum professor cadastrado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                {['Nome', 'WhatsApp', 'PIX', 'Diaria', 'Status', ''].map(h => (
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
                  <td style={{ padding: '14px 24px', fontSize: '14px', color: '#9ca3af' }}>{p.whatsapp || '-'}</td>
                  <td style={{ padding: '14px 24px', fontSize: '13px', color: '#9ca3af' }}>
                    {p.pix_chave ? (
                      <div>
                        <div>{p.pix_chave}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{p.pix_tipo}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: '600', color: '#34d399' }}>
                    R$ {(p.diaria_reais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 24px' }}>
                    <button onClick={() => toggleAtivo(p.id, p.ativo)} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: p.ativo ? '#052e16' : '#3a3a3c', color: p.ativo ? '#4ade80' : '#9ca3af' }}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td style={{ padding: '14px 24px' }}>
                    <button onClick={() => abrirEdicao(p)}
                      style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: '12px', cursor: 'pointer' }}>
                      Editar
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