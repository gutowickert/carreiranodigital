'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Produto = { id: string; nome: string }
type Modulo = { id: string; produto_id: string; nome: string; ordem: number; duracao_dias: number }

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const select = { ...input, cursor: 'pointer' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnGhost = { background: 'none', border: '1px solid var(--border-strong)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'var(--text-2)', cursor: 'pointer' } as React.CSSProperties
const btnDanger = { background: 'none', border: '1px solid var(--red-bg)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: 'var(--red)', cursor: 'pointer' } as React.CSSProperties

export default function Modulos() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [produtoId, setProdutoId] = useState('')
  const [modulos, setModulos] = useState<Modulo[]>([])
  const [carregando, setCarregando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => { carregarProdutos() }, [])
  useEffect(() => { if (produtoId) carregarModulos(produtoId); else setModulos([]) }, [produtoId])

  async function carregarProdutos() {
    const { data } = await supabase.from('produtos').select('id, nome').eq('ativo', true).order('nome')
    if (data) setProdutos(data)
  }

  async function carregarModulos(pid: string) {
    setCarregando(true)
    const { data } = await supabase.from('produto_modulos').select('*').eq('produto_id', pid).order('ordem')
    setModulos(data || [])
    setCarregando(false)
  }

  function setCampo(id: string, campo: 'nome' | 'duracao_dias', valor: string) {
    setModulos(prev => prev.map(m => m.id === id
      ? { ...m, [campo]: campo === 'duracao_dias' ? (parseInt(valor) || 0) : valor }
      : m))
  }

  async function salvarModulo(m: Modulo) {
    setMensagem('')
    const { error } = await supabase.from('produto_modulos')
      .update({ nome: m.nome, duracao_dias: m.duracao_dias }).eq('id', m.id)
    if (error) { setMensagem('Erro ao salvar: ' + error.message); return }
    setMensagem('Módulo salvo.')
    setTimeout(() => setMensagem(''), 1500)
  }

  async function adicionarModulo() {
    setMensagem('')
    const proximaOrdem = modulos.length > 0 ? Math.max(...modulos.map(m => m.ordem)) + 1 : 1
    const { error } = await supabase.from('produto_modulos')
      .insert({ produto_id: produtoId, nome: 'Novo módulo', ordem: proximaOrdem, duracao_dias: 1 })
    if (error) { setMensagem('Erro ao adicionar: ' + error.message); return }
    carregarModulos(produtoId)
  }

  async function excluirModulo(id: string) {
    if (!confirm('Excluir este módulo?')) return
    const { error } = await supabase.from('produto_modulos').delete().eq('id', id)
    if (error) { setMensagem('Erro ao excluir: ' + error.message); return }
    carregarModulos(produtoId)
  }

  // Troca a ordem com o vizinho (dir = -1 sobe, +1 desce)
  async function mover(index: number, dir: number) {
    const alvo = index + dir
    if (alvo < 0 || alvo >= modulos.length) return
    const a = modulos[index]
    const b = modulos[alvo]
    setMensagem('')
    await supabase.from('produto_modulos').update({ ordem: b.ordem }).eq('id', a.id)
    await supabase.from('produto_modulos').update({ ordem: a.ordem }).eq('id', b.id)
    carregarModulos(produtoId)
  }

  const totalAulas = modulos.reduce((s, m) => s + (m.duracao_dias || 0), 0)

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>Módulos do produto</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '4px' }}>
          Defina os módulos de cada curso: nome, número de aulas e ordem. A tela de abrir turma usa isso automaticamente.
        </p>
      </div>

      <div style={{ ...card, padding: '20px', marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Produto</label>
        <select value={produtoId} onChange={e => setProdutoId(e.target.value)} style={{ ...select, maxWidth: 420 }}>
          <option value="">Selecione um produto</option>
          {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {produtoId && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              {modulos.length} módulo(s) · {totalAulas} aula(s) no total
            </span>
            <button onClick={adicionarModulo} style={btnPrimary}>+ Adicionar módulo</button>
          </div>

          {carregando ? (
            <p style={{ padding: '20px', fontSize: '14px', color: 'var(--text-faint)' }}>Carregando...</p>
          ) : modulos.length === 0 ? (
            <p style={{ padding: '20px', fontSize: '14px', color: 'var(--text-faint)' }}>
              Nenhum módulo. Clique em "Adicionar módulo" para começar (um curso simples pode ter só 1).
            </p>
          ) : (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {modulos.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg)', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button onClick={() => mover(i, -1)} disabled={i === 0}
                      style={{ ...btnGhost, padding: '1px 7px', opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                    <button onClick={() => mover(i, 1)} disabled={i === modulos.length - 1}
                      style={{ ...btnGhost, padding: '1px 7px', opacity: i === modulos.length - 1 ? 0.3 : 1 }}>▼</button>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--accent-soft)', width: '52px', flexShrink: 0 }}>Módulo {i + 1}</span>
                  <input value={m.nome} onChange={e => setCampo(m.id, 'nome', e.target.value)}
                    placeholder="Nome do módulo" style={{ ...input, flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <input value={m.duracao_dias} onChange={e => setCampo(m.id, 'duracao_dias', e.target.value)}
                      type="number" min={1} style={{ ...input, width: '70px' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>aula(s)</span>
                  </div>
                  <button onClick={() => salvarModulo(m)} style={btnPrimary}>Salvar</button>
                  <button onClick={() => excluirModulo(m.id)} style={btnDanger}>Excluir</button>
                </div>
              ))}
            </div>
          )}

          {mensagem && (
            <p style={{ padding: '0 20px 16px', fontSize: '13px', color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green-strong)' }}>{mensagem}</p>
          )}
        </div>
      )}
    </div>
  )
}
