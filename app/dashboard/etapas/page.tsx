'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 9px', fontSize: 13, color: 'var(--text)', outline: 'none' }
const PAPEIS: [string, string][] = [['ativa', 'Ativa (negociação)'], ['parking', 'Espera (estacionamento)'], ['ganho', 'Ganho'], ['perda', 'Perda']]

export default function Etapas() {
  const [lista, setLista] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/etapas').then(r => r.json()).catch(() => null)
    if (j?.ok) setLista(j.etapas.filter((e: any) => e.ativo !== false))
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  function set(i: number, campo: string, v: any) { setLista(l => { const n = [...l]; n[i] = { ...n[i], [campo]: v }; return n }) }
  function mover(i: number, dir: number) { setLista(l => { const n = [...l]; const j = i + dir; if (j < 0 || j >= n.length) return l;[n[i], n[j]] = [n[j], n[i]]; return n }) }
  function remover(i: number) { if (!confirm('Remover essa etapa?')) return; setLista(l => l.filter((_, k) => k !== i)) }
  function adicionar() { setLista(l => [...l, { id: null, label: '', cor: '#60a5fa', papel: 'ativa', ativo: true }]) }

  async function salvar() {
    setSalvando(true); setMsg('')
    // manda a lista visível (ordem = posição) + as removidas como ativo:false
    const visiveis = lista.map((e, i) => ({ ...e, ordem: i, ativo: true }))
    const j = await fetchAuth('/api/etapas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapas: visiveis }) }).then(r => r.json()).catch(() => ({ ok: false }))
    setSalvando(false)
    setMsg(j.ok ? '✅ Etapas salvas!' : '⚠️ ' + (j.error || 'falha'))
    setTimeout(() => setMsg(''), 3000)
    carregar()
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📊 Etapas do Funil</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 18px' }}>As colunas do seu funil, na ordem. Cada negócio tem as suas — arraste com as setas, edite nome e cor.</p>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 20 }}>Carregando…</div> : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lista.map((e, i) => (
              <div key={e.id || i} style={{ ...card, padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button onClick={() => mover(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 11, opacity: i === 0 ? .3 : 1 }}>▲</button>
                  <button onClick={() => mover(i, 1)} disabled={i === lista.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 11, opacity: i === lista.length - 1 ? .3 : 1 }}>▼</button>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', width: 18, textAlign: 'center' }}>{i + 1}</span>
                <input type="color" style={{ ...inp, width: 40, height: 32, padding: 2 }} value={e.cor || '#60a5fa'} onChange={ev => set(i, 'cor', ev.target.value)} />
                <input style={{ ...inp, flex: 1 }} value={e.label} onChange={ev => set(i, 'label', ev.target.value)} placeholder="Nome da etapa" />
                <select style={{ ...inp, width: 190 }} value={e.papel || 'ativa'} onChange={ev => set(i, 'papel', ev.target.value)}>{PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button onClick={() => remover(i)} style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none', borderRadius: 8, padding: '6px 9px', fontSize: 12, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
            <button onClick={adicionar} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>+ Adicionar etapa</button>
            <button onClick={salvar} disabled={salvando} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: salvando ? .6 : 1 }}>{salvando ? 'Salvando…' : '💾 Salvar etapas'}</button>
            {msg && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{msg}</span>}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>Papel: <b>Ativa</b> = etapa de negociação (com follow-ups). <b>Espera</b> = lead parado aguardando (agendado, próxima turma). <b>Ganho/Perda</b> = fim do funil.</p>
        </>
      )}
    </div>
  )
}
