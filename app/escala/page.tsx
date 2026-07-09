'use client'

import { useEffect, useState, useRef } from 'react'

type Dia = { data: string; hi: string; hf: string }
type Ev = { chave: string; turma_id: string; modulo_id: string | null; codigo: string; cidade: string; tipo: string; dias: Dia[]; ini: string; escolha: string }

const fmt = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
const C = { bg: '#0f1115', card: '#1a1d24', border: '#2a2f3a', text: '#e5e7eb', faint: '#9ca3af', green: '#10b981', purple: '#a78bfa' }

function baixar(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500)
}

export default function Escala() {
  const [evs, setEvs] = useState<Ev[]>([])
  const [carregando, setCarregando] = useState(true)
  const toqueRef = useRef<Record<string, number>>({}) // chave -> quando foi tocada aqui (pra não sobrescrever no poll)

  // carrega e re-carrega sozinho a cada 12s (pra ver o que o outro marcou quase na hora)
  useEffect(() => {
    let ativo = true
    const carregar = () => fetch('/api/escala').then(r => r.json()).then(j => {
      if (!ativo || !j.ok) return
      setEvs(prev => {
        const local = Object.fromEntries(prev.map(e => [e.chave, e.escolha]))
        const agora = Date.now()
        return (j.eventos || []).map((e: Ev) => {
          const recente = (toqueRef.current[e.chave] || 0) > agora - 6000 // clique recente: mantém o local
          return recente && local[e.chave] ? { ...e, escolha: local[e.chave] } : e
        })
      })
    }).catch(() => {}).finally(() => { if (ativo) setCarregando(false) })
    carregar()
    const t = setInterval(carregar, 12000)
    return () => { ativo = false; clearInterval(t) }
  }, [])

  async function toggle(ev: Ev) {
    const nova = ev.escolha === 'douglas' ? 'julio' : 'douglas'
    toqueRef.current[ev.chave] = Date.now()
    setEvs(prev => prev.map(e => e.chave === ev.chave ? { ...e, escolha: nova } : e))
    await fetch('/api/escala', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: ev.chave, turma_id: ev.turma_id, modulo_id: ev.modulo_id, escolha: nova }) }).catch(() => {})
  }

  const meus = evs.filter(e => e.escolha === 'douglas')
  const nDoug = meus.length, nJulio = evs.length - nDoug

  // ---- exports (só as aulas do Douglas) ----
  const linhas = () => meus.flatMap(e => e.dias.map(d => ({ data: d.data, hora: `${d.hi} às ${d.hf}`, turma: e.codigo, cidade: e.cidade, tipo: e.tipo })))

  function exportarICS() {
    const pad = (s: string) => s.replace(/[-:]/g, '')
    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Carreira no Digital//Escala//PT\r\nCALSCALE:GREGORIAN\r\n'
    for (const e of meus) for (const d of e.dias) {
      const dt = pad(d.data) + 'T' + pad(d.hi) + '00', df = pad(d.data) + 'T' + pad(d.hf) + '00'
      ics += 'BEGIN:VEVENT\r\n'
      ics += `UID:${e.chave}-${d.data}@carreiranodigital\r\n`
      ics += `DTSTART:${dt}\r\nDTEND:${df}\r\n`
      ics += `SUMMARY:Aula ${e.codigo}${e.tipo === 'Gestor de Tráfego' ? ' — Gestor de Tráfego' : ''}\r\n`
      if (e.cidade) ics += `LOCATION:${e.cidade}\r\n`
      ics += 'END:VEVENT\r\n'
    }
    ics += 'END:VCALENDAR\r\n'
    baixar('minha-escala.ics', new Blob([ics], { type: 'text/calendar' }))
  }
  function exportarDOC() {
    const rows = linhas().map(l => `<tr><td>${fmt(l.data)}</td><td>${l.hora}</td><td>${l.turma}</td><td>${l.cidade}</td><td>${l.tipo === 'ANL' ? 'Anúncios (turma)' : 'Gestor de Tráfego'}</td></tr>`).join('')
    const html = `<html><head><meta charset="utf-8"></head><body style="font-family:Arial"><h2>Minha escala — Douglas</h2><table border="1" cellspacing="0" cellpadding="6"><tr style="background:#eee"><th>Data</th><th>Horário</th><th>Turma</th><th>Cidade</th><th>Tipo</th></tr>${rows}</table></body></html>`
    baixar('minha-escala.doc', new Blob(['﻿' + html], { type: 'application/msword' }))
  }
  function exportarCSV() {
    const head = 'Data;Horário;Turma;Cidade;Tipo'
    const rows = linhas().map(l => [fmt(l.data), l.hora, l.turma, l.cidade, l.tipo === 'ANL' ? 'Anúncios (turma)' : 'Gestor de Tráfego'].join(';'))
    baixar('minha-escala.csv', new Blob(['﻿' + [head, ...rows].join('\r\n')], { type: 'text/csv' }))
  }

  const bExp = { flex: 1, minWidth: 130, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, fontWeight: 700, padding: '11px 10px', cursor: nDoug ? 'pointer' : 'not-allowed', opacity: nDoug ? 1 : 0.4 } as React.CSSProperties

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif', padding: '28px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>Escala de aulas — Douglas</h1>
        <p style={{ fontSize: 14, color: C.faint, margin: '0 0 18px', lineHeight: 1.5 }}>
          Toca nas aulas que <b style={{ color: C.text }}>você vai dar</b>. As <b style={{ color: C.text }}>desmarcadas</b> vão pro Julio. Salva sozinho. No fim, <b style={{ color: C.text }}>exporta a tua agenda</b> embaixo.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
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
                  style={{ textAlign: 'left', background: meu ? 'rgba(16,185,129,0.10)' : C.card, border: `1px solid ${meu ? C.green : C.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, border: `2px solid ${meu ? C.green : C.border}`, background: meu ? C.green : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#0f1115', fontWeight: 900, fontSize: 16 }}>{meu ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{ev.dias.map(d => fmt(d.data)).join(', ')} <span style={{ fontSize: 12, color: C.faint, fontWeight: 400 }}>· {ev.dias[0].hi}</span></div>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{ev.codigo}{ev.cidade ? ` · ${ev.cidade}` : ''}{ev.tipo === 'Gestor de Tráfego' ? ' · Gestor de Tráfego' : ''}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: meu ? C.green : C.purple, flexShrink: 0 }}>{meu ? 'Você faz' : 'Julio'}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Exportar */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Exportar a minha agenda ({nDoug} aula{nDoug === 1 ? '' : 's'})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={bExp} disabled={!nDoug} onClick={exportarICS}>📅 Google Agenda</button>
            <button style={bExp} disabled={!nDoug} onClick={exportarDOC}>📄 Word</button>
            <button style={bExp} disabled={!nDoug} onClick={exportarCSV}>📊 Excel</button>
          </div>
          <p style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Google Agenda: baixa um arquivo <b>.ics</b> — abre e ele importa os horários no teu calendário.</p>
        </div>
      </div>
    </div>
  )
}
