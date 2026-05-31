'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Usuario = {
  id: string
  email: string
  created_at: string
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

const perfis = [
  { value: 'admin', label: 'Administrador', desc: 'Acesso total ao sistema', bg: '#2e1065', color: '#a78bfa' },
  { value: 'operacoes', label: 'Operações', desc: 'Turmas, tarefas e professores', bg: '#422006', color: '#fbbf24' },
  { value: 'comercial', label: 'Comercial', desc: 'Leads, CRM e vendas', bg: '#172554', color: '#60a5fa' },
  { value: 'financeiro', label: 'Financeiro', desc: 'Financeiro e relatórios', bg: '#042f2e', color: '#34d399' },
  { value: 'marketing', label: 'Marketing', desc: 'Leads e campanhas', bg: '#450a0a', color: '#f87171' },
]

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [novoUsuario, setNovoUsuario] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  const [uEmail, setUEmail] = useState('')
  const [uSenha, setUSenha] = useState('')
  const [uNome, setUNome] = useState('')
  const [uPerfil, setUPerfil] = useState('operacoes')

  useEffect(() => { carregarUsuarios() }, [])

  async function carregarUsuarios() {
    const { data, error } = await supabase.auth.admin?.listUsers() as any
    if (data?.users) setUsuarios(data.users)
  }

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    setMensagem('')

    const { data, error } = await supabase.auth.signUp({
      email: uEmail,
      password: uSenha,
      options: {
        data: { nome: uNome, perfil: uPerfil }
      }
    })

    if (error) {
      setErro('Erro ao criar usuário: ' + error.message)
    } else {
      setMensagem(`Usuário ${uEmail} criado! Um e-mail de confirmação foi enviado.`)
      setUEmail('')
      setUSenha('')
      setUNome('')
      setUPerfil('operacoes')
      setNovoUsuario(false)
      carregarUsuarios()
    }
    setSalvando(false)
  }

  const perfilInfo = (value: string) => perfis.find(p => p.value === value) || perfis[0]

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Usuários do sistema</h1>
        <button onClick={() => setNovoUsuario(!novoUsuario)} style={btnPrimary}>+ Criar usuário</button>
      </div>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Gerencie quem tem acesso ao sistema CarreiraNoDigital.
      </p>

      {/* Perfis disponíveis */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {perfis.map(p => (
          <div key={p.value} style={{ backgroundColor: p.bg, border: `1px solid ${p.color}33`, borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: p.color }}>{p.label}</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{p.desc}</div>
          </div>
        ))}
      </div>

      {/* Form novo usuário */}
      {novoUsuario && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>Criar novo usuário</div>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            O usuário receberá um e-mail para confirmar o acesso.
          </p>
          <form onSubmit={criarUsuario}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Nome completo</label>
                <input value={uNome} onChange={e => setUNome(e.target.value)} placeholder="Ex: Ana Silva" required style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Perfil de acesso</label>
                <select value={uPerfil} onChange={e => setUPerfil(e.target.value)} style={select}>
                  {perfis.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>E-mail</label>
                <input value={uEmail} onChange={e => setUEmail(e.target.value)} placeholder="email@exemplo.com" type="email" required style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Senha inicial</label>
                <input value={uSenha} onChange={e => setUSenha(e.target.value)} placeholder="Mínimo 6 caracteres" type="password" required minLength={6} style={input} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setNovoUsuario(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Criando...' : 'Criar usuário'}</button>
            </div>
            {erro && <p style={{ marginTop: '12px', fontSize: '13px', color: '#f87171' }}>{erro}</p>}
            {mensagem && <p style={{ marginTop: '12px', fontSize: '13px', color: '#34d399' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      {/* Como criar usuários */}
      <div style={{ backgroundColor: '#1e1b4b', border: '1px solid #3730a3', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#a5b4fc', marginBottom: '8px' }}>💡 Como funciona</div>
        <div style={{ fontSize: '13px', color: '#818cf8', lineHeight: '1.6' }}>
          Ao criar um usuário, ele recebe um e-mail para confirmar o acesso. Após confirmar, pode entrar com o e-mail e senha cadastrados. Para criar usuários de sócios, use o e-mail deles e defina uma senha inicial — eles podem trocar depois nas configurações.
        </div>
      </div>

      {/* Lista de usuários do Supabase */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3a3c' }}>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>Usuários cadastrados no Supabase</span>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Para ver todos os usuários do sistema, acesse o painel do Supabase em{' '}
            <a href="https://supabase.com/dashboard/project/rwyrtnxvqlvpcimnvqhb/auth/users" target="_blank" rel="noreferrer"
              style={{ color: '#a78bfa', textDecoration: 'none' }}>
              Authentication → Users ↗
            </a>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ backgroundColor: '#3a3a3c', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>guto.wickert@gmail.com</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Administrador — conta principal</div>
              </div>
              <span style={{ fontSize: '12px', backgroundColor: '#2e1065', color: '#a78bfa', padding: '3px 10px', borderRadius: '20px' }}>Admin</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}