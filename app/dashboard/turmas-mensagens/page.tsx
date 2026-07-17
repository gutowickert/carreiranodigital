'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

type Turma = { codigo: string; cidade: string; produto: string; tipo: string; inicio: string; mensagem: string }
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }

export default function TurmasMensagens() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [carregando, setCarregando] = useState(true)
  const [copiado, setCopiado] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'FC' | 'ANL'>('todos')

  useEffect(() => { (async () => { const j = await fetchAuth('/api/turmas/mensagens').then(r => r.json()).catch(() => null); if (j?.ok) setTurmas(j.turmas); setCarregando(false) })() }, [])

  async function copiar(t: Turma) {
    try { await navigator.clipboard.writeText(t.mensagem) } catch { }
    setCopiado(t.codigo); setTimeout(() => setCopiado(''), 2000)
  }
  const lista = turmas.filter(t => filtro === 'todos' || t.tipo === filtro)
  const brData = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📅 Datas das Turmas</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 18px' }}>Mensagens prontas com as datas de cada turma em vendas — é só copiar e colar no WhatsApp.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {([['todos', 'Todas'], ['FC', 'Formação Completa'], ['ANL', 'ANL']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} style={{ background: filtro === k ? 'var(--accent)' : 'var(--surface-2)', color: filtro === k ? 'var(--on-accent)' : 'var(--text-2)', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t}</button>
        ))}
      </div>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div>
        : lista.length === 0 ? <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--text-faint)' }}>Nenhuma turma em vendas.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {lista.map(t => (
                <div key={t.codigo} style={{ ...card, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t.cidade}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>{t.tipo === 'FC' ? 'Formação Completa' : 'ANL'} · início {brData(t.inicio)} · {t.codigo}</span>
                    </div>
                    <button onClick={() => copiar(t)} style={{ background: copiado === t.codigo ? 'var(--green)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      {copiado === t.codigo ? '✅ Copiado!' : '📋 Copiar'}
                    </button>
                  </div>
                  <pre style={{ margin: 0, padding: 12, background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.5 }}>{t.mensagem}</pre>
                </div>
              ))}
            </div>
          )}
    </div>
  )
}
