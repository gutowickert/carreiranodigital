'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function quando(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  const dow = DOW[Number(new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay())]
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  return `${dia} (${dow}) ${hora}`
}

const TIPOS: Record<string, { label: string; emoji: string; cor: string }> = {
  turma_aberta: { label: 'Turma aberta', emoji: '🎓', cor: 'var(--blue)' },
  ultimas_vagas: { label: 'Últimas vagas', emoji: '⏳', cor: 'var(--amber)' },
  ultima_chamada: { label: 'Última chamada', emoji: '🚨', cor: 'var(--red)' },
}
const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  planejado: { label: 'Planejado', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  confirmado: { label: 'Confirmado ✓', cor: 'var(--green)', bg: 'var(--green-bg)' },
  enviado: { label: 'Enviado', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  cancelado: { label: 'Cancelado', cor: 'var(--text-faint)', bg: 'var(--surface-2)' },
}

function Disparo({ d, onAcao }: { d: any; onAcao: (id: string, acao: string) => void }) {
  const t = TIPOS[d.tipo] || { label: d.tipo, emoji: '•', cor: 'var(--text-muted)' }
  const s = STATUS[d.status] || STATUS.planejado
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'flex-start', opacity: d.status === 'cancelado' ? 0.55 : 1 }}>
      <div style={{ minWidth: 130 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.cor }}>{t.emoji} {t.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{quando(d.data_agendada)}</div>
        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: s.cor, background: s.bg }}>{s.label}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{d.copy}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {d.status === 'planejado' && <button onClick={() => onAcao(d.id, 'confirmar')} style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Confirmar</button>}
        {d.status === 'confirmado' && <button onClick={() => onAcao(d.id, 'replanejar')} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Desfazer</button>}
        {d.status !== 'cancelado' && d.status !== 'enviado' && <button onClick={() => onAcao(d.id, 'cancelar')} style={{ background: 'none', color: 'var(--text-faint)', border: 'none', fontSize: 11, cursor: 'pointer' }}>cancelar</button>}
        {d.status === 'cancelado' && <button onClick={() => onAcao(d.id, 'replanejar')} style={{ background: 'none', color: 'var(--accent-soft)', border: 'none', fontSize: 11, cursor: 'pointer' }}>restaurar</button>}
      </div>
    </div>
  )
}

export default function AgendaDisparos() {
  const [turmas, setTurmas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [msg, setMsg] = useState('')

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/wa-oficial/agenda').then(r => r.json()).catch(() => null)
    if (j?.ok) setTurmas(j.turmas || [])
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function gerar() {
    setGerando(true); setMsg('')
    const j = await fetchAuth('/api/wa-oficial/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'gerar' }) }).then(r => r.json()).catch(() => null)
    setGerando(false)
    if (j?.ok) { setMsg(`✅ ${j.criados} disparo(s) planejados · ${j.turmasPuladas} turma(s) já tinham agenda.`); carregar() }
    else setMsg('Falha ao gerar: ' + (j?.error || '?'))
  }

  async function acao(id: string, ac: string) {
    await fetchAuth('/api/wa-oficial/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: ac, id }) }).then(r => r.json()).catch(() => null)
    carregar()
  }

  const comAgenda = turmas.filter(t => (t.disparos || []).length)
  const semAgenda = turmas.filter(t => !(t.disparos || []).length)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📣 Agenda de Disparos</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>3 toques por turma: 🎓 abertura (D-10) · ⏳ últimas vagas (D-5) · 🚨 última chamada (último dia útil). Fim de semana puxa pra sexta. Nada sai sem você confirmar.</p>
        </div>
        <button onClick={gerar} disabled={gerando} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: gerando ? 0.6 : 1 }}>{gerando ? 'Gerando…' : '✨ Gerar agenda'}</button>
      </div>
      {msg && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>{msg}</div>}

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 40 }}>Carregando…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
          {turmas.length === 0 && <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Nenhuma turma aberta pra agendar disparos.</div>}

          {comAgenda.map(t => (
            <div key={t.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{t.produto} — {t.cidade}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t.codigo} · início {t.data_inicio.slice(8, 10)}/{t.data_inicio.slice(5, 7)} · {t.status}</div>
              </div>
              {t.disparos.map((d: any) => <Disparo key={d.id} d={d} onAcao={acao} />)}
            </div>
          ))}

          {semAgenda.length > 0 && (
            <div style={{ ...card, padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Turmas sem agenda ainda ({semAgenda.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {semAgenda.map(t => (
                  <span key={t.id} style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px' }}>
                    {t.produto} — {t.cidade} <span style={{ color: 'var(--text-faint)' }}>({t.data_inicio.slice(8, 10)}/{t.data_inicio.slice(5, 7)})</span>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>Clica em “Gerar agenda” pra criar o plano de disparos delas.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
