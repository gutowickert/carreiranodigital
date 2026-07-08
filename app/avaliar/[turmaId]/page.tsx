'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import Image from 'next/image'

const ROXO = '#7c3aed', ROXO_D = '#5b21b6'

function NotaRow({ label, valor, set, colorir }: { label: string; valor: number | null; set: (n: number) => void; colorir?: boolean }) {
  const cor = (n: number) => !colorir ? (valor === n ? ROXO : '#e5e7eb') : n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#10b981'
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Array.from({ length: 11 }, (_, n) => {
          const sel = valor === n
          return (
            <button key={n} onClick={() => set(n)} style={{
              width: 40, height: 40, borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700,
              border: sel ? `2px solid ${colorir ? cor(n) : ROXO}` : '1px solid #e5e7eb',
              background: sel ? (colorir ? cor(n) : ROXO) : '#fff', color: sel ? '#fff' : '#6b7280',
            }}>{n}</button>
          )
        })}
      </div>
    </div>
  )
}

export default function Avaliar({ params }: { params: Promise<{ turmaId: string }> }) {
  const { turmaId } = use(params)
  const [turma, setTurma] = useState<any>(null)
  const [nota, setNota] = useState<number | null>(null)
  const [prof, setProf] = useState<number | null>(null)
  const [cont, setCont] = useState<number | null>(null)
  const [estr, setEstr] = useState<number | null>(null)
  const [coment, setComent] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { fetch(`/api/nps?turma=${turmaId}`).then(r => r.json()).then(j => { if (j.ok) setTurma(j.turma) }) }, [turmaId])

  async function enviar() {
    if (nota === null) { setErro('Escolha a nota de recomendação (0 a 10).'); return }
    setEnviando(true); setErro('')
    try {
      const j = await fetch('/api/nps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turma_id: turmaId, nota, nota_professor: prof, nota_conteudo: cont, nota_estrutura: estr, comentario: coment }) }).then(r => r.json())
      if (j.ok) setPronto(true); else setErro(j.error || 'falha ao enviar')
    } catch { setErro('falha ao enviar') } finally { setEnviando(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf9ff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '28px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <Image src="/logo.png" alt="Carreira no Digital" width={190} height={64} style={{ width: 180, height: 'auto', objectFit: 'contain', margin: '0 auto' }} />
        </div>

        {pronto ? (
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 16, padding: 40, textAlign: 'center', boxShadow: '0 4px 20px rgba(124,58,237,0.08)' }}>
            <div style={{ fontSize: 46 }}>💜</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: ROXO_D, margin: '10px 0 6px' }}>Obrigado pela avaliação!</div>
            <div style={{ fontSize: 15, color: '#6b7280' }}>Sua opinião ajuda a gente a melhorar cada turma.</div>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(124,58,237,0.08)' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111', margin: '0 0 4px' }}>Como foi sua experiência?</h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 6px' }}>{turma ? `Turma ${turma.produto || ''} · ${turma.cidade || ''}` : 'Avaliação do curso'}</p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 22px' }}>É <b>anônimo</b> — pode ser 100% sincero. Leva 1 minutinho.</p>

            <NotaRow label="De 0 a 10, o quanto você recomendaria a Carreira no Digital a um amigo?" valor={nota} set={setNota} colorir />
            <NotaRow label="Nota para o professor" valor={prof} set={setProf} />
            <NotaRow label="Nota para o conteúdo do curso" valor={cont} set={setCont} />
            <NotaRow label="Nota para a estrutura / local" valor={estr} set={setEstr} />

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', marginBottom: 8 }}>Quer deixar um comentário? (opcional)</div>
              <textarea value={coment} onChange={e => setComent(e.target.value)} rows={3} placeholder="O que você mais gostou? O que podemos melhorar?" style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#111', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {erro && <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 10 }}>{erro}</div>}
            <button onClick={enviar} disabled={enviando} style={{ width: '100%', background: `linear-gradient(135deg, ${ROXO}, #a78bfa)`, color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontSize: 16, fontWeight: 800, cursor: enviando ? 'default' : 'pointer', boxShadow: '0 6px 18px rgba(124,58,237,0.35)' }}>
              {enviando ? 'Enviando...' : 'Enviar avaliação'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
