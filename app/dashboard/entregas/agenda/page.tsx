'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const btn: React.CSSProperties = { border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, cursor: 'pointer' }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const iso = (d: Date) => d.toISOString().slice(0, 10)
const hora = (d?: string | null) => {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

function inicioDaSemana(base: Date) {
  const d = new Date(base)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export default function AgendaEntregas() {
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()))
  const [itens, setItens] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarPrevistos, setMostrarPrevistos] = useState(true)

  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(semana); d.setDate(d.getDate() + i); return d })

  async function carregar() {
    setCarregando(true)
    const de = iso(dias[0]), ate = iso(dias[6])
    const j = await fetchAuth(`/api/projetos/agenda?de=${de}&ate=${ate}`).then(r => r.json()).catch(() => null)
    setItens(j?.ok ? j.itens : [])
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [semana])

  const visiveis = itens.filter(i => mostrarPrevistos || i.estado !== 'previsto')
  const doDia = (d: Date) => visiveis.filter(i => String(i.data).slice(0, 10) === iso(d))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))

  const hoje = iso(new Date())
  const aReconfirmar = itens.filter(i => i.situacao === 'confirmar' || i.situacao === 'a_remarcar').length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1180, margin: '0 auto' }}>
      <Link href="/dashboard/entregas" style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>← Entregas</Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Agenda de entregas</h1>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <button style={btn} onClick={() => { const d = new Date(semana); d.setDate(d.getDate() - 7); setSemana(d) }}>←</button>
          <button style={btn} onClick={() => setSemana(inicioDaSemana(new Date()))}>Hoje</button>
          <button style={btn} onClick={() => { const d = new Date(semana); d.setDate(d.getDate() + 7); setSemana(d) }}>→</button>
          <label style={{ ...btn, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={mostrarPrevistos} onChange={e => setMostrarPrevistos(e.target.checked)} />
            mostrar previstos
          </label>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '6px 0 0' }}>
        {dias[0].toLocaleDateString('pt-BR')} a {dias[6].toLocaleDateString('pt-BR')}
        {aReconfirmar > 0 && <> · <b style={{ color: 'var(--amber)' }}>{aReconfirmar} a reconfirmar</b></>}
      </p>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 24 }}>Carregando…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 7, marginTop: 16 }}>
          {dias.map(d => {
            const eHoje = iso(d) === hoje
            const lista = doDia(d)
            return (
              <div key={iso(d)} style={{ ...card, padding: 9, minHeight: 190, background: eHoje ? 'var(--surface-2)' : 'var(--surface)', borderColor: eHoje ? 'var(--accent)' : 'var(--border)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: eHoje ? 'var(--accent)' : 'var(--text-faint)' }}>
                  {DIAS[d.getDay()]} {String(d.getDate()).padStart(2, '0')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {lista.map(i => {
                    const previsto = i.estado === 'previsto'
                    const combinado = i.estado === 'combinado'
                    const alerta = i.situacao === 'atrasado' || i.situacao === 'a_remarcar'
                    return (
                      <Link key={i.id} href={`/dashboard/entregas/${i.projeto_id}`} style={{
                        textDecoration: 'none',
                        display: 'block',
                        padding: '7px 8px',
                        borderRadius: 7,
                        // previsto = sombra tracejada, não ocupa o dia
                        // combinado = sólido pontilhado, falta reconfirmar
                        // confirmado = sólido limpo
                        background: previsto ? 'transparent' : alerta ? 'var(--amber-bg)' : `${i.cor}22`,
                        border: previsto ? '1px dashed var(--border-strong)' : combinado ? `1px dotted ${i.cor}` : `1px solid ${i.cor}`,
                        opacity: previsto ? .72 : 1,
                      }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.cliente}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.titulo}</div>
                        <div style={{ fontSize: 10, color: alerta ? 'var(--amber)' : 'var(--text-faint)', marginTop: 3, fontWeight: alerta ? 700 : 400 }}>
                          {previsto ? 'previsto' : i.tem_hora ? hora(i.data) : ''}
                          {i.situacao === 'confirmar' && ' · confirmar'}
                          {i.situacao === 'a_remarcar' && ' · remarcar'}
                          {i.situacao === 'atrasado' && ' · atrasado'}
                        </div>
                      </Link>
                    )
                  })}
                  {!lista.length && <div style={{ fontSize: 11, color: 'var(--text-faint)', opacity: .55 }}>—</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* a semana em texto — pra bater o olho sem contar quadradinho */}
      {!carregando && (
        <div style={{ ...card, padding: 14, marginTop: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>A semana</div>
          {visiveis.length ? visiveis.sort((a, b) => String(a.data).localeCompare(String(b.data))).map(i => (
            <div key={i.id} style={{ fontSize: 13, color: 'var(--text-2)', padding: '4px 0' }}>
              <b style={{ color: 'var(--text)' }}>{DIAS[new Date(String(i.data).slice(0, 10) + 'T12:00:00').getDay()]} {String(i.data).slice(8, 10)}</b>
              {' · '}{i.cliente} — {i.titulo}
              {i.estado === 'previsto' ? <span style={{ color: 'var(--text-faint)' }}> (previsto)</span> : i.tem_hora ? ` ${hora(i.data)}` : ''}
              {i.situacao === 'confirmar' && <span style={{ color: 'var(--amber)' }}> · confirmar</span>}
              {i.situacao === 'a_remarcar' && <span style={{ color: 'var(--amber)' }}> · remarcar</span>}
            </div>
          )) : <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nada nessa semana.</div>}
        </div>
      )}
    </div>
  )
}
