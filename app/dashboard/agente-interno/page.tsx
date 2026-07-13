'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com']
type Anexo = { tipo: 'image' | 'document'; media_type: string; data: string; nome: string }
type Msg = { role: 'user' | 'assistant'; content: string; anexos?: Anexo[] }
const btnTop: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }
const sugestoes = [
  'Quantas vendas e quanto faturamos nos últimos 30 dias?',
  'De onde vêm nossas vendas (por origem)?',
  'Qual o saldo do mês (receita, despesa)?',
  'Como está a ocupação das turmas em vendas?',
  'Qual nosso NPS e as notas médias?',
]

export default function AgenteInterno() {
  const [email, setEmail] = useState('')
  const [bloqueado, setBloqueado] = useState<boolean | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pensando, setPensando] = useState(false)
  const [salvas, setSalvas] = useState<any[]>([])
  const [mostrarSalvas, setMostrarSalvas] = useState(false)
  const [aviso, setAviso] = useState('')
  const [pendentes, setPendentes] = useState<Anexo[]>([])
  const [anexando, setAnexando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)
  const arqRef = useRef<HTMLInputElement>(null)
  const audRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const e = (session?.user?.email || '').toLowerCase()
      setEmail(e); setBloqueado(!PERMITIDOS.includes(e))
    })()
  }, [])
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, pensando])

  const lerBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]); r.onerror = rej; r.readAsDataURL(f) })

  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); e.target.value = ''
    setAnexando(true)
    for (const f of files) {
      if (f.size > 12 * 1024 * 1024) { setAviso('⚠️ arquivo acima de 12MB'); continue }
      const data = await lerBase64(f)
      const tipo = f.type === 'application/pdf' ? 'document' : 'image'
      setPendentes(p => [...p, { tipo, media_type: f.type, data, nome: f.name }])
    }
    setAnexando(false)
  }
  async function onAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const f = (e.target.files || [])[0]; e.target.value = ''
    if (!f) return
    setAnexando(true); setAviso('🎤 transcrevendo…')
    try {
      const data = await lerBase64(f)
      const j = await fetch('/api/agente/transcrever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: data, mime: f.type }) }).then(r => r.json())
      if (j.ok) { setInput(i => (i ? i + ' ' : '') + j.texto); setAviso('') } else setAviso(`⚠️ ${j.error}`)
    } finally { setAnexando(false) }
  }

  async function enviar(texto?: string) {
    const t = (texto ?? input).trim()
    if ((!t && !pendentes.length) || pensando) return
    const novo: Msg[] = [...msgs, { role: 'user', content: t, anexos: pendentes.length ? pendentes : undefined }]
    setMsgs(novo); setInput(''); setPendentes([]); setPensando(true)
    try {
      const j = await fetch('/api/agente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, mensagens: novo }) }).then(r => r.json())
      setMsgs(m => [...m, { role: 'assistant', content: j.ok ? j.resposta : `⚠️ ${j.error || 'erro'}` }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: '⚠️ falha de conexão' }])
    } finally { setPensando(false) }
  }

  async function salvar() {
    if (!msgs.length) { setAviso('Nada pra salvar ainda.'); return }
    const sugestao = msgs.find(m => m.role === 'user')?.content.slice(0, 60) || 'Conversa'
    const titulo = window.prompt('Dê um nome pra essa conversa (pra achar depois):', sugestao)
    if (titulo === null) return
    const j = await fetch('/api/agente/salvar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, titulo, mensagens: msgs }) }).then(r => r.json())
    setAviso(j.ok ? '💾 Salva!' : `⚠️ ${j.error}`)
    setTimeout(() => setAviso(''), 3000)
  }
  async function carregarSalvas() {
    const j = await fetch(`/api/agente/salvar?email=${encodeURIComponent(email)}`).then(r => r.json())
    if (j.ok) setSalvas(j.salvas || [])
  }
  async function abrirSalva(id: string) {
    const j = await fetch(`/api/agente/salvar?id=${id}`).then(r => r.json())
    if (j.ok) { setMsgs(j.mensagens || []); setMostrarSalvas(false) }
  }
  async function apagarSalva(id: string) {
    await fetch(`/api/agente/salvar?id=${id}`, { method: 'DELETE' })
    carregarSalvas()
  }
  function toggleSalvas() { const v = !mostrarSalvas; setMostrarSalvas(v); if (v) carregarSalvas() }

  if (bloqueado === null) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando...</div>
  if (bloqueado) return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Agente Interno</h1>
      <p style={{ fontSize: 14, color: 'var(--text-faint)', marginTop: 8 }}>Esta área é restrita. Fale com o Guto se precisar de acesso.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 820, margin: '0 auto', padding: '20px 20px 0' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🧠 Agente Interno</h1>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {aviso && <span style={{ fontSize: 12, color: 'var(--green)' }}>{aviso}</span>}
            <button onClick={() => { setMsgs([]); setMostrarSalvas(false) }} style={btnTop}>➕ Nova</button>
            <button onClick={salvar} style={btnTop}>💾 Salvar</button>
            <button onClick={toggleSalvas} style={btnTop}>📁 Salvas</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0' }}>Pergunte qualquer coisa sobre a empresa — vendas, marketing, financeiro, turmas, NPS. Consulta os dados reais. (só leitura)</p>
      </div>

      {mostrarSalvas && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 12, maxHeight: 240, overflowY: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Conversas salvas</div>
          {salvas.length === 0 ? <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma ainda. Salve as conversas estratégicas pra continuar depois.</span> : salvas.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => abrirSalva(s.id)} style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13 }}>
                {s.titulo} <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>· {s.n} msgs</span>
              </button>
              <button onClick={() => apagarSalva(s.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 12 }}>apagar</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
        {msgs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 2 }}>Experimente:</div>
            {sugestoes.map((s, i) => (
              <button key={i} onClick={() => enviar(s)} style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, padding: '10px 14px', borderRadius: 12, background: m.role === 'user' ? 'var(--accent)' : 'var(--surface)', color: m.role === 'user' ? 'var(--on-accent)' : 'var(--text)', border: m.role === 'user' ? 'none' : '1px solid var(--border)' }}>
              {(m.anexos || []).map((a, j) => a.tipo === 'image'
                ? <img key={j} src={`data:${a.media_type};base64,${a.data}`} style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: 6 }} />
                : <div key={j} style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>📎 {a.nome}</div>)}
              {m.content}
            </div>
          </div>
        ))}
        {pensando && <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '4px 6px' }}>consultando os dados…</div>}
        <div ref={fimRef} />
      </div>

      {pendentes.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
          {pendentes.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', fontSize: 12, color: 'var(--text-2)' }}>
              {a.tipo === 'image' ? '🖼️' : '📎'} {a.nome.slice(0, 24)}
              <button onClick={() => setPendentes(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '10px 0 16px', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
        <input ref={arqRef} type="file" accept="image/*,application/pdf" multiple onChange={onArquivo} style={{ display: 'none' }} />
        <input ref={audRef} type="file" accept="audio/*" onChange={onAudio} style={{ display: 'none' }} />
        <button onClick={() => arqRef.current?.click()} disabled={anexando} title="Anexar imagem ou PDF (ex: extrato)" style={{ ...btnTop, padding: '9px 11px', fontSize: 16 }}>📎</button>
        <button onClick={() => audRef.current?.click()} disabled={anexando} title="Enviar áudio (transcreve)" style={{ ...btnTop, padding: '9px 11px', fontSize: 16 }}>🎤</button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }}
          placeholder={anexando ? 'processando anexo…' : 'Pergunte ou anexe um extrato...'} disabled={pensando}
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '11px 14px', fontSize: 14, color: 'var(--text)', outline: 'none' }} />
        <button onClick={() => enviar()} disabled={pensando || (!input.trim() && !pendentes.length)}
          style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '0 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: pensando || (!input.trim() && !pendentes.length) ? 0.6 : 1 }}>Enviar</button>
      </div>
    </div>
  )
}
