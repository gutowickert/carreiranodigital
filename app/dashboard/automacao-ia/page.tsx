'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com', 'tizonmidia@gmail.com']
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text)', outline: 'none' }

export default function AutomacaoIA() {
  const [email, setEmail] = useState('')
  const [bloqueado, setBloqueado] = useState<boolean | null>(null)
  const [c, setC] = useState<any>(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const e = (session?.user?.email || '').toLowerCase()
      setEmail(e); setBloqueado(!PERMITIDOS.includes(e))
      if (PERMITIDOS.includes(e)) { const j = await fetch(`/api/automacao-ia?email=${encodeURIComponent(e)}`).then(r => r.json()); if (j.ok) setC(j.config) }
    })()
  }, [])

  async function salvar(patch: any) {
    const j = await fetch('/api/automacao-ia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...patch }) }).then(r => r.json())
    if (j.ok) { setC(j.config); setAviso('💾 Salvo!'); setTimeout(() => setAviso(''), 2500) }
  }

  if (bloqueado === null || !c && !bloqueado) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando...</div>
  if (bloqueado) return <div style={{ padding: 40 }}><h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Automação IA</h1><p style={{ fontSize: 14, color: 'var(--text-faint)', marginTop: 8 }}>Área restrita.</p></div>

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🤖 Automação da IA de Atendimento</h1>
        {aviso && <span style={{ fontSize: 13, color: 'var(--green)' }}>{aviso}</span>}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 24px' }}>Liga/desliga e configura a IA de vendas. Segue o pipeline de 9 dias.</p>

      {/* botão mestre */}
      <div style={{ ...card, padding: 20, marginBottom: 18, borderColor: c.ativa ? 'var(--green)' : 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.ativa ? 'var(--green-strong)' : 'var(--text)' }}>{c.ativa ? '🟢 IA LIGADA' : '⚫ IA DESLIGADA'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>{c.ativa ? (c.modo === 'auto' ? 'Enviando sozinha (automático)' : 'Sugerindo rascunho (humano envia)') : 'Nenhuma automação rodando'}</div>
          </div>
          <button onClick={() => salvar({ ativa: !c.ativa })}
            style={{ background: c.ativa ? 'var(--red)' : 'var(--green)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {c.ativa ? 'Desligar' : '⚡ Ligar em 1 clique'}
          </button>
        </div>
      </div>

      {/* modo */}
      <div style={{ ...card, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Modo</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[{ v: 'semi', t: '✍️ Semi-automático', d: 'IA rascunha, humano revisa e envia (seguro)' }, { v: 'auto', t: '🚀 Automático', d: 'IA envia sozinha (só depois de validar)' }].map(o => (
            <button key={o.v} onClick={() => salvar({ modo: o.v })} style={{ flex: '1 1 240px', textAlign: 'left', border: `1px solid ${c.modo === o.v ? 'var(--accent)' : 'var(--border-strong)'}`, background: c.modo === o.v ? 'var(--accent-bg)' : 'var(--surface-2)', borderRadius: 10, padding: 12, cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.modo === o.v ? 'var(--accent-soft)' : 'var(--text)' }}>{o.t}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{o.d}</div>
            </button>
          ))}
        </div>
      </div>

      {/* horário + fallback */}
      <div style={{ ...card, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Regras de ativação</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: 'var(--text-2)' }}>Horário comercial: <input type="time" value={c.hora_ini} onChange={e => setC({ ...c, hora_ini: e.target.value })} onBlur={e => salvar({ hora_ini: e.target.value })} style={{ ...inp, width: 110, marginLeft: 6 }} /> às <input type="time" value={c.hora_fim} onChange={e => setC({ ...c, hora_fim: e.target.value })} onBlur={e => salvar({ hora_fim: e.target.value })} style={{ ...inp, width: 110, marginLeft: 6 }} /></label>
          <label style={{ fontSize: 13, color: 'var(--text-2)' }}>Assume após <input type="number" min={1} value={c.fallback_horas} onChange={e => setC({ ...c, fallback_horas: +e.target.value })} onBlur={e => salvar({ fallback_horas: +e.target.value })} style={{ ...inp, width: 70, marginLeft: 6 }} /> h sem resposta</label>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>Regra: equipe tenta 2 ligações → WhatsApp → {c.fallback_horas}h sem resposta → IA assume. Fora do horário comercial, a IA assume na hora.</div>
      </div>

      <div style={{ ...card, padding: 16, background: 'var(--surface-2)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <b>O que a IA faz (pipeline de 9 dias):</b> recebe/assume o lead → descobre cidade/curso → apresenta preço e lote → mede interesse → oferece bolsa (dias 7-9, só interessado) → fecha (link/sinal). Reabre conversa fria, re-etiqueta turma que passou, agenda ligação com especialista quando cabe. Segue os <b>ajustes</b> que a equipe define no Agente Interno.
        </div>
      </div>
    </div>
  )
}
