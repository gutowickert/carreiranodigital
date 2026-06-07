'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type Motivo = {
  id: string
  nome: string
  ativo: boolean
  ordem: number
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#fff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties

export default function MotivosPerda() {
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [valorEdit, setValorEdit] = useState('')
  const [mensagem, setMensagem] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase.from('motivos_perda').select('*').order('ordem').order('nome')
    if (data) setMotivos(data)
    setCarregando(false)
  }

  async function criar() {
    if (!novo.trim()) { setMensagem('Digite um nome.'); return }
    setMensagem('')
    const proximaOrdem = (motivos.reduce((max, m) => Math.max(max, m.ordem || 0), 0)) + 1
    const { error } = await supabase.from('motivos_perda').insert({
      nome: novo.trim(), ativo: true, ordem: proximaOrdem
    })
    if (error) { setMensagem('Erro: ' + error.message); return }
    setNovo('')
    setMensagem('✓ Motivo criado!')
    carregar()
    setTimeout(() => setMensagem(''), 2000)
  }

  async function salvarEdicao(id: string) {
    if (!valorEdit.trim()) { setMensagem('Nome não pode ser vazio.'); return }
    await supabase.from('motivos_perda').update({ nome: valorEdit.trim() }).eq('id', id)
    setEditando(null)
    setMensagem('✓ Atualizado!')
    carregar()
    setTimeout(() => setMensagem(''), 2000)
  }

  async function alternarAtivo(m: Motivo) {
    await supabase.from('motivos_perda').update({ ativo: !m.ativo }).eq('id', m.id)
    carregar()
  }

  async function deletar(m: Motivo) {
    if (!confirm(`Deletar motivo "${m.nome}"?\n\nLeads que já foram marcados com esse motivo NÃO serão alterados.`)) return
    const { error } = await supabase.from('motivos_perda').delete().eq('id', m.id)
    if (error) {
      setMensagem('Erro: este motivo está em uso. Desative em vez de deletar.')
      setTimeout(() => setMensagem(''), 4000)
      return
    }
    setMensagem('✓ Removido!')
    carregar()
    setTimeout(() => setMensagem(''), 2000)
  }
  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Motivos de Perda</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Razões que vendedores podem selecionar ao marcar um lead como perdido
          </p>
        </div>

        {mensagem && (
          <div style={{ padding: 12, marginBottom: 16, background: mensagem.includes('Erro') ? '#450a0a' : '#052e16', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: mensagem.includes('Erro') ? '#f87171' : '#34d399', margin: 0 }}>{mensagem}</p>
          </div>
        )}

        <div style={{ ...card, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inp, flex: 1 }}
              placeholder="Novo motivo de perda (ex: Preço alto)"
              value={novo}
              onChange={e => setNovo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') criar() }}
            />
            <button onClick={criar} style={btnPrimary}>+ Adicionar</button>
          </div>
        </div>

        {carregando ? (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Carregando...</p>
        ) : motivos.length === 0 ? (
          <div style={{ ...card, padding: 24 }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Nenhum motivo cadastrado.</p>
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Motivo</th>
                  <th style={{ textAlign: 'center', padding: '12px 20px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Status</th>
                  <th style={{ padding: '12px 20px' }}></th>
                </tr>
              </thead>
              <tbody>
                {motivos.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #3a3a3c', opacity: m.ativo ? 1 : 0.5 }}>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: '#fff' }}>
                      {editando === m.id ? (
                        <input
                          autoFocus
                          style={{ ...inp, width: '100%' }}
                          value={valorEdit}
                          onChange={e => setValorEdit(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') salvarEdicao(m.id)
                            if (e.key === 'Escape') setEditando(null)
                          }}
                        />
                      ) : m.nome}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: m.ativo ? '#052e16' : '#3a3a3c',
                        color: m.ativo ? '#34d399' : '#9ca3af',
                        textTransform: 'uppercase', fontWeight: 600 }}>
                        {m.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        {editando === m.id ? (
                          <>
                            <button onClick={() => salvarEdicao(m.id)} style={{ fontSize: 11, color: '#34d399', background: 'none', border: 'none', cursor: 'pointer' }}>Salvar</button>
                            <button onClick={() => setEditando(null)} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditando(m.id); setValorEdit(m.nome) }} style={{ fontSize: 11, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>Editar</button>
                            <button onClick={() => alternarAtivo(m)} style={{ fontSize: 11, color: m.ativo ? '#fbbf24' : '#34d399', background: 'none', border: 'none', cursor: 'pointer' }}>
                              {m.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                            <button onClick={() => deletar(m)} style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>Deletar</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}