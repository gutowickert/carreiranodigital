'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = {
  leadId: string; nome: string; etapa: string; conversaId: string; telefone: string; chatLid: string | null
  snippet: string; dSC: number; produto: string; cidade: string | null; prioridade: 'quente' | 'followup'
}
type Sug = { resposta: string; situacao?: string; objecao?: string; etapa_funil?: string; baseado_em?: string; acao_sugerida?: string }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const area: React.CSSProperties = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: 12, fontSize: 14, color: 'var(--text)', outline: 'none', resize: 'vertical', minHeight: 90, lineHeight: 1.5, fontFamily: 'inherit' }
const btn = (bg: string): React.CSSProperties => ({ background: bg, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' })

function Tag({ p }: { p: 'quente' | 'followup' }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p === 'quente' ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.15)', color: p === 'quente' ? '#ef4444' : '#16a34a' }}>{p === 'quente' ? '🔥 respondeu' : '🌱 follow-up'}</span>
}

type Msg = { de: string; texto: string; em: string }
async function fetchConversa(conversaId: string): Promise<Msg[]> {
  const j = await fetch(`/api/atender/conversa?conversaId=${conversaId}`).then(r => r.json()).catch(() => null)
  return j?.ok ? j.msgs : []
}
function Thread({ msgs, carregando }: { msgs: Msg[]; carregando?: boolean }) {
  if (carregando) return <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>carregando conversa…</div>
  if (!msgs.length) return <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>sem histórico de conversa.</div>
  return (
    <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: 'var(--surface-2)', borderRadius: 10 }}>
      {msgs.map((m, i) => (
        <div key={i} style={{ alignSelf: m.de === 'cliente' ? 'flex-start' : 'flex-end', maxWidth: '80%', background: m.de === 'cliente' ? 'var(--surface)' : 'var(--accent-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 11px', fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 1 }}>{m.de === 'cliente' ? '👤 cliente' : '💚 nós'}</div>
          {m.texto}
        </div>
      ))}
    </div>
  )
}

export default function AtenderPage() {
  const [email, setEmail] = useState('')
  const [fila, setFila] = useState<Item[]>([])
  const [nq, setNq] = useState(0); const [nf, setNf] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'agora' | 'copiloto' | 'lote'>('agora')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setEmail((session?.user?.email || '').toLowerCase())
      await carregar()
    })()
  }, [])

  async function carregar() {
    setCarregando(true)
    const j = await fetch('/api/atender/fila').then(r => r.json()).catch(() => null)
    if (j?.ok) { setFila(j.fila); setNq(j.quentes); setNf(j.followups) }
    setCarregando(false)
  }

  async function sugerir(item: Item): Promise<Sug | null> {
    const j = await fetch('/api/atendimento/sugerir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversaId: item.conversaId, leadId: item.leadId }) }).then(r => r.json()).catch(() => null)
    return j?.ok ? j.sugestao : null
  }
  async function enviar(item: Item, texto: string) {
    return fetch('/api/atender/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: item.leadId, conversaId: item.conversaId, telefone: item.telefone, chatLid: item.chatLid, texto, email }) }).then(r => r.json()).catch(() => ({ ok: false }))
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🎯 Atender Agora</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>{carregando ? 'Carregando fila…' : `${nq} responderam · ${nf} follow-ups na fila`}</p>
        </div>
        <button onClick={carregar} style={{ ...btn('var(--surface-2)'), color: 'var(--text-2)' }}>↻ Atualizar</button>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '18px 0 20px', borderBottom: '1px solid var(--border)' }}>
        {([['agora', '⚡ Atender Agora'], ['copiloto', '💬 Copiloto'], ['lote', '📋 Lote']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setAba(k)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${aba === k ? 'var(--accent)' : 'transparent'}`, color: aba === k ? 'var(--text)' : 'var(--text-faint)', fontSize: 14, fontWeight: 700, padding: '8px 12px', cursor: 'pointer', marginBottom: -1 }}>{t}</button>
        ))}
      </div>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 40 }}>Montando a fila…</div>
        : fila.length === 0 ? <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>🎉 Fila zerada! Ninguém esperando resposta e sem follow-up pendente.</div>
          : aba === 'agora' ? <Agora fila={fila} sugerir={sugerir} enviar={enviar} />
            : aba === 'copiloto' ? <Copiloto fila={fila} sugerir={sugerir} enviar={enviar} />
              : <Lote fila={fila} sugerir={sugerir} enviar={enviar} />}
    </div>
  )
}

// ————— ABA ATENDER AGORA: um card por vez, ler → aprovar → próximo —————
function Agora({ fila, sugerir, enviar }: { fila: Item[]; sugerir: (i: Item) => Promise<Sug | null>; enviar: (i: Item, t: string) => Promise<any> }) {
  const [idx, setIdx] = useState(0)
  const [sug, setSug] = useState<Sug | null>(null)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [feitos, setFeitos] = useState(0)
  const [erro, setErro] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [carregandoConv, setCarregandoConv] = useState(false)
  const item = fila[idx]

  useEffect(() => {
    if (!item) return
    setSug(null); setTexto(''); setErro(''); setPensando(true); setMsgs([]); setCarregandoConv(true)
    fetchConversa(item.conversaId).then(m => { setMsgs(m); setCarregandoConv(false) })
    sugerir(item).then(s => { setSug(s); setTexto(s?.resposta || ''); setPensando(false) })
  }, [idx, item?.leadId])

  function proximo() { if (idx < fila.length - 1) setIdx(idx + 1); else setIdx(fila.length) }
  async function aprovar() {
    if (!item || !texto.trim()) return
    setEnviando(true); setErro('')
    const r = await enviar(item, texto.trim())
    setEnviando(false)
    if (r.ok) { setFeitos(f => f + 1); proximo() } else setErro(r.error || 'falha ao enviar')
  }

  if (!item) return <div style={{ ...card, padding: 40, textAlign: 'center' }}><div style={{ fontSize: 40 }}>✅</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>Fila concluída!</div><div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>{feitos} atendimento(s) enviado(s) nesta sessão.</div></div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}><span>Lead {idx + 1} de {fila.length}</span><span>✅ {feitos} enviados</span></div>
      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Tag p={item.prioridade} />
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{item.nome}</span>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{item.etapa} · {item.produto || '—'} · {item.cidade || 'cidade ?'} · {item.dSC}d</span>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', marginBottom: 6 }}>🧵 CONVERSA</div>
        <Thread msgs={msgs} carregando={carregandoConv} />

        {sug && (sug.situacao || (sug.objecao && sug.objecao !== 'nenhuma')) && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)', padding: '8px 11px', background: 'rgba(124,58,190,.08)', borderRadius: 8 }}>🤖 <b>Leitura:</b> {sug.situacao}{sug.objecao && sug.objecao !== 'nenhuma' ? ` · objeção: ${sug.objecao}` : ''}{sug.etapa_funil ? ` · ${sug.etapa_funil}` : ''}{sug.acao_sugerida ? ` · ação: ${sug.acao_sugerida}` : ''}</div>}

        <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: 'var(--text-faint)' }}>💬 SUGESTÃO DA IA — revise e aprove {pensando && '· pensando…'}</div>
        {pensando ? <div style={{ ...area, color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>montando a melhor resposta…</div>
          : <textarea value={texto} onChange={e => setTexto(e.target.value)} style={{ ...area, marginTop: 6 }} />}
        {sug?.baseado_em && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>base: {sug.baseado_em}</div>}
        {erro && <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 8 }}>⚠️ {erro}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={aprovar} disabled={enviando || pensando || !texto.trim()} style={{ ...btn('var(--green)'), opacity: (enviando || pensando) ? .6 : 1 }}>{enviando ? 'Enviando…' : '✅ Enviar & Próximo'}</button>
          <button onClick={proximo} style={{ ...btn('var(--surface-2)'), color: 'var(--text-2)' }}>⏭️ Pular</button>
          <a href={`/dashboard/whatsapp`} style={{ ...btn('var(--surface-2)'), color: 'var(--text-2)', textDecoration: 'none' }}>Abrir no WhatsApp</a>
        </div>
      </div>
    </div>
  )
}

// ————— ABA COPILOTO: lista à esquerda, conversa+sugestão à direita —————
function Copiloto({ fila, sugerir, enviar }: { fila: Item[]; sugerir: (i: Item) => Promise<Sug | null>; enviar: (i: Item, t: string) => Promise<any> }) {
  const [sel, setSel] = useState<Item | null>(fila[0] || null)
  const [sug, setSug] = useState<Sug | null>(null)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<Record<string, boolean>>({})
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [carregandoConv, setCarregandoConv] = useState(false)

  useEffect(() => {
    if (!sel) return
    setSug(null); setTexto(''); setPensando(true); setMsgs([]); setCarregandoConv(true)
    fetchConversa(sel.conversaId).then(m => { setMsgs(m); setCarregandoConv(false) })
    sugerir(sel).then(s => { setSug(s); setTexto(s?.resposta || ''); setPensando(false) })
  }, [sel?.leadId])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      <div style={{ ...card, padding: 6, maxHeight: 560, overflowY: 'auto' }}>
        {fila.map(it => (
          <button key={it.leadId} onClick={() => setSel(it)} style={{ display: 'block', width: '100%', textAlign: 'left', background: sel?.leadId === it.leadId ? 'var(--accent-bg)' : 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', marginBottom: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{feito[it.leadId] ? '✅ ' : ''}{it.nome}</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{it.prioridade === 'quente' ? '🔥' : '🌱'} {it.etapa} · {it.dSC}d</div>
          </button>
        ))}
      </div>
      <div style={{ ...card, padding: 20 }}>
        {!sel ? <div style={{ color: 'var(--text-faint)' }}>Escolhe um lead na lista.</div> : <>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{sel.nome} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-faint)' }}>· {sel.etapa} · {sel.produto || '—'} · {sel.dSC}d</span></div>
          <div style={{ marginTop: 10 }}><Thread msgs={msgs} carregando={carregandoConv} /></div>
          {sug && (sug.situacao || (sug.objecao && sug.objecao !== 'nenhuma')) && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 10, padding: '8px 11px', background: 'rgba(124,58,190,.08)', borderRadius: 8 }}>🤖 <b>Leitura:</b> {sug.situacao} {sug.objecao && sug.objecao !== 'nenhuma' ? `· objeção: ${sug.objecao}` : ''} {sug.etapa_funil ? `· ${sug.etapa_funil}` : ''}</div>}
          {pensando ? <div style={{ ...area, marginTop: 10, color: 'var(--text-faint)' }}>pensando…</div>
            : <textarea value={texto} onChange={e => setTexto(e.target.value)} style={{ ...area, marginTop: 10 }} />}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button disabled={enviando || pensando || !texto.trim()} onClick={async () => { setEnviando(true); const r = await enviar(sel, texto.trim()); setEnviando(false); if (r.ok) setFeito(f => ({ ...f, [sel.leadId]: true })) }} style={{ ...btn('var(--green)'), opacity: (enviando || pensando) ? .6 : 1 }}>{enviando ? 'Enviando…' : feito[sel.leadId] ? '✅ Enviado' : '✅ Enviar'}</button>
          </div>
        </>}
      </div>
    </div>
  )
}

// ————— ABA LOTE: gera sugestões pra vários, revisa e dispara em massa —————
function Lote({ fila, sugerir, enviar }: { fila: Item[]; sugerir: (i: Item) => Promise<Sug | null>; enviar: (i: Item, t: string) => Promise<any> }) {
  const [linhas, setLinhas] = useState<{ item: Item; texto: string; ok: boolean; enviado?: boolean }[]>([])
  const [gerando, setGerando] = useState(false)
  const [disparando, setDisparando] = useState(false)
  const N = 10

  async function gerar() {
    setGerando(true)
    const alvo = fila.slice(0, N)
    const res = await Promise.all(alvo.map(async it => { const s = await sugerir(it); return { item: it, texto: s?.resposta || '', ok: !!s?.resposta } }))
    setLinhas(res)
    setGerando(false)
  }
  async function disparar() {
    setDisparando(true)
    const novas = [...linhas]
    for (let i = 0; i < novas.length; i++) {
      if (!novas[i].ok || novas[i].enviado || !novas[i].texto.trim()) continue
      const r = await enviar(novas[i].item, novas[i].texto.trim())
      novas[i].enviado = !!r.ok; setLinhas([...novas])
    }
    setDisparando(false)
  }
  const aprovados = linhas.filter(l => l.ok && !l.enviado).length

  return (
    <div>
      {!linhas.length ? (
        <div style={{ ...card, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 12 }}>Gera as sugestões dos primeiros {Math.min(N, fila.length)} da fila pra revisar e disparar de uma vez.</div>
          <button onClick={gerar} disabled={gerando} style={btn('var(--accent)')}>{gerando ? 'Gerando…' : `✨ Gerar ${Math.min(N, fila.length)} sugestões`}</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{aprovados} pra disparar</span>
            <button onClick={disparar} disabled={disparando || aprovados === 0} style={{ ...btn('var(--green)'), opacity: (disparando || aprovados === 0) ? .6 : 1 }}>{disparando ? 'Disparando…' : `🚀 Disparar ${aprovados}`}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {linhas.map((l, k) => (
              <div key={l.item.leadId} style={{ ...card, padding: 12, opacity: l.enviado ? .55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {l.enviado ? <span>✅</span> : <input type="checkbox" checked={l.ok} onChange={e => { const n = [...linhas]; n[k].ok = e.target.checked; setLinhas(n) }} />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.item.nome}</span>
                  <Tag p={l.item.prioridade} />
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{l.item.etapa} · {l.item.dSC}d</span>
                </div>
                <textarea value={l.texto} disabled={l.enviado} onChange={e => { const n = [...linhas]; n[k].texto = e.target.value; setLinhas(n) }} style={{ ...area, minHeight: 60 }} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
