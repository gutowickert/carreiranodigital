'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type UsuarioPerfil = {
  id: string
  nome: string
  email: string
  setor: string
  ativo: boolean
  criado_em: string
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

const setores = [
  { value: 'admin', label: 'Administrador', desc: 'Acesso total ao sistema', bg: '#2e1065', color: '#a78bfa' },
  { value: 'operacoes', label: 'Operacoes', desc: 'Turmas, professores, salas', bg: '#422006', color: '#fbbf24' },
  { value: 'comercial', label: 'Comercial', desc: 'CRM digital e leads', bg: '#172554', color: '#60a5fa' },
  { value: 'comercial_externo', label: 'Comercial Externo', desc: 'Prospeccoes e visitas', bg: '#431407', color: '#fb923c' },
  { value: 'financeiro', label: 'Financeiro', desc: 'Financeiro e relatorios', bg: '#042f2e', color: '#34d399' },
  { value: 'marketing', label: 'Marketing', desc: 'Trafego e criativos', bg: '#450a0a', color: '#f87171' },
  { value: 'pos_venda', label: 'Pos-venda', desc: 'Alunos e suporte', bg: '#052e16', color: '#4ade80' },
]

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([])
  const [novoUsuario, setNovoUsuario] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [setorEdit, setSetorEdit] = useState('')

  const [uEmail, setUEmail] = useState('')
  const [uSenha, setUSenha] = useState('')
  const [uNome, setUNome] = useState('')
  const [uSetor, setUSetor] = useState('operacoes')

  useEffect(() => { carregarUsuarios() }, [])

  async function carregarUsuarios() {
    const { data } = await supabase.from('usuarios_perfil').select('*').order('criado_em', { ascending: false })
    if (data) setUsuarios(data)
  }

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro(''); setMensagem('')

    const { data, error } = await supabase.auth.signUp({
      email: uEmail,
      password: uSenha,
      options: { data: { nome: uNome, setor: uSetor } }
    })

    if (error) { setErro('Erro ao criar usuario: ' + error.message); setSalvando(false); return }

    if (data.user?.id) {
      const { error: errPerfil } = await supabase.from('usuarios_perfil').insert({
        id: data.user.id, nome: uNome, email: uEmail, setor: uSetor, ativo: true,
      })
      if (errPerfil) {
        setErro('Usuario criado no Auth, mas erro ao salvar perfil: ' + errPerfil.message)
        setSalvando(false); return
      }
    }

    setMensagem('Usuario ' + uEmail + ' criado com sucesso!')
    setUEmail(''); setUSenha(''); setUNome(''); setUSetor('operacoes')
    setNovoUsuario(false)
    carregarUsuarios()
    setSalvando(false)
  }

  async function trocarSetor(usuarioId: string) {
    if (!setorEdit) { setEditando(null); return }
    await supabase.from('usuarios_perfil').update({ setor: setorEdit }).eq('id', usuarioId)
    setEditando(null); setSetorEdit('')
    carregarUsuarios()
  }

  async function alternarAtivo(usuarioId: string, ativo: boolean) {
    await supabase.from('usuarios_perfil').update({ ativo: !ativo }).eq('id', usuarioId)
    carregarUsuarios()
  }

  const setorInfo = (value: string) => setores.find(s => s.value === value) || setores[1]

  const setoresPreenchidos = new Set(usuarios.filter(u => u.ativo).map(u => u.setor))
  const setoresSemUsuario = setores.filter(s => !setoresPreenchidos.has(s.value))

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Usuarios do sistema</h1>
        <button onClick={() => setNovoUsuario(!novoUsuario)} style={btnPrimary}>+ Criar usuario</button>
      </div>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Cada setor precisa de pelo menos um usuario ativo para receber tarefas automaticas na agenda.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {setores.map(s => {
          const responsavel = usuarios.find(u => u.setor === s.value && u.ativo)
          return (
            <div key={s.value} style={{ backgroundColor: s.bg, border: '1px solid ' + s.color + '33', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: s.color }}>{s.label}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{s.desc}</div>
              <div style={{ fontSize: '11px', color: responsavel ? '#d1d1d1' : '#f87171', marginTop: '8px', fontWeight: '500' }}>
                {responsavel ? responsavel.nome : 'sem responsavel'}
              </div>
            </div>
          )
        })}
      </div>

      {setoresSemUsuario.length > 0 && (
        <div style={{ backgroundColor: '#3a1a1a', border: '1px solid #ef4444', borderRadius: '10px', padding: '14px 18px', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>
            Setores sem responsavel: {setoresSemUsuario.map(s => s.label).join(', ')}
          </div>
          <div style={{ fontSize: '12px', color: '#fca5a5' }}>
            Tarefas automaticas desses setores nao chegarao em nenhuma agenda ate que um usuario seja cadastrado.
          </div>
        </div>
      )}

      {novoUsuario && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>Criar novo usuario</div>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            O usuario recebe um email para confirmar o acesso e fica vinculado ao setor escolhido.
          </p>
          <form onSubmit={criarUsuario}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Nome completo</label>
                <input value={uNome} onChange={e => setUNome(e.target.value)} placeholder="Ex: Ana Silva" required style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Setor</label>
                <select value={uSetor} onChange={e => setUSetor(e.target.value)} style={select}>
                  {setores.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Email</label>
                <input value={uEmail} onChange={e => setUEmail(e.target.value)} placeholder="email@exemplo.com" type="email" required style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Senha inicial</label>
                <input value={uSenha} onChange={e => setUSenha(e.target.value)} placeholder="Minimo 6 caracteres" type="password" required minLength={6} style={input} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setNovoUsuario(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Criando...' : 'Criar usuario'}</button>
            </div>
            {erro && <p style={{ marginTop: '12px', fontSize: '13px', color: '#f87171' }}>{erro}</p>}
            {mensagem && <p style={{ marginTop: '12px', fontSize: '13px', color: '#34d399' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3a3c' }}>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{usuarios.length} usuario(s) cadastrado(s)</span>
        </div>

        {usuarios.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>
            Nenhum usuario cadastrado ainda. Crie ao menos um por setor.
          </p>
        ) : (
          <div>
            {usuarios.map(u => {
              const info = setorInfo(u.setor)
              return (
                <div key={u.id} style={{ padding: '14px 24px', borderBottom: '1px solid #3a3a3c', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: u.ativo ? 1 : 0.5 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>{u.nome || '-'}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{u.email}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {editando === u.id ? (
                      <>
                        <select value={setorEdit} onChange={e => setSetorEdit(e.target.value)} style={{ ...select, width: 'auto' }}>
                          {setores.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <button onClick={() => trocarSetor(u.id)} style={{ ...btnPrimary, fontSize: '12px', padding: '6px 12px' }}>Salvar</button>
                        <button onClick={() => { setEditando(null); setSetorEdit('') }} style={{ ...btnSecondary, fontSize: '12px', padding: '6px 12px' }}>x</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', backgroundColor: info.bg, color: info.color, fontWeight: '500' }}>
                          {info.label}
                        </span>
                        <button onClick={() => { setEditando(u.id); setSetorEdit(u.setor) }}
                          style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '12px', cursor: 'pointer' }}>
                          Trocar setor
                        </button>
                        <button onClick={() => alternarAtivo(u.id, u.ativo)}
                          style={{ background: 'none', border: 'none', color: u.ativo ? '#9ca3af' : '#4ade80', fontSize: '12px', cursor: 'pointer' }}>
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ backgroundColor: '#1e1b4b', border: '1px solid #3730a3', borderRadius: '12px', padding: '16px 20px', marginTop: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#a5b4fc', marginBottom: '6px' }}>Como funciona</div>
        <div style={{ fontSize: '12px', color: '#818cf8', lineHeight: '1.6' }}>
          Cada usuario pertence a um setor. Quando uma turma e aberta, as tarefas automaticas chegam na agenda do primeiro usuario ativo daquele setor.
        </div>
      </div>
    </div>
  )
}