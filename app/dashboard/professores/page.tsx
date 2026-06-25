'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Professor = {
  id: string
  nome: string
  email: string
  whatsapp: string
  diaria_reais: number
  tipo_pagamento: 'diaria_fixa' | 'percentual_vendas'
  percentual_vendas: number
  pix_chave: string
  pix_tipo: string
  banco: string
  observacoes: string
  ativo: boolean
}

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

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
  const [tipoPagamento, setTipoPagamento] = useState<'diaria_fixa' | 'percentual_vendas'>('diaria_fixa')
  const [percentualVendas, setPercentualVendas] = useState('')
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
    setTipoPagamento('diaria_fixa'); setPercentualVendas('')
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
      diaria_reais: tipoPagamento === 'diaria_fixa' ? parseFloat(diaria) : 0,
      tipo_pagamento: tipoPagamento,
      percentual_vendas: tipoPagamento === 'percentual_vendas' ? parseFloat(percentualVendas) : 0,
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
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)' }}>Professores</h1>
        <button onClick={() => aberto ? (setAberto(false), limparForm()) : abrirNovo()} style={btnPrimary}>
          {aberto ? 'Fechar' : '+ Cadastrar professor'}
        </button>
      </div>

      {aberto && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px' }}>
            {editandoId ? 'Editar professor' : 'Novo professor'}
          </div>
          <form onSubmit={salvar}>
            <div style={{ marginBottom: '12px' }}>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo *" required style={input} />
            </div>

            <div style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Tipo de pagamento</label>
                <select value={tipoPagamento} onChange={e => setTipoPagamento(e.target.value as any)} style={select}>
                  <option value="diaria_fixa">Diária fixa (R$ por dia)</option>
                  <option value="percentual_vendas">% sobre vendas (coprodução)</option>
                </select>
              </div>
              <div>
                {tipoPagamento === 'diaria_fixa' ? (
                  <>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Diária R$ *</label>
                    <input value={diaria} onChange={e => setDiaria(e.target.value)} type="number" step="0.01" required style={input} />
                  </>
                ) : (
                  <>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>% sobre líquido *</label>
                    <input value={percentualVendas} onChange={e => setPercentualVendas(e.target.value)} type="number" step="0.01" required style={input} placeholder="Ex: 50 para 50%" />
                  </>
                )}
              </div>
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
            {mensagem && <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--red)' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{professores.length} professor(es)</span>
        </div>
        {professores.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: 'var(--text-faint)' }}>Nenhum professor cadastrado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nome', 'WhatsApp', 'PIX', 'Diaria', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 24px', fontSize: '12px', color: 'var(--text-faint)', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {professores.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 24px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{p.nome}</div>
                    {p.email && <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{p.email}</div>}
                  </td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', color: 'var(--text-muted)' }}>{p.whatsapp || '-'}</td>
                  <td style={{ padding: '14px 24px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {p.pix_chave ? (
                      <div>
                        <div>{p.pix_chave}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>{p.pix_tipo}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '14px 24px', fontSize: '14px', fontWeight: '600', color: 'var(--green)' }}>
                    {p.tipo_pagamento === 'percentual_vendas' ? (
                      <div>
                        {p.percentual_vendas || 0}%
                        <div style={{ fontSize: '10px', color: 'var(--accent-soft)', textTransform: 'uppercase', marginTop: 2 }}>coprodução</div>
                      </div>
                    ) : (
                      <>R$ {(p.diaria_reais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</>
                    )}
                  </td>
                  <td style={{ padding: '14px 24px' }}>
                    <button onClick={() => toggleAtivo(p.id, p.ativo)} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: p.ativo ? 'var(--green-bg)' : 'var(--surface-2)', color: p.ativo ? 'var(--green-strong)' : 'var(--text-muted)' }}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td style={{ padding: '14px 24px' }}>
                    <button onClick={() => abrirEdicao(p)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-soft)', fontSize: '12px', cursor: 'pointer' }}>
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