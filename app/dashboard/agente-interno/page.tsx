'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '@/lib/supabase'

const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com']
type Anexo = { tipo: 'image' | 'document'; media_type: string; data: string; nome: string }
type Msg = { role: 'user' | 'assistant'; content: string; anexos?: Anexo[]; pendencias?: any[] }
const btnTop: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }
const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Renderiza a resposta do agente em markdown (tabelas, negrito, listas)
function Md({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      p: (p: any) => <p style={{ margin: '6px 0' }}>{p.children}</p>,
      table: (p: any) => <div style={{ overflowX: 'auto', margin: '8px 0' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{p.children}</table></div>,
      th: (p: any) => <th style={{ border: '1px solid var(--border)', padding: '6px 10px', textAlign: 'left', background: 'var(--surface-2)', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.children}</th>,
      td: (p: any) => <td style={{ border: '1px solid var(--border)', padding: '6px 10px' }}>{p.children}</td>,
      ul: (p: any) => <ul style={{ margin: '6px 0', paddingLeft: 20 }}>{p.children}</ul>,
      ol: (p: any) => <ol style={{ margin: '6px 0', paddingLeft: 20 }}>{p.children}</ol>,
      li: (p: any) => <li style={{ margin: '2px 0' }}>{p.children}</li>,
      h1: (p: any) => <div style={{ fontSize: 17, fontWeight: 700, margin: '10px 0 4px' }}>{p.children}</div>,
      h2: (p: any) => <div style={{ fontSize: 16, fontWeight: 700, margin: '10px 0 4px' }}>{p.children}</div>,
      h3: (p: any) => <div style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px' }}>{p.children}</div>,
      code: (p: any) => <code style={{ background: 'var(--surface-2)', borderRadius: 4, padding: '1px 5px', fontSize: 12.5 }}>{p.children}</code>,
      a: (p: any) => <a href={p.href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-soft)' }}>{p.children}</a>,
      hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />,
    }}>{children}</ReactMarkdown>
  )
}
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
  const [feitas, setFeitas] = useState<Record<string, string>>({})
  const [modo, setModo] = useState<'agente' | 'simular'>('agente')
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
      setMsgs(m => [...m, { role: 'assistant', content: j.ok ? j.resposta : `⚠️ ${j.error || 'erro'}`, pendencias: j.pendencias?.length ? j.pendencias.map((p: any, i: number) => ({ ...p, _uid: `${m.length}-${i}-${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}` })) : undefined }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: '⚠️ falha de conexão' }])
    } finally { setPensando(false) }
  }

  async function confirmar(pend: any) {
    setFeitas(f => ({ ...f, [pend._uid]: '...' }))
    const j = await fetch('/api/agente/executar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, pendencia: pend }) }).then(r => r.json())
    if (j.ok) {
      const r = j.resultado || {}
      const txt = pend.tipo === 'despesas' ? `${r.criados} despesa(s) lançada(s) · ${brl(r.total)}` : pend.tipo === 'regra_ia' ? (r.regra_removida ? 'regra removida da IA' : 'regra aplicada na IA de vendas') : pend.tipo === 'fluxo' ? (r.fluxo_atualizado || 'fluxo atualizado') : (r.criado ? 'lead criado' : `lead atualizado (${r.atualizado})`)
      setFeitas(f => ({ ...f, [pend._uid]: '✅ ' + txt }))
    } else setFeitas(f => ({ ...f, [pend._uid]: '⚠️ ' + (j.error || 'falhou') }))
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
            <button onClick={() => setModo(m => m === 'agente' ? 'simular' : 'agente')} style={{ ...btnTop, borderColor: 'var(--accent)', color: 'var(--accent-soft)', fontWeight: 600 }}>{modo === 'agente' ? '🎭 Simular atendimento' : '🧠 Voltar ao agente'}</button>
            {modo === 'agente' && <>
              <button onClick={() => { setMsgs([]); setMostrarSalvas(false) }} style={btnTop}>➕ Nova</button>
              <button onClick={salvar} style={btnTop}>💾 Salvar</button>
              <button onClick={toggleSalvas} style={btnTop}>📁 Salvas</button>
            </>}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0' }}>{modo === 'agente' ? 'Pergunte qualquer coisa sobre a empresa — consulta os dados reais. (só leitura)' : '🎭 Você faz de LEAD, a IA de vendas conduz o atendimento. Teste o fluxo até o fechamento.'}</p>
      </div>

      {modo === 'simular' && <SimAtendimento />}
      {modo === 'agente' && (<>

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
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: m.role === 'user' ? '85%' : '96%', fontSize: 14, lineHeight: 1.5, padding: '10px 14px', borderRadius: 12, background: m.role === 'user' ? 'var(--accent)' : 'var(--surface)', color: m.role === 'user' ? 'var(--on-accent)' : 'var(--text)', border: m.role === 'user' ? 'none' : '1px solid var(--border)', whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal' }}>
              {(m.anexos || []).map((a, j) => a.tipo === 'image'
                ? <img key={j} src={`data:${a.media_type};base64,${a.data}`} style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: 6 }} />
                : <div key={j} style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>📎 {a.nome}</div>)}
              {m.role === 'assistant' ? <Md>{m.content}</Md> : m.content}
            </div>
            {(m.pendencias || []).map((p: any) => (
              <div key={p._uid} style={{ width: '96%', marginTop: 8, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  {p.tipo === 'despesas' ? `💸 Cadastrar ${p.itens.length} despesa(s) — ${brl(p.itens.reduce((s: number, d: any) => s + d.valor, 0))}` : p.tipo === 'regra_ia' ? (p.acao === 'remover' ? '🧩 Remover ajuste da IA de vendas' : '🧩 Novo ajuste no treinamento da IA') : p.tipo === 'fluxo' ? '🔄 Ajuste no fluxo comercial' : (p.acao === 'criar' ? '👤 Criar lead' : '✏️ Atualizar lead')}
                </div>
                {p.tipo === 'despesas' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                    {p.itens.map((d: any, k: number) => <div key={k} style={{ fontSize: 13, color: 'var(--text-2)' }}>• {d.descricao} — <b>{brl(d.valor)}</b> <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>({d.categoria} · {d.status} · {d.data} · {d.conta})</span></div>)}
                  </div>
                ) : p.tipo === 'regra_ia' ? (
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10, fontStyle: 'italic' }}>{p.acao === 'remover' ? `Remover a regra ${(p.id || '').slice(0, 8)}` : `"${p.texto}"`}</div>
                ) : p.tipo === 'fluxo' ? (
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
                    <b>{p.acao === 'add_tarefa' ? 'Adicionar tarefa' : p.acao === 'editar_tarefa' ? 'Editar tarefa' : p.acao === 'remover_tarefa' ? 'Remover tarefa' : 'Editar regras gerais'}</b>
                    {p.etapa ? <> · etapa <b>{p.etapa}</b></> : null}{p.tarefa ? <> · tarefa <b>{p.tarefa}</b></> : null}
                    {p.campos ? <div style={{ marginTop: 4, color: 'var(--text-faint)' }}>{Object.entries(p.campos).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div> : null}
                    {p.texto ? <div style={{ marginTop: 4, fontStyle: 'italic' }}>"{p.texto}"</div> : null}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>{p.busca ? <>Lead: <b>{p.busca}</b><br /></> : null}{Object.entries(p.dados || {}).map(([k, v]) => <span key={k} style={{ marginRight: 10 }}>{k}: <b>{String(v)}</b></span>)}</div>
                )}
                {feitas[p._uid] ? (
                  <div style={{ fontSize: 13, fontWeight: 600, color: feitas[p._uid].startsWith('⚠️') ? 'var(--red)' : 'var(--green)' }}>{feitas[p._uid]}</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => confirmar(p)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✅ Confirmar</button>
                    <button onClick={() => setFeitas(f => ({ ...f, [p._uid]: '✖ descartado' }))} style={{ background: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>Descartar</button>
                  </div>
                )}
              </div>
            ))}
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
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} rows={2}
          placeholder={anexando ? 'processando anexo…' : 'Pergunte ou anexe um extrato...  (Enter envia · Shift+Enter quebra linha)'} disabled={pensando}
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '11px 14px', fontSize: 14, color: 'var(--text)', outline: 'none', resize: 'vertical', minHeight: 48, maxHeight: 200, fontFamily: 'inherit', lineHeight: 1.4 }} />
        <button onClick={() => enviar()} disabled={pensando || (!input.trim() && !pendentes.length)}
          style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '0 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: pensando || (!input.trim() && !pendentes.length) ? 0.6 : 1 }}>Enviar</button>
      </div>
      </>)}
    </div>
  )
}

const sel: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none' }

// Simulação de conversa multi-turno: você faz de LEAD, a IA de vendas conduz.
function SimAtendimento() {
  const [produto, setProduto] = useState('')
  const [cidade, setCidade] = useState('')
  const [msgs, setMsgs] = useState<{ de: 'lead' | 'vendedor'; texto: string; meta?: any }[]>([])
  const [input, setInput] = useState('')
  const [pensando, setPensando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, pensando])

  async function enviar() {
    const t = input.trim(); if (!t || pensando) return
    const dialog = [...msgs, { de: 'lead' as const, texto: t }]
    setMsgs(dialog); setInput(''); setPensando(true)
    try {
      const j = await fetch('/api/atendimento/simular-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dialog: dialog.map(m => ({ de: m.de, texto: m.texto })), produto, cidade }) }).then(r => r.json())
      setMsgs(m => [...m, j.ok ? { de: 'vendedor', texto: j.resposta, meta: j.meta } : { de: 'vendedor', texto: '⚠️ ' + j.error }])
    } catch { setMsgs(m => [...m, { de: 'vendedor', texto: '⚠️ falha de conexão' }]) }
    finally { setPensando(false) }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={produto} onChange={e => setProduto(e.target.value)} style={sel}><option value="">produto (opcional)</option><option value="FC">Formação Completa</option><option value="ANL">Anúncios Locais</option></select>
        <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="cidade (opcional)" style={{ ...sel, width: 150 }} />
        <button onClick={() => setMsgs([])} style={btnTop}>♻️ Reiniciar</button>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Digite como se fosse o cliente.</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 12 }}>
        {msgs.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 8 }}>Comece mandando a 1ª mensagem como o lead (ex.: "Oi, vi o anúncio de vocês, como funciona?").</div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.de === 'lead' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, padding: '10px 14px', borderRadius: 12, background: m.de === 'lead' ? 'var(--accent)' : 'var(--surface)', color: m.de === 'lead' ? 'var(--on-accent)' : 'var(--text)', border: m.de === 'lead' ? 'none' : '1px solid var(--border)' }}>
              {m.de === 'vendedor' && <div style={{ fontSize: 10, color: 'var(--accent-soft)', fontWeight: 700, marginBottom: 3 }}>VENDEDOR IA</div>}
              {m.texto}
            </div>
            {m.meta && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>🎯 {m.meta.etapa} · ação: {m.meta.acao}{m.meta.etiqueta?.turma_alvo && m.meta.etiqueta.turma_alvo !== 'indefinido' ? ' · ' + m.meta.etiqueta.turma_alvo : ''}</div>}
          </div>
        ))}
        {pensando && <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>o vendedor está pensando…</div>}
        <div ref={fim} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 0 16px', borderTop: '1px solid var(--border)' }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} rows={2}
          placeholder="Responda como o cliente..." disabled={pensando}
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '11px 14px', fontSize: 14, color: 'var(--text)', outline: 'none', resize: 'vertical', minHeight: 48, maxHeight: 160, fontFamily: 'inherit', lineHeight: 1.4 }} />
        <button onClick={enviar} disabled={pensando || !input.trim()} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '0 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: pensando || !input.trim() ? 0.6 : 1 }}>Enviar</button>
      </div>
    </>
  )
}
