'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'

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

// PAPEL — o nível de acesso. Diferente de SETOR, que é a área em que a pessoa trabalha.
//
// O sistema tinha só admin e vendedor: quem precisava trabalhar de verdade virava admin, e admin
// vê tudo por definição — inclusive a agenda de quem está acima. `gestor` é o meio que faltava.
const papeis = [
  { value: 'admin',    label: 'Dono / Sócio', desc: 'Vê tudo, inclusive financeiro, cadastros e a agenda de todos' },
  { value: 'gestor',   label: 'Gestor',       desc: 'Coordena o time: comercial e atendimento. Não vê financeiro, cadastros, nem a agenda de quem está acima' },
  { value: 'vendedor', label: 'Vendedor',     desc: 'Trabalha os próprios leads' },
  { value: 'professor', label: 'Professor',   desc: 'Acesso restrito' },
]

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
  const [papelEdit, setPapelEdit] = useState('')
  // Uma pessoa pode responder a MAIS DE UMA — por isso lista, e não um valor só.
  const [chefesEdit, setChefesEdit] = useState<string[]>([])
  const [vinculos, setVinculos] = useState<{ usuario_id: string; gestor_id: string }[]>([])

  const [uEmail, setUEmail] = useState('')
  const [uSenha, setUSenha] = useState('')
  const [uNome, setUNome] = useState('')
  const [uSetor, setUSetor] = useState('operacoes')

  useEffect(() => { carregarUsuarios() }, [])

  async function carregarUsuarios() {
    const { data } = await supabase.from('usuarios_perfil').select('*').order('criado_em', { ascending: false })
    if (data) setUsuarios(data)
    const { data: v } = await supabase.from('usuarios_gestores').select('usuario_id, gestor_id')
    setVinculos(v || [])
  }

  const chefesDe = (id: string) => vinculos.filter(v => v.usuario_id === id).map(v => v.gestor_id)

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro(''); setMensagem('')

    // Vai pelo servidor (ver app/api/usuarios/criar). O `supabase.auth.signUp` daqui do navegador
    // TROCAVA A SESSÃO pela do usuário recém-criado: quem clicava era deslogado e virava o novato,
    // sem aviso. E o perfil acabava sendo gravado por ele, que não é dono.
    const r = await fetchAuth('/api/usuarios/criar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uEmail, senha: uSenha, nome: uNome, setor: uSetor, papel: 'vendedor' }),
    })
    const res = await r.json().catch(() => ({ ok: false, error: 'resposta inválida' }))
    if (!res.ok) { setErro('Erro ao criar usuário: ' + res.error); setSalvando(false); return }

    setMensagem('Usuario ' + uEmail + ' criado com sucesso!')
    setUEmail(''); setUSenha(''); setUNome(''); setUSetor('operacoes')
    setNovoUsuario(false)
    carregarUsuarios()
    setSalvando(false)
  }

  async function trocarSetor(usuarioId: string) {
    if (!setorEdit) { setEditando(null); return }
    setErro('')

    const { error: errPerfil } = await supabase.from('usuarios_perfil').update({
      setor: setorEdit,
      papel: papelEdit || undefined,
    }).eq('id', usuarioId)
    if (errPerfil) { setErro('Não deu pra salvar o acesso: ' + errPerfil.message); return }

    // Ninguém acima = pessoa no topo (dono/sócio). Quem enxerga a agenda de quem sai daqui —
    // mas a regra em si vive no banco, não nesta tela.
    const atuais = chefesDe(usuarioId)
    const tirar = atuais.filter(g => !chefesEdit.includes(g))
    const pôr   = chefesEdit.filter(g => !atuais.includes(g))

    if (tirar.length) {
      const { error } = await supabase.from('usuarios_gestores').delete().eq('usuario_id', usuarioId).in('gestor_id', tirar)
      if (error) { setErro('Não deu pra tirar quem estava acima: ' + error.message); return }
    }
    if (pôr.length) {
      // org_id vem do gatilho da empresa; não mando daqui.
      const { error } = await supabase.from('usuarios_gestores').insert(pôr.map(g => ({ usuario_id: usuarioId, gestor_id: g })))
      if (error) { setErro('Não deu pra salvar quem está acima: ' + error.message); return }
    }

    setEditando(null); setSetorEdit(''); setPapelEdit(''); setChefesEdit([])
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
                <div key={u.id} style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', opacity: u.ativo ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{u.nome || '-'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{u.email}</div>
                      {editando !== u.id && (
                        <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
                          {chefesDe(u.id).length === 0
                            ? 'não responde a ninguém'
                            : 'responde a ' + chefesDe(u.id).map(g => usuarios.find(x => x.id === g)?.nome || '?').join(' e ')}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {editando === u.id ? (
                        <>
                          <select value={papelEdit} onChange={e => setPapelEdit(e.target.value)} title="Nível de acesso" style={{ ...select, width: 'auto' }}>
                            {papeis.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                          </select>
                          <select value={setorEdit} onChange={e => setSetorEdit(e.target.value)} title="Área em que trabalha" style={{ ...select, width: 'auto' }}>
                            {setores.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          <button onClick={() => trocarSetor(u.id)} style={{ ...btnPrimary, fontSize: '12px', padding: '6px 12px' }}>Salvar</button>
                          <button onClick={() => { setEditando(null); setSetorEdit(''); setChefesEdit([]); setErro('') }} style={{ ...btnSecondary, fontSize: '12px', padding: '6px 12px' }}>x</button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', backgroundColor: info.bg, color: info.color, fontWeight: '500' }}>
                            {info.label}
                          </span>
                          <button onClick={() => { setEditando(u.id); setSetorEdit(u.setor); setPapelEdit((u as any).papel || 'vendedor'); setChefesEdit(chefesDe(u.id)); setErro('') }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>
                            Editar acesso
                          </button>
                          <button onClick={() => alternarAtivo(u.id, u.ativo)}
                            style={{ background: 'none', border: 'none', color: u.ativo ? 'var(--text-muted)' : 'var(--green-strong)', fontSize: '12px', cursor: 'pointer' }}>
                            {u.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {editando === u.id && (
                    <div style={{ marginTop: '12px', padding: '12px 14px', backgroundColor: 'var(--surface-2)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Responde a — pode marcar mais de um. Quem está marcado enxerga a agenda desta pessoa.
                        Ninguém marcado = está no topo.
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {usuarios.filter(o => o.id !== u.id && o.ativo).map(o => {
                          const marcado = chefesEdit.includes(o.id)
                          return (
                            <label key={o.id} style={{
                              display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                              fontSize: '13px', padding: '5px 10px', borderRadius: '20px',
                              backgroundColor: marcado ? 'var(--accent-bg)' : 'var(--surface)',
                              color: marcado ? 'var(--accent-soft)' : 'var(--text-2)',
                              border: '1px solid ' + (marcado ? 'var(--accent)' : 'var(--border)'),
                            }}>
                              <input type="checkbox" checked={marcado}
                                onChange={e => setChefesEdit(c => e.target.checked ? [...c, o.id] : c.filter(x => x !== o.id))} />
                              {o.nome || o.email}
                            </label>
                          )
                        })}
                      </div>
                      {erro && <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--red)' }}>{erro}</p>}
                    </div>
                  )}
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