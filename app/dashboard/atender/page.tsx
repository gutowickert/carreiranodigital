'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'

type Item = {
  leadId: string; nome: string; etapa: string; conversaId: string; telefone: string; chatLid: string | null
  snippet: string; ultimaCliente: string; dSC: number | null; produto: string; cidade: string | null; prioridade: 'quente' | 'followup'
  chegouDias?: number | null; temLigacao?: number; qtdAndamentos?: number; ultimoAndamento?: string
  tarefa?: { tipo: string; titulo: string; venc: string }
}
type Sug = { resposta: string; situacao?: string; objecao?: string; etapa_funil?: string; etapa_sugerida?: string; baseado_em?: string; acao_sugerida?: string; proximo_passo?: string }

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
        ? <div style={{ fontSize: 12.5, color: 'var(--text-2)', padding: '9px 12px', background: 'rgba(124,58,190,.08)', borderRadius: 8 }}>🤖 <b>Leitura da IA:</b> {sug.situacao}{sug.objecao && sug.objecao !== 'nenhuma' ? ` · objeção: ${sug.objecao}` : ''}{(() => {
          const es = sug.etapa_sugerida
          if (!es || es === 'manter' || es === item.etapa) return ''
          const lbl = ETAPAS_MOVER.find(([id]) => id === es)?.[1] || (es === 'ganho' ? 'Ganho' : es === 'perda' ? 'Perda' : '')
          return lbl ? ` · sugere mover pra: ${lbl}` : ''
        })()}</div>
        : <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '7px 10px' }}>montando o resumo…</div>}
    </div>
  )
}

type Msg = { de: string; texto: string; em: string }
async function fetchConversa(conversaId: string): Promise<Msg[]> {
  const j = await fetchAuth(`/api/atender/conversa?conversaId=${conversaId}`).then(r => r.json()).catch(() => null)
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

const ETAPAS_MOVER: [string, string][] = [
  ['aguardando_atendimento', 'Aguardando atendimento'], ['atendimento_inicial', 'Atendimento inicial'],
  ['lote_preco_ok', 'Lote e preço ok'], ['oferecer_bolsa', 'Oferecer bolsa'],
  ['aguardando_pagamento', 'Aguardando pagamento'], ['agendado', 'Agendado'], ['proxima_turma', 'Próxima turma'],
]

// move um lead de etapa (o backend já cria a próxima tarefa da etapa nova)
async function moverLead(leadId: string, etapa: string) {
  return fetchAuth('/api/atender/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, acao: 'mover', etapa }) }).then(r => r.json()).catch(() => ({ ok: false }))
}
// [chave, label] da etapa que a IA sugere mover — ou null se não muda / não é etapa movível
function moverSugerido(sug: Sug | null, etapaAtual: string): [string, string] | null {
  const es = sug?.etapa_sugerida
  if (!es || es === 'manter' || es === etapaAtual) return null
  const par = ETAPAS_MOVER.find(([id]) => id === es)
  return par ? [par[0], par[1]] : null
}

// Botões de decisão no card: ✓ feito (conclui a tarefa e avança a cadência), mover etapa, marcar perda.
function Acoes({ item, onFeito }: { item: Item; onFeito?: (id: string) => void }) {
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')
  async function acao(a: string, extra: any = {}) {
    setBusy(a)
    const r = await fetchAuth('/api/atender/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: item.leadId, acao: a, ...extra }) }).then(r => r.json()).catch(() => ({ ok: false }))
    setBusy('')
    if (r.ok) { setDone(a); onFeito?.(item.leadId) }
  }
  if (done) return <div style={{ fontSize: 12, color: 'var(--green-strong)', marginTop: 10, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 10 }}>✓ {done === 'concluir' ? 'tarefa concluída — próxima criada' : done === 'perda' ? 'marcado como perda' : 'etapa movida'}</div>
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <button disabled={!!busy} onClick={() => acao('concluir')} style={{ background: 'var(--green-bg)', color: 'var(--green-strong)', border: '1px solid var(--green)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{busy === 'concluir' ? '...' : '✓ Feito (avança cadência)'}</button>
      <select disabled={!!busy} defaultValue="" onChange={e => { if (e.target.value) acao('mover', { etapa: e.target.value }) }} style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
        <option value="">↷ mover etapa…</option>
        {ETAPAS_MOVER.filter(([id]) => id !== item.etapa).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <button disabled={!!busy} onClick={() => { const m = prompt('Motivo da perda (opcional):'); if (m !== null) acao('perda', { motivo: m }) }} style={{ marginLeft: 'auto', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{busy === 'perda' ? '...' : '✕ Perda'}</button>
    </div>
  )
}

export default function AtenderPage() {
  const [email, setEmail] = useState('')
  const [fila, setFila] = useState<Item[]>([])
  const [lote, setLote] = useState<Item[]>([])
  const [parados, setParados] = useState<Item[]>([])
  const [nq, setNq] = useState(0); const [nf, setNf] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'agora' | 'copiloto' | 'lote' | 'parados'>('agora')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setEmail((session?.user?.email || '').toLowerCase())
      await carregar()
    })()
  }, [])

  async function carregar() {
    setCarregando(true)
    const { data: { session } } = await supabase.auth.getSession()
    const j = await fetch('/api/atender/fila', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } }).then(r => r.json()).catch(() => null)
    if (j?.ok) { setFila(j.fila); setLote(j.lote || []); setParados(j.parados || []); setNq(j.quentes); setNf(j.followups) }
    setCarregando(false)
  }

  async function sugerir(item: Item): Promise<Sug | null> {
    const j = await fetchAuth('/api/atendimento/sugerir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversaId: item.conversaId, leadId: item.leadId }) }).then(r => r.json()).catch(() => null)
    return j?.ok ? j.sugestao : null
  }
  async function enviar(item: Item, texto: string, original?: string, avancar: boolean = true) {
    return fetchAuth('/api/atender/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: item.leadId, conversaId: item.conversaId, telefone: item.telefone, chatLid: item.chatLid, texto, original: original || '', email, avancar }) }).then(r => r.json()).catch(() => ({ ok: false }))
  }
  function feito(leadId: string) { setFila(f => f.filter(x => x.leadId !== leadId)); setLote(l => l.filter(x => x.leadId !== leadId)) }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🎯 Atender Agora</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>{carregando ? 'Carregando fila…' : `${nq} responderam · ${nf} follow-ups · 📋 ${lote.length} com tarefa · 🚩 ${parados.length} sem tarefa`}</p>
        </div>
        <button onClick={carregar} style={{ ...btn('var(--surface-2)'), color: 'var(--text-2)' }}>↻ Atualizar</button>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '18px 0 20px', borderBottom: '1px solid var(--border)' }}>
        {([['agora', '⚡ Atender Agora'], ['copiloto', '💬 Copiloto'], ['lote', '📋 Follow-up com tarefa'], ['parados', '🚩 Sem tarefa']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setAba(k)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${aba === k ? 'var(--accent)' : 'transparent'}`, color: aba === k ? 'var(--text)' : 'var(--text-faint)', fontSize: 14, fontWeight: 700, padding: '8px 12px', cursor: 'pointer', marginBottom: -1 }}>{t}</button>
        ))}
      </div>

      {(() => {
        if (carregando) return <div style={{ color: 'var(--text-faint)', padding: 40 }}>Montando a fila…</div>
        const dados = aba === 'lote' ? lote : aba === 'parados' ? parados : fila
        if (dados.length === 0) return <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>{aba === 'lote' ? '🎉 Sem follow-up pra hoje! Nenhuma tarefa vencendo.' : aba === 'parados' ? '🎉 Nenhum lead parado! Todos têm tarefa ou já foram movidos.' : '🎉 Fila zerada! Ninguém esperando resposta.'}</div>
        return aba === 'agora' ? <Agora fila={dados} sugerir={sugerir} enviar={enviar} onFeito={feito} />
          : aba === 'copiloto' ? <Copiloto fila={dados} sugerir={sugerir} enviar={enviar} onFeito={feito} />
            : <Lote fila={dados} sugerir={sugerir} enviar={enviar} />
      })()}
    </div>
  )
}

// ————— ABA ATENDER AGORA: um card por vez, ler → aprovar → próximo —————
function Agora({ fila, sugerir, enviar, onFeito }: { fila: Item[]; sugerir: (i: Item) => Promise<Sug | null>; enviar: (i: Item, t: string, original?: string, avancar?: boolean) => Promise<any>; onFeito: (id: string) => void }) {
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

  // se veio de outra tela (?lead=<id>), pula pra esse lead na fila (se estiver nela)
  useEffect(() => {
    const lp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lead') : null
    if (lp) { const i = fila.findIndex(x => x.leadId === lp); if (i >= 0) setIdx(i) }
  }, [fila])

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
    const r = await enviar(item, texto.trim(), sug?.resposta)
    setEnviando(false)
    if (r.ok) { setFeitos(f => f + 1); proximo() } else setErro(r.error || 'falha ao enviar')
  }
  // 1-clique guiado: envia a mensagem E move pra etapa sugerida (que já cria a próxima tarefa)
  async function aprovarEMover(etapa: string) {
    if (!item || !texto.trim()) return
    setEnviando(true); setErro('')
    const r = await enviar(item, texto.trim(), sug?.resposta, false)
    if (!r.ok) { setEnviando(false); setErro(r.error || 'falha ao enviar'); return }
    await moverLead(item.leadId, etapa)
    setEnviando(false); setFeitos(f => f + 1); onFeito(item.leadId); proximo()
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
          {(() => {
            const mv = moverSugerido(sug, item.etapa)
            if (!mv) return null
            return <button onClick={() => aprovarEMover(mv[0])} disabled={enviando || pensando || !texto.trim()} style={{ ...btn('var(--accent)'), opacity: (enviando || pensando) ? .6 : 1 }}>{enviando ? 'Enviando…' : `✅ Enviar e mover → ${mv[1]}`}</button>
          })()}
          <button onClick={aprovar} disabled={enviando || pensando || !texto.trim()} style={{ ...btn('var(--green)'), opacity: (enviando || pensando) ? .6 : 1 }}>{enviando ? 'Enviando…' : '✅ Enviar & Próximo'}</button>
          <button onClick={proximo} style={{ ...btn('var(--surface-2)'), color: 'var(--text-2)' }}>⏭️ Pular</button>
          <a href={`/dashboard/whatsapp`} style={{ ...btn('var(--surface-2)'), color: 'var(--text-2)', textDecoration: 'none' }}>Abrir no WhatsApp</a>
        </div>
        <Acoes item={item} onFeito={onFeito} />
      </div>
    </div>
  )
}

// ————— ABA COPILOTO: lista à esquerda, conversa+sugestão à direita —————
function Copiloto({ fila, sugerir, enviar, onFeito }: { fila: Item[]; sugerir: (i: Item) => Promise<Sug | null>; enviar: (i: Item, t: string, original?: string, avancar?: boolean) => Promise<any>; onFeito: (id: string) => void }) {
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
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            {(() => {
              const mv = moverSugerido(sug, sel.etapa)
              if (!mv || feito[sel.leadId]) return null
              return <button disabled={enviando || pensando || !texto.trim()} onClick={async () => { setEnviando(true); const r = await enviar(sel, texto.trim(), sug?.resposta, false); if (r.ok) { await moverLead(sel.leadId, mv[0]); setFeito(f => ({ ...f, [sel.leadId]: true })); onFeito(sel.leadId); setSel(null) } setEnviando(false) }} style={{ ...btn('var(--accent)'), opacity: (enviando || pensando) ? .6 : 1 }}>{enviando ? 'Enviando…' : `✅ Enviar e mover → ${mv[1]}`}</button>
            })()}
            <button disabled={enviando || pensando || !texto.trim()} onClick={async () => { setEnviando(true); const r = await enviar(sel, texto.trim(), sug?.resposta); setEnviando(false); if (r.ok) setFeito(f => ({ ...f, [sel.leadId]: true })) }} style={{ ...btn('var(--green)'), opacity: (enviando || pensando) ? .6 : 1 }}>{enviando ? 'Enviando…' : feito[sel.leadId] ? '✅ Enviado' : '✅ Enviar'}</button>
          </div>
          <Acoes item={sel} onFeito={(id) => { onFeito(id); setSel(null) }} />
        </>}
      </div>
    </div>
  )
}

// linha: contexto + sugestão editável + ENVIO INDIVIDUAL + botões de decisão (uma a uma)
function LoteRow({ l, onTexto, onEnviar, onEnviarEMover }: { l: { item: Item; texto: string; ok: boolean; enviado?: boolean; sug?: Sug | null }; onTexto: (t: string) => void; onEnviar: () => Promise<void>; onEnviarEMover: (etapa: string) => Promise<void> }) {
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [carr, setCarr] = useState(false)
  const [env, setEnv] = useState(false)
  const mv = moverSugerido(l.sug || null, l.item.etapa)
  async function toggle() {
    if (!aberto && !msgs.length) { setCarr(true); setMsgs(await fetchConversa(l.item.conversaId)); setCarr(false) }
    setAberto(a => !a)
  }
  return (
    <div style={{ ...card, padding: 12, opacity: l.enviado ? .7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.enviado ? '✅ ' : ''}{l.item.nome}</span>
        {l.item.tarefa
          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'rgba(124,58,190,.15)', color: 'var(--accent)' }}>📋 {l.item.tarefa.titulo.split(' — ')[0]}</span>
          : <Tag p={l.item.prioridade} />}
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{l.item.produto || '—'}{l.item.dSC != null ? ` · silêncio ${l.item.dSC}d` : ''}</span>
        <button onClick={toggle} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent-soft)', fontSize: 12, cursor: 'pointer' }}>{aberto ? '▲ fechar' : '🧵 ver conversa'}</button>
      </div>
      <Resumo item={l.item} sug={l.sug || null} />
      {aberto && <div style={{ margin: '8px 0' }}><Thread msgs={msgs} carregando={carr} /></div>}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', margin: '8px 0 4px' }}>💬 mensagem:</div>
      <textarea value={l.texto} disabled={l.enviado} onChange={e => onTexto(e.target.value)} style={{ ...area, minHeight: 60 }} />
      <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {mv && !l.enviado && <button disabled={env || !l.texto.trim()} onClick={async () => { setEnv(true); await onEnviarEMover(mv[0]); setEnv(false) }} style={{ ...btn('var(--accent)'), padding: '8px 16px', fontSize: 13, opacity: (env || !l.texto.trim()) ? .6 : 1 }}>{env ? 'Enviando…' : `📤 Enviar e mover → ${mv[1]}`}</button>}
        <button disabled={l.enviado || env || !l.texto.trim()} onClick={async () => { setEnv(true); await onEnviar(); setEnv(false) }} style={{ ...btn('var(--green)'), padding: '8px 16px', fontSize: 13, opacity: (l.enviado || env || !l.texto.trim()) ? .6 : 1 }}>{l.enviado ? '✅ Enviada' : env ? 'Enviando…' : '📤 Enviar mensagem'}</button>
      </div>
      <Acoes item={l.item} />
    </div>
  )
}

// ————— ABA FOLLOW-UP COM TAREFA: gera sugestões, envia UMA A UMA e decide o andamento na hora —————
function Lote({ fila, sugerir, enviar }: { fila: Item[]; sugerir: (i: Item) => Promise<Sug | null>; enviar: (i: Item, t: string, original?: string, avancar?: boolean) => Promise<any> }) {
  const [linhas, setLinhas] = useState<{ item: Item; texto: string; ok: boolean; enviado?: boolean; sug?: Sug | null }[]>([])
  const [gerando, setGerando] = useState(false)
  const N = 10

  // Ao SAIR da tela de follow-up, libera minhas reservas não finalizadas (voltam pro pool pra outra pessoa).
  useEffect(() => {
    return () => { fetchAuth('/api/atender/liberar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => { }) }
  }, [])

  async function gerarMais() {
    setGerando(true)
    // RESERVA atômica: trava N follow-ups livres pra mim (outro atendente não pega os mesmos)
    const j = await fetchAuth('/api/atender/reservar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: N }) }).then(r => r.json()).catch(() => ({ ok: false }))
    const ids: string[] = j?.ok ? (j.leadIds || []) : []
    const jaTem = new Set(linhas.map(l => l.item.leadId))
    const byId = new Map(fila.map(it => [it.leadId, it]))
    const alvo = ids.filter(id => !jaTem.has(id)).map(id => byId.get(id)).filter(Boolean) as Item[]
    const res = await Promise.all(alvo.map(async it => { const s = await sugerir(it); return { item: it, texto: s?.resposta || '', ok: !!s?.resposta, sug: s } }))
    setLinhas(l => [...l, ...res])
    setGerando(false)
  }

  const enviados = linhas.filter(l => l.enviado).length
  const restam = fila.length - linhas.length

  return (
    <div>
      {!linhas.length ? (
        <div style={{ ...card, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 12 }}>{fila.length} lead(s) na fila. Gera as sugestões pra revisar, <b>enviar uma a uma</b> e já marcar o andamento (mover etapa / ✓ feito) na hora.</div>
          <button onClick={gerarMais} disabled={gerando} style={btn('var(--accent)')}>{gerando ? 'Gerando…' : `✨ Gerar ${Math.min(N, fila.length)} sugestões`}</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 12 }}>{linhas.length} carregado(s) · {enviados} enviado(s){restam > 0 ? ` · ${restam} restante(s)` : ''}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {linhas.map((l, k) => (
              <LoteRow key={l.item.leadId} l={l}
                onTexto={t => { const n = [...linhas]; n[k].texto = t; setLinhas(n) }}
                onEnviar={async () => { const r = await enviar(l.item, l.texto.trim(), l.sug?.resposta); if (r?.ok) { const n = [...linhas]; n[k].enviado = true; setLinhas(n) } }}
                onEnviarEMover={async (etapa) => { const r = await enviar(l.item, l.texto.trim(), l.sug?.resposta, false); if (r?.ok) { await moverLead(l.item.leadId, etapa); const n = [...linhas]; n[k].enviado = true; setLinhas(n) } }} />
            ))}
          </div>
          {restam > 0 && <button onClick={gerarMais} disabled={gerando} style={{ ...btn('var(--surface-2)'), color: 'var(--text-2)', marginTop: 12 }}>{gerando ? 'Gerando…' : `+ Gerar mais ${Math.min(N, restam)}`}</button>}
        </>
      )}
    </div>
  )
}
