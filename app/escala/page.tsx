'use client'

import { useEffect, useState } from 'react'

type Ev = { chave: string; turma_id: string; modulo_id: string | null; codigo: string; tipo: string; dias: string[]; ini: string; escolha: string }

const fmt = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
const C = { bg: '#0f1115', card: '#1a1d24', card2: '#22262f', border: '#2a2f3a', text: '#e5e7eb', faint: '#9ca3af', green: '#10b981', purple: '#a78bfa' }

export default function Escala() {
  const [evs, setEvs] = useState<Ev[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => { fetch('/api/escala').then(r => r.json()).then(j => { if (j.ok) setEvs(j.eventos || []) }).finally(() => setCarregando(false)) }, [])

  async function toggle(ev: Ev) {
    const nova = ev.escolha === 'douglas' ? 'julio' : 'douglas'
    setEvs(prev => prev.map(e => e.chave === ev.chave ? { ...e, escolha: nova } : e))
    setSalvando(ev.chave)
    await fetch('/api/escala', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: ev.chave, turma_id: ev.turma_id, modulo_id: ev.modulo_id, escolha: nova }) }).catch(() => {})
    setSalvando(null)
  }

  const nDoug = evs.filter(e => e.escolha === 'douglas').length
  const nJulio = evs.length - nDoug

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif', padding: '28px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>Escala de aulas — Douglas</h1>
        <p style={{ fontSize: 14, color: C.faint, margin: '0 0 18px', lineHeight: 1.5 }}>
          Toca nas aulas que <b style={{ color: C.text }}>você vai dar</b>. As que ficarem <b style={{ color: C.text }}>desmarcadas</b> vão pro Julio. Salva sozinho.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: C.faint }}>Você (Douglas)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.green }}>{nDoug}</div>
          </div>
          <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: C.faint }}>Sobra pro Julio</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.purple }}>{nJulio}</div>
          </div>
        </div>

        {carregando ? <div style={{ color: C.faint }}>Carregando...</div> : evs.length === 0 ? <div style={{ color: C.faint }}>Nenhuma aula aberta no momento.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {evs.map(ev => {
              const meu = ev.escolha === 'douglas'
              return (
                <button key={ev.chave} onClick={() => toggle(ev)}
                  style={{ textAlign: 'left', background: meu ? 'rgba(16,185,129,0.10)' : C.card, border: `1px solid ${meu ? C.green : C.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all .15s' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, border: `2px solid ${meu ? C.green : C.border}`, background: meu ? C.green : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#0f1115', fontWeight: 900, fontSize: 16 }}>{meu ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{ev.dias.map(fmt).join(', ')}</div>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{ev.codigo}{ev.tipo === 'Gestor de Tráfego' ? ' · Gestor de Tráfego' : ''}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: meu ? C.green : C.purple, flexShrink: 0 }}>{meu ? 'Você faz' : 'Julio'}</div>
                </button>
              )
            })}
          </div>
        )}

        <p style={{ fontSize: 12, color: C.faint, marginTop: 20, textAlign: 'center' }}>Pode marcar/desmarcar à vontade — o Guto vê o resultado em tempo real.</p>
      </div>
    </div>
  )
}
