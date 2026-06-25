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

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

const setores = [
  { value: 'admin', label: 'Administrador', desc: 'Acesso total ao sistema', bg: 'var(--accent-bg)', color: 'var(--accent-soft)' },
  { value: 'operacoes', label: 'Operacoes', desc: 'Turmas, professores, salas', bg: 'var(--amber-bg)', color: 'var(--amber)' },
  { value: 'comercial', label: 'Comercial', desc: 'CRM digital e leads', bg: 'var(--blue-bg)', color: 'var(--blue)' },
  { value: 'comercial_externo', label: 'Comercial Externo', desc: 'Prospeccoes e visitas', bg: 'var(--amber-bg)', color: 'var(--amber)' },
  { value: 'financeiro', label: 'Financeiro', desc: 'Financeiro e relatorios', bg: 'var(--green-bg)', color: 'var(--green)' },
  { value: 'marketing', label: 'Marketing', desc: 'Trafego e criativos', bg: 'var(--red-bg)', color: 'var(--red)' },
  { value: 'pos_venda', label: 'Pos-venda', desc: 'Alunos e suporte', bg: 'var(--green-bg)', color: 'var(--green-strong)' },
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
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)' }}>Usuarios do sistema</h1>
        <button onClick={() => setNovoUsuario(!novoUsuario)} style={btnPrimary}>+ Criar usuario</button>
      </div>
      <p style={{ fontSize: '14px', color: 'var(--text-faint)', marginBottom: '24px' }}>
        Cada setor precisa de pelo menos um usuario ativo para receber tarefas automaticas na agenda.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {setores.map(s => {
          const responsavel = usuarios.find(u => u.setor === s.value && u.ativo)
          return (
            <div key={s.value} style={{ backgroundColor: s.bg, border: '1px solid ' + s.color + '33', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: s.color }}>{s.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>{s.desc}</div>
              <div style={{ fontSize: '11px', color: responsavel ? 'var(--text-2)' : 'var(--red)', marginTop: '8px', fontWeight: '500' }}>
                {responsavel ? responsavel.nome : 'sem responsavel'}
              </div>
            </div>
          )
        })}
      </div>

      {setoresSemUsuario.length > 0 && (
        <div style={{ backgroundColor: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px', padding: '14px 18px', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--red)', marginBottom: '4px' }}>
            Setores sem responsavel: {setoresSemUsuario.map(s => s.label).join(', ')}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--red)' }}>
            Tarefas automaticas desses setores nao chegarao em nenhuma agenda ate que um usuario seja cadastrado.
          </div>
        </div>
      )}

      {novoUsuario && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Criar novo usuario</div>
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginBottom: '16px' }}>
            O usuario recebe um email para confirmar o acesso e fica vinculado ao setor escolhido.
          </p>
          <form onSubmit={criarUsuario}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Nome completo</label>
                <input value={uNome} onChange={e => setUNome(e.target.value)} placeholder="Ex: Ana Silva" required style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Setor</label>
                <select value={uSetor} onChange={e => setUSetor(e.target.value)} style={select}>
                  {setores.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Email</label>
                <input value={uEmail} onChange={e => setUEmail(e.target.value)} placeholder="email@exemplo.com" type="email" required style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Senha inicial</label>
                <input value={uSenha} onChange={e => setUSenha(e.target.value)} placeholder="Minimo 6 caracteres" type="password" required minLength={6} style={input} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setNovoUsuario(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Criando...' : 'Criar usuario'}</button>
            </div>
            {erro && <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--red)' }}>{erro}</p>}
            {mensagem && <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--green)' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{usuarios.length} usuario(s) cadastrado(s)</span>
        </div>

        {usuarios.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: 'var(--text-faint)' }}>
            Nenhum usuario cadastrado ainda. Crie ao menos um por setor.
          </p>
        ) : (
          <div>
            {usuarios.map(u => {
              const info = setorInfo(u.setor)
              return (
                <div key={u.id} style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: u.ativo ? 1 : 0.5 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{u.nome || '-'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{u.email}</div>
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
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>
                          Trocar setor
                        </button>
                        <button onClick={() => alternarAtivo(u.id, u.ativo)}
                          style={{ background: 'none', border: 'none', color: u.ativo ? 'var(--text-muted)' : 'var(--green-strong)', fontSize: '12px', cursor: 'pointer' }}>
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

      <div style={{ backgroundColor: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: '12px', padding: '16px 20px', marginTop: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--blue)', marginBottom: '6px' }}>Como funciona</div>
        <div style={{ fontSize: '12px', color: 'var(--blue)', lineHeight: '1.6' }}>
          Cada usuario pertence a um setor. Quando uma turma e aberta, as tarefas automaticas chegam na agenda do primeiro usuario ativo daquele setor.
        </div>
      </div>
    </div>
  )
}