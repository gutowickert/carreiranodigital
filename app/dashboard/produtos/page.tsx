'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', width: '100%' }
const label: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }
const TIPOS = ['Serviço', 'Programa', 'Curso', 'Produto digital', 'Consultoria', 'Outro']
const MODALIDADES = ['', 'Presencial', 'Online', 'Híbrido']
const vazio = { id: null, nome: '', tipo: 'Serviço', modalidade: '', preco_venda: '', agendavel: false, descricao: '', ativo: true }

export default function Produtos() {
  const [lista, setLista] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [f, setF] = useState<any>({ ...vazio })
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/produtos').then(r => r.json()).catch(() => null)
    if (j?.ok) setLista(j.produtos)
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function salvar() {
    if (!f.nome.trim()) return
    setSalvando(true)
    await fetchAuth('/api/produtos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).then(r => r.json()).catch(() => ({}))
    setSalvando(false)
    setF({ ...vazio })
    carregar()
  }
  async function desativar(id: string) {
    if (!confirm('Desativar esse produto? (some das ofertas, mas mantém o histórico)')) return
    await fetchAuth('/api/produtos?id=' + id, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}))
    carregar()
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🛍️ Produtos & Ofertas</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 18px' }}>O que o seu negócio vende — a IA e o funil usam esses produtos nas ofertas.</p>

      {/* Form novo/editar */}
      <div style={{ ...card, padding: 16, marginBottom: 20, border: f.id ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>{f.id ? 'Editando produto' : 'Novo produto'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <div><label style={label}>Nome *</label><input style={inp} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex: Massagem Avaliativa" /></div>
          <div><label style={label}>Tipo</label><select style={inp} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label style={label}>Modalidade</label><select style={inp} value={f.modalidade} onChange={e => setF({ ...f, modalidade: e.target.value })}>{MODALIDADES.map(m => <option key={m} value={m}>{m || '—'}</option>)}</select></div>
          <div><label style={label}>Preço (R$)</label><input type="number" style={inp} value={f.preco_venda} onChange={e => setF({ ...f, preco_venda: e.target.value })} placeholder="0,00" /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.agendavel} onChange={e => setF({ ...f, agendavel: e.target.checked })} /> Agendável (precisa marcar horário)
            </label>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><label style={label}>Descrição (o que é, pra IA usar)</label><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={salvar} disabled={salvando || !f.nome.trim()} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (salvando || !f.nome.trim()) ? .6 : 1 }}>{salvando ? 'Salvando…' : f.id ? 'Salvar alterações' : '+ Adicionar produto'}</button>
          {f.id && <button onClick={() => setF({ ...vazio })} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>Cancelar edição</button>}
        </div>
      </div>

      {/* Lista */}
      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 20 }}>Carregando…</div>
        : lista.length === 0 ? <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--text-faint)' }}>Nenhum produto ainda. Cadastre o primeiro acima. 👆</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lista.map(p => (
                <div key={p.id} style={{ ...card, padding: 14, display: 'flex', alignItems: 'center', gap: 12, opacity: p.ativo ? 1 : .5 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.nome} {!p.ativo && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>(inativo)</span>}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{[p.tipo, p.modalidade, p.agendavel ? '📅 agendável' : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  {p.preco_venda != null && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-strong)' }}>R$ {Number(p.preco_venda).toLocaleString('pt-BR')}</div>}
                  <button onClick={() => { setF({ id: p.id, nome: p.nome, tipo: p.tipo || 'Serviço', modalidade: p.modalidade || '', preco_venda: p.preco_venda ?? '', agendavel: !!p.agendavel, descricao: p.descricao || '', ativo: p.ativo }); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Editar</button>
                  {p.ativo && <button onClick={() => desativar(p.id)} style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>Desativar</button>}
                </div>
              ))}
            </div>
          )}
    </div>
  )
}
