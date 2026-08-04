'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

type Conta = { id: string; nome: string; ativo: boolean; saldo: number }
type Transf = { id: string; origem: string; destino: string; valor: number; data: string; observacao: string; por: string }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 11px', fontSize: 14, color: 'var(--text)', outline: 'none', width: '100%' }
const money = (n: number) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (iso: string) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : ''
const hojeISO = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function Transferencias() {
  const [contas, setContas] = useState<Conta[]>([])
  const [transf, setTransf] = useState<Transf[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState({ origem: '', destino: '', valor: '', data: hojeISO(), observacao: '' })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  async function carregar() {
    const j = await fetchAuth('/api/transferencias').then(r => r.json()).catch(() => null)
    if (j?.ok) { setContas(j.contas); setTransf(j.transferencias) }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function salvar() {
    setMsg('')
    if (!form.origem || !form.destino) return setMsg('escolha origem e destino')
    if (form.origem === form.destino) return setMsg('origem e destino não podem ser iguais')
    const valor = Number(String(form.valor).replace(/\./g, '').replace(',', '.'))
    if (!(valor > 0)) return setMsg('valor inválido')
    setSalvando(true)
    const r = await fetchAuth('/api/transferencias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, valor }) }).then(r => r.json()).catch(() => ({ ok: false, error: 'erro de rede' }))
    setSalvando(false)
    if (r.ok) { setForm({ origem: '', destino: '', valor: '', data: hojeISO(), observacao: '' }); setMsg('✅ transferência registrada'); carregar() }
    else setMsg('⚠️ ' + (r.error || 'falha'))
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '18px 14px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>🔄 Transferências entre Contas</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 18px' }}>Movimento neutro (não conta como receita/despesa) — só ajusta o saldo das contas. Use pra registrar saques da HeroSpark pro banco, aportes, etc.</p>

      {/* saldos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        {contas.filter(c => c.ativo).map(c => (
          <div key={c.id} style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>{c.nome}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.saldo < 0 ? 'var(--alert, #dc2626)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(c.saldo)}</div>
          </div>
        ))}
      </div>

      {/* nova transferência */}
      <div style={{ ...card, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Nova transferência</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>De (origem)</label>
            <select style={inp} value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}>
              <option value="">—</option>{contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>Para (destino)</label>
            <select style={inp} value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value }))}>
              <option value="">—</option>{contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>Valor</label>
            <input style={inp} placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>Data</label>
            <input type="date" style={inp} value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>Observação (opcional)</label>
            <input style={inp} placeholder="Ex.: saque HeroSpark 02/08" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={salvar} disabled={salvando} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: salvando ? .6 : 1 }}>{salvando ? 'Salvando…' : 'Registrar transferência'}</button>
          {msg && <span style={{ fontSize: 13, color: msg.startsWith('✅') ? 'var(--green, #16a34a)' : 'var(--alert, #dc2626)' }}>{msg}</span>}
        </div>
      </div>

      {/* histórico */}
      <div style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>Histórico ({transf.length})</div>
      {carregando ? <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>Carregando…</p> :
        transf.length === 0 ? <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>Nenhuma transferência registrada ainda.</p> :
          <div style={{ ...card, overflow: 'hidden' }}>
            {transf.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', width: 74, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{dataBR(t.data)}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                  <b>{t.origem}</b> <span style={{ color: 'var(--text-faint)' }}>→</span> <b>{t.destino}</b>
                  {t.observacao && <span style={{ color: 'var(--text-faint)' }}> · {t.observacao}</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(t.valor)}</div>
              </div>
            ))}
          </div>}
    </div>
  )
}
