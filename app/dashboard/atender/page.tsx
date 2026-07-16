'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = {
  leadId: string; nome: string; etapa: string; conversaId: string; telefone: string; chatLid: string | null
  snippet: string; ultimaCliente: string; dSC: number | null; produto: string; cidade: string | null; prioridade: 'quente' | 'followup'
  chegouDias?: number | null; temLigacao?: number; qtdAndamentos?: number; ultimoAndamento?: string
  tarefa?: { tipo: string; titulo: string; venc: string }
}
type Sug = { resposta: string; situacao?: string; objecao?: string; etapa_funil?: string; baseado_em?: string; acao_sugerida?: string; proximo_passo?: string }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const area: React.CSSProperties = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: 12, fontSize: 14, color: 'var(--text)', outline: 'none', resize: 'vertical', minHeight: 90, lineHeight: 1.5, fontFamily: 'inherit' }
const btn = (bg: string): React.CSSProperties => ({ background: bg, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' })

function Tag({ p }: { p: 'quente' | 'followup' }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p === 'quente' ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.15)', color: p === 'quente' ? '#ef4444' : '#16a34a' }}>{p === 'quente' ? '🔥 respondeu' : '🌱 follow-up'}</span>
}

// Resumo pra DECIDIR: contexto do lead (funil/chegada/ligação/andamentos) + última fala do cliente + leitura da IA.
function Resumo({ item, sug }: { item: Item; sug: Sug | null }) {
  const info = [
    `📍 ${item.etapa}`,
    item.chegouDias != null ? `chegou há ${item.chegouDias}d` : null,
    item.dSC != null ? `silêncio ${item.dSC}d` : null,
    item.temLigacao ? `📞 ${item.temLigacao} ligação${item.temLigacao > 1 ? 'es' : ''} (IA leu)` : '📞 sem ligação',
    item.qtdAndamentos ? `📝 ${item.qtdAndamentos} andamento${item.qtdAndamentos > 1 ? 's' : ''}` : '📝 sem andamento',
  ].filter(Boolean).join('   ·   ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-2)', padding: '7px 11px', background: 'var(--surface-2)', borderRadius: 8, fontWeight: 600 }}>{info}</div>
      {item.ultimoAndamento
        ? <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '0 4px' }}>último andamento: “{item.ultimoAndamento}”</div> : null}
      {item.ultimaCliente
        ? <div style={{ fontSize: 13.5, color: 'var(--text)', padding: '9px 12px', background: 'rgba(239,68,68,.08)', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>👤 <b>Cliente:</b> “{item.ultimaCliente}”</div>
        : <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '7px 10px', background: 'var(--surface-2)', borderRadius: 8 }}>o cliente ainda não respondeu — este é um follow-up de reativação</div>}
      {sug?.situacao
        ? <div style={{ fontSize: 12.5, color: 'var(--text-2)', padding: '9px 12px', background: 'rgba(124,58,190,.08)', borderRadius: 8 }}>🤖 <b>Leitura da IA:</b> {sug.situacao}{sug.objecao && sug.objecao !== 'nenhuma' ? ` · objeção: ${sug.objecao}` : ''}{sug.proximo_passo ? ` · sugere avançar pra: ${sug.proximo_passo}` : ''}</div>
        : <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '7px 10px' }}>montando o resumo…</div>}
    </div>
  )
}

type Msg = { de: string; texto: string; em: string }
async function fetchConversa(conversaId: string): Promise<Msg[]> {
  const j = await fetch(`/api/atender/conversa?conversaId=${conversaId}`).then(r => r.json()).catch(() => null)
  return j?.ok ? j.msgs : []
}
const quando = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  return dia === hoje ? `hoje ${hora}` : `${dia} ${hora}`
}
function Thread({ msgs, carregando }: { msgs: Msg[]; carregando?: boolean }) {
  const fim = useRef<HTMLDivElement>(null)
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }) }, [msgs])
  if (carregando) return <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>carregando conversa…</div>
  if (!msgs.length) return <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>sem histórico de conversa.</div>
  return (
    <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: 'var(--surface-2)', borderRadius: 10 }}>
      {msgs.map((m, i) => (
        <div key={i} style={{ alignSelf: m.de === 'cliente' ? 'flex-start' : 'flex-end', maxWidth: '80%', background: m.de === 'cliente' ? 'var(--surface)' : 'var(--accent-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 11px', fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 1 }}>{m.de === 'cliente' ? '👤 cliente' : '💚 nós'} · {quando(m.em)}</div>
          {m.texto}
        </div>
      ))}
      <div ref={fim} />
    </div>
  )
}

export default function AtenderPage() {
  const [email, setEmail] = useState('')
  const [fila, setFila] = useState<Item[]>([])
  const [lote, setLote] = useState<Item[]>([])
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
    if (j?.ok) { setFila(j.fila); setLote(j.lote || []); setNq(j.quentes); setNf(j.followups) }
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
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>{carregando ? 'Carregando fila…' : `${nq} responderam · ${nf} follow-ups · 📋 ${lote.length} do dia no Lote`}</p>
        </div>
        <button onClick={carregar} style={{ ...btn('var(--surface-2)'), color: 'var(--text-2)' }}>↻ Atualizar</button>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '18px 0 20px', borderBottom: '1px solid var(--border)' }}>
        {([['agora', '⚡ Atender Agora'], ['copiloto', '💬 Copiloto'], ['lote', '📋 Lote']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setAba(k)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${aba === k ? 'var(--accent)' : 'transparent'}`, color: aba === k ? 'var(--text)' : 'var(--text-faint)', fontSize: 14, fontWeight: 700, padding: '8px 12px', cursor: 'pointer', marginBottom: -1 }}>{t}</button>
        ))}
      </div>

      {(() => {
        if (carregando) return <div style={{ color: 'var(--text-faint)', padding: 40 }}>Montando a fila…</div>
        const dados = aba === 'lote' ? lote : fila
        if (dados.length === 0) return <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>{aba === 'lote' ? '🎉 Sem follow-up pra hoje! Nenhuma tarefa vencendo.' : '🎉 Fila zerada! Ninguém esperando resposta.'}</div>
        return aba === 'agora' ? <Agora fila={dados} sugerir={sugerir} enviar={enviar} />
          : aba === 'copiloto' ? <Copiloto fila={dados} sugerir={sugerir} enviar={enviar} />
            : <Lote fila={dados} sugerir={sugerir} enviar={enviar} />
      })()}
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
        <div style={{ marginTop: 14 }}><Resumo item={item} sug={sug} /></div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', cursor: 'pointer' }}>🧵 ver conversa completa</summary>
          <div style={{ marginTop: 8 }}><Thread msgs={msgs} carregando={carregandoConv} /></div>
        </details>

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
          <div style={{ marginTop: 10 }}><Resumo item={sel} sug={sug} /></div>
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', cursor: 'pointer' }}>🧵 ver conversa completa</summary>
            <div style={{ marginTop: 8 }}><Thread msgs={msgs} carregando={carregandoConv} /></div>
          </details>
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

// linha do lote: contexto (última fala do cliente + thread expansível) + sugestão editável
function LoteRow({ l, onTexto, onCheck }: { l: { item: Item; texto: string; ok: boolean; enviado?: boolean; sug?: Sug | null }; onTexto: (t: string) => void; onCheck: (v: boolean) => void }) {
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [carr, setCarr] = useState(false)
  async function toggle() {
    if (!aberto && !msgs.length) { setCarr(true); setMsgs(await fetchConversa(l.item.conversaId)); setCarr(false) }
    setAberto(a => !a)
  }
  return (
    <div style={{ ...card, padding: 12, opacity: l.enviado ? .55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {l.enviado ? <span>✅</span> : <input type="checkbox" checked={l.ok} onChange={e => onCheck(e.target.checked)} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.item.nome}</span>
        {l.item.tarefa
          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'rgba(124,58,190,.15)', color: 'var(--accent)' }}>📋 {l.item.tarefa.titulo.split(' — ')[0]}</span>
          : <Tag p={l.item.prioridade} />}
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{l.item.produto || '—'}{l.item.dSC != null ? ` · silêncio ${l.item.dSC}d` : ''}</span>
        <button onClick={toggle} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent-soft)', fontSize: 12, cursor: 'pointer' }}>{aberto ? '▲ fechar' : '🧵 ver conversa'}</button>
      </div>
      <Resumo item={l.item} sug={l.sug || null} />
      {aberto && <div style={{ margin: '8px 0' }}><Thread msgs={msgs} carregando={carr} /></div>}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', margin: '8px 0 4px' }}>💬 resposta:</div>
      <textarea value={l.texto} disabled={l.enviado} onChange={e => onTexto(e.target.value)} style={{ ...area, minHeight: 60 }} />
    </div>
  )
}

// ————— ABA LOTE: gera sugestões pra vários, revisa e dispara em massa —————
function Lote({ fila, sugerir, enviar }: { fila: Item[]; sugerir: (i: Item) => Promise<Sug | null>; enviar: (i: Item, t: string) => Promise<any> }) {
  const [linhas, setLinhas] = useState<{ item: Item; texto: string; ok: boolean; enviado?: boolean; sug?: Sug | null }[]>([])
  const [gerando, setGerando] = useState(false)
  const [disparando, setDisparando] = useState(false)
  const N = 10

  async function gerar() {
    setGerando(true)
    const alvo = fila.slice(0, N)
    const res = await Promise.all(alvo.map(async it => { const s = await sugerir(it); return { item: it, texto: s?.resposta || '', ok: !!s?.resposta, sug: s } }))
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
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 12 }}>Follow-ups que vencem hoje. Gera as sugestões dos primeiros {Math.min(N, fila.length)} pra revisar e disparar de uma vez.</div>
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
              <LoteRow key={l.item.leadId} l={l}
                onTexto={t => { const n = [...linhas]; n[k].texto = t; setLinhas(n) }}
                onCheck={v => { const n = [...linhas]; n[k].ok = v; setLinhas(n) }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
