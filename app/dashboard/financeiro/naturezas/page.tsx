'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties
const btnSec = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties

type Nat = { id: string; chave: string; nome: string; ativo: boolean; ordem: number }

// gera a "chave" técnica a partir do nome (sem acento, minúsculo, _)
function slug(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

export default function Naturezas() {
  const [nats, setNats] = useState<Nat[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novoNome, setNovoNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  useEffect(() => { carregar() }, [])
  async function carregar() {
    setCarregando(true)
    const { data } = await supabase.from('naturezas_financeiras').select('*').order('ordem').order('nome')
    setNats(data || []); setCarregando(false)
  }

  async function adicionar() {
    const nome = novoNome.trim()
    if (!nome) return
    setSalvando(true); setMsg('')
    let chave = slug(nome)
    if (!chave) { setMsg('Nome inválido.'); setSalvando(false); return }
    if (nats.some(n => n.chave === chave)) chave = chave + '_' + Date.now().toString().slice(-4)
    const ordem = nats.reduce((m, n) => Math.max(m, n.ordem), 0) + 1
    const { error } = await supabase.from('naturezas_financeiras').insert({ chave, nome, ordem, ativo: true })
    if (error) { setMsg('Erro: ' + error.message); setSalvando(false); return }
    setNovoNome(''); setSalvando(false); carregar()
  }

  async function renomear(n: Nat) {
    const nome = editNome.trim()
    if (!nome) { setEditId(null); return }
    await supabase.from('naturezas_financeiras').update({ nome }).eq('id', n.id)
    setEditId(null); carregar()
  }

  async function toggleAtivo(n: Nat) {
    await supabase.from('naturezas_financeiras').update({ ativo: !n.ativo }).eq('id', n.id)
    carregar()
  }

  return (
    <div style={{ padding: '24px', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Naturezas financeiras</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Categorias que aparecem nos lançamentos (entradas e saídas). Crie, renomeie ou desative.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/financeiro/fluxo" style={{ ...btnSec, textDecoration: 'none' }}>Fluxo de caixa</Link>
          <Link href="/dashboard/financeiro" style={{ ...btnSec, textDecoration: 'none' }}>Financeiro</Link>
        </div>
      </div>

      <div style={{ ...card, padding: 16, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nova natureza (ex: Aluguel, Pró-labore, Comissão...)" style={{ ...input, flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') adicionar() }} />
        <button onClick={adicionar} disabled={salvando || !novoNome.trim()} style={btnPrimary}>+ Adicionar</button>
      </div>
      {msg && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{msg}</p>}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {carregando ? <p style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)' }}>Carregando...</p>
          : nats.length === 0 ? <p style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma natureza cadastrada.</p>
            : nats.map(n => (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--border)', opacity: n.ativo ? 1 : 0.55 }}>
                {editId === n.id ? (
                  <>
                    <input value={editNome} onChange={e => setEditNome(e.target.value)} style={{ ...input, flex: 1 }} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') renomear(n); if (e.key === 'Escape') setEditId(null) }} />
                    <button onClick={() => renomear(n)} style={btnPrimary}>Salvar</button>
                    <button onClick={() => setEditId(null)} style={btnSec}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{n.nome}{!n.ativo && <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>(inativa)</span>}</span>
                    <button onClick={() => { setEditId(n.id); setEditNome(n.nome) }} style={btnSec}>Renomear</button>
                    <button onClick={() => toggleAtivo(n)} style={btnSec}>{n.ativo ? 'Desativar' : 'Ativar'}</button>
                  </>
                )}
              </div>
            ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>Desativar não apaga lançamentos antigos — só some das opções de novos lançamentos. Não dá pra excluir uma natureza (pra não perder o histórico).</p>
    </div>
  )
}
