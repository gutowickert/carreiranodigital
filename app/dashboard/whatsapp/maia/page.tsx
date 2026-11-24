'use client'

// A CAIXA "MAIA" (24/11/2026): as conversas do WhatsApp da Maia (51 99376-7137) dentro do CRM da escola, como aba
// do WhatsApp (Escola | Maia | Plantão da IA — a faixa de abas vem do components/Layout.tsx). A caixa da escola
// não foi mexida. Lê e manda por /api/maia-caixa (que explica o combinado com a janela da Maia).
//   - "Vendas da Maia" = conversas da vendedora (fase 'maia', quem veio do quiz ou chamou direto); "Todas" = o número
//     inteiro (lançamento, testes antigos).
//   - Responder já assume a conversa (a IA para); "Devolver pra IA" solta de novo.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'
import { Search, Send, Bot, UserRound, ArrowLeft } from 'lucide-react'

type Lead = { id: string; nome: string; etapa: string; negocio: string | null; maior_problema: string | null; qualificacao: any }
type Conversa = {
  id: string; telefone: string; nome: string | null; modo: string; fase: string; nao_lidas: number; ia_respostas: number
  ultima_msg: string | null; ultima_msg_em: string | null; janela: boolean; optout: boolean; lead_id: string | null; lead?: Lead | null
}
type Msg = { id: string; autor: string; tipo: string; texto: string | null; status: string | null; erro: string | null; criado_em: string }

const ETAPA_NOME: Record<string, string> = {
  maia_novo: 'Novo (fez o quiz)', maia_conversando: 'Conversando', maia_reuniao: 'Reunião com o Rick',
  maia_proposta: 'Proposta / link enviado', ganho: 'Ganho', perda: 'Perdido',
}
const quando = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso), agora = new Date()
  const min = Math.round((agora.getTime() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  if (d.toDateString() === agora.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return 'ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
const iniciais = (n: string | null, tel: string) => (n || tel).split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const TIPO: Record<string, string> = { image: 'foto', imagem: 'foto', audio: 'áudio', video: 'vídeo', document: 'documento', unsupported: 'mensagem que o WhatsApp não mostra aqui', reaction: 'reação', contacts: 'contato', button: 'clicou num botão', modelo: 'modelo', text: 'mensagem' }
const AUTOR: Record<string, string> = { ia: 'Maia (IA)', dono: 'Time', sistema: 'Sistema', cliente: '' }

export default function CaixaMaia() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [carregou, setCarregou] = useState(false)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<'vendas' | 'sem' | 'ia' | 'time' | 'todas'>('vendas')
  const [busca, setBusca] = useState('')
  const [ativaId, setAtivaId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [lead, setLead] = useState<Lead | null>(null)
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)

  async function carregarLista() {
    try {
      const j = await fetchAuth('/api/maia-caixa').then(r => r.json())
      if (j.ok) { setConversas(j.conversas || []); setErro('') } else setErro(j.erro === 'sem acesso' ? 'Esta caixa é de quem atende o WhatsApp (admin ou caixa do WhatsApp ligada no usuário).' : (j.erro || 'Não deu pra carregar.'))
    } catch { setErro('Não deu pra carregar. Confere a internet.') }
    setCarregou(true)
  }
  async function carregarConversa(id: string, marcarLida = false) {
    const j = await fetchAuth('/api/maia-caixa?conversa=' + id).then(r => r.json()).catch(() => null)
    if (!j?.ok) return
    setMsgs(j.mensagens || []); setLead(j.lead || null); setConversa({ ...j.conversa, janela: j.janela })
    if (marcarLida && j.conversa?.nao_lidas) {
      await fetchAuth('/api/maia-caixa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'lida', id }) }).catch(() => null)
      setConversas(cs => cs.map(c => c.id === id ? { ...c, nao_lidas: 0 } : c))
    }
  }
  useEffect(() => {
    carregarLista()
    const t = setInterval(carregarLista, 15000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!ativaId) return
    carregarConversa(ativaId, true)
    const t = setInterval(() => carregarConversa(ativaId), 8000)
    return () => clearInterval(t)
  }, [ativaId])
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length, ativaId])

  async function acao(corpo: any) {
    setAviso('')
    const j = await fetchAuth('/api/maia-caixa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ativaId, ...corpo }) }).then(r => r.json()).catch(() => ({ ok: false, erro: 'Falhou a conexão.' }))
    if (!j.ok) setAviso(j.erro || 'Não deu certo.')
    if (ativaId) await carregarConversa(ativaId)
    carregarLista()
    return j
  }
  async function enviar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    const j = await acao({ acao: 'responder', texto: t })
    if (j.ok) setTexto('')
    setEnviando(false)
  }

  const naFiltro = (c: Conversa) =>
    filtro === 'todas' ? true
      : filtro === 'vendas' ? c.fase === 'maia'
      : filtro === 'sem' ? c.nao_lidas > 0
      : filtro === 'ia' ? c.fase === 'maia' && c.modo === 'ia'
      : c.modo === 'humano'
  const b = busca.trim().toLowerCase(), bd = b.replace(/\D/g, '')
  const lista = conversas.filter(naFiltro).filter(c => !b || (c.nome || '').toLowerCase().includes(b) || (bd.length >= 3 && c.telefone.includes(bd)) || (c.lead?.negocio || '').toLowerCase().includes(b))
  const contar = (f: typeof filtro) => conversas.filter(c => f === 'todas' ? true : f === 'vendas' ? c.fase === 'maia' : f === 'sem' ? c.nao_lidas > 0 : f === 'ia' ? c.fase === 'maia' && c.modo === 'ia' : c.modo === 'humano').length
  const q: any = lead?.qualificacao || {}
  const comTime = conversa?.modo === 'humano'

  return (
    <div className="cm">
      <style>{CM_CSS}</style>
      <div className="cm-topo">
        <div>
          <h1 className="display relevo-titulo">WhatsApp da Maia</h1>
          <p>Conversas do número da Maia (51 99376-7137). Respondeu, a IA para; "Devolver pra IA" solta de novo.</p>
        </div>
        <div className="cm-kpis">
          <div><span>Esperando resposta</span><b>{conversas.filter(c => c.nao_lidas > 0).length}</b></div>
          <div><span>IA atendendo</span><b>{contar('ia')}</b></div>
          <div><span>Com o time</span><b>{contar('time')}</b></div>
        </div>
      </div>

      {erro && <div className="cm-aviso">{erro}</div>}

      <div className={'cm-grade' + (ativaId ? ' aberta' : '')}>
        {/* a lista */}
        <section className="cm-lista vidro" aria-label="Conversas">
          <div className="cm-lista-cab">
            <label className="cm-busca"><Search size={14} /><input placeholder="Buscar nome, telefone ou negócio" value={busca} onChange={e => setBusca(e.target.value)} /></label>
            <div className="cm-chips">
              {([['vendas', 'Vendas da Maia'], ['sem', 'Sem resposta'], ['ia', 'IA'], ['time', 'Com o time'], ['todas', 'Todas']] as const).map(([k, n]) => (
                <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{n} <span>{contar(k)}</span></button>
              ))}
            </div>
          </div>
          <div className="cm-convs">
            {!carregou && <p className="cm-vazio">Carregando…</p>}
            {carregou && lista.length === 0 && <p className="cm-vazio">{filtro === 'vendas' ? 'Ninguém do quiz conversou com a Maia ainda. Quando chegar, aparece aqui.' : 'Nenhuma conversa nesse filtro.'}</p>}
            {lista.map(c => (
              <button key={c.id} className="cm-conv" aria-current={c.id === ativaId} onClick={() => setAtivaId(c.id)}>
                <span className="av">{iniciais(c.nome, c.telefone)}</span>
                <span className="t">
                  <span className="l1"><b>{c.nome || c.telefone}</b>{c.fase === 'maia' && c.modo === 'ia' && <span className="tag-ia">IA</span>}{c.modo === 'humano' && <span className="tag-time">time</span>}<span className="h mono">{quando(c.ultima_msg_em)}</span></span>
                  <span className="msg">{c.ultima_msg || '—'}</span>
                  {c.lead && <span className="etapa">{ETAPA_NOME[c.lead.etapa] || c.lead.etapa}{c.lead.negocio ? ' · ' + c.lead.negocio.replace(/^Maia · [^:]+:\s*/, '') : ''}</span>}
                </span>
                {c.nao_lidas > 0 && <span className="nl">{c.nao_lidas}</span>}
              </button>
            ))}
          </div>
        </section>

        {/* a conversa */}
        <section className="cm-chat vidro" aria-label="Conversa">
          {!conversa || conversa.id !== ativaId ? (
            <div className="cm-vazio grande">Escolhe uma conversa ao lado.</div>
          ) : (
            <>
              <div className="cm-chat-cab">
                <button className="cm-voltar" onClick={() => setAtivaId(null)} aria-label="Voltar pra lista"><ArrowLeft size={16} /></button>
                <div className="quem">
                  <b>{conversa.nome || conversa.telefone}</b>
                  <span>{comTime ? 'Com o time · a IA está parada' : conversa.fase === 'maia' ? 'A Maia (IA) está atendendo' : `Fase ${conversa.fase} · ${conversa.modo}`}</span>
                </div>
                <div className="botoes">
                  {comTime ? (
                    <>
                      <button className="cm-ghost" onClick={() => acao({ acao: 'devolver' })}><Bot size={14} /> Devolver pra IA</button>
                      <button className="cm-ghost" onClick={() => acao({ acao: 'devolver', responder: true })} title="Devolve e a Maia responde agora, lendo o que o time falou">Devolver e responder</button>
                    </>
                  ) : (
                    <button className="cm-ghost" onClick={() => acao({ acao: 'assumir' })}><UserRound size={14} /> Assumir conversa</button>
                  )}
                </div>
              </div>
              <div className="cm-msgs">
                {msgs.map((m, i) => {
                  const dia = new Date(m.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                  const diaAnt = i ? new Date(msgs[i - 1].criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : ''
                  const lado = m.autor === 'cliente' ? 'ele' : m.autor === 'ia' ? 'ia' : 'eu'
                  // 'acao' do sistema é anotação interna (o que a Maia fez), não mensagem que saiu: vai como nota no meio
                  if (m.autor === 'sistema' && m.tipo === 'acao') return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      {dia !== diaAnt && <span className="dia mono">{dia}</span>}
                      <span className="nota">{m.texto}</span>
                    </div>
                  )
                  return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      {dia !== diaAnt && <span className="dia mono">{dia}</span>}
                      <div className={'b ' + lado + (m.status === 'falhou' ? ' falhou' : '')}>
                        {m.texto || `[${TIPO[m.tipo] || m.tipo}]`}
                        <small className="mono">{AUTOR[m.autor] ? AUTOR[m.autor] + ' · ' : ''}{new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{m.status === 'falhou' ? ' · não saiu' : ''}</small>
                      </div>
                    </div>
                  )
                })}
                <div ref={fimRef} />
              </div>
              {aviso && <div className="cm-aviso dentro">{aviso}</div>}
              <div className="cm-escrever">
                {conversa.janela ? (
                  <>
                    <textarea rows={1} placeholder={comTime ? 'Escrever mensagem…' : 'Escrever (a IA para quando tu responder)…'} value={texto}
                      onChange={e => setTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} />
                    <button className="cm-prim" onClick={enviar} disabled={enviando || !texto.trim()}><Send size={14} /> {enviando ? 'Enviando…' : 'Enviar'}</button>
                  </>
                ) : (
                  <p className="cm-fora">Passou de 24 horas da última mensagem do cliente: a Meta só deixa mandar modelo aprovado. Quando ele responder, a caixa libera.</p>
                )}
              </div>
            </>
          )}
        </section>

        {/* a ficha */}
        <aside className="cm-ficha vidro" aria-label="Ficha">
          {!conversa || conversa.id !== ativaId ? <div className="cm-vazio">A ficha do lead aparece aqui.</div> : (
            <>
              <b className="nome">{lead?.nome || conversa.nome || conversa.telefone}</b>
              <div className="kv">
                <div><span>Telefone</span><b className="mono">{conversa.telefone}</b></div>
                <div><span>Etapa</span><b>{lead ? (ETAPA_NOME[lead.etapa] || lead.etapa) : '—'}</b></div>
                <div><span>Quem atende</span><b>{comTime ? 'Time' : conversa.fase === 'maia' ? 'Maia (IA)' : conversa.modo}</b></div>
                <div><span>Respostas da IA</span><b className="mono">{conversa.ia_respostas || 0}</b></div>
              </div>
              {lead && (q.nicho || q.negocio || q.cidade) && (
                <div className="diag">
                  <h5>Diagnóstico do quiz</h5>
                  <span><b>{q.negocio || q.nicho}</b>{q.cidade ? ` em ${q.cidade}${q.uf ? '/' + q.uf : ''}` : ''}</span>
                  {lead.maior_problema && <span>Ponto principal: {lead.maior_problema}</span>}
                  {q.maia_motivo_perda && <span className="neg">Motivo da perda: {q.maia_motivo_perda}</span>}
                </div>
              )}
              {lead ? <Link className="cm-prim largo" href={`/dashboard/crm?lead=${lead.id}`}>Abrir o cartão no Funil</Link>
                : <p className="cm-vazio pequeno">Sem cartão ligado ainda: a Maia liga na primeira resposta dela.</p>}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

// Visual no mesmo desenho do Funil novo. Vidro só nas três peças paradas (lista, conversa, ficha); nada de
// desfoque nos itens que rolam.
const CM_CSS = `
.cm{--cm-line:color-mix(in srgb,var(--text) 9%,transparent);--cm-line2:color-mix(in srgb,var(--text) 15%,transparent);--cm-lane:color-mix(in srgb,var(--text) 3.5%,transparent);--cm-dim:color-mix(in srgb,var(--accent) 13%,transparent);
  padding:22px clamp(12px,4vw,40px) 28px;display:flex;flex-direction:column;gap:20px}
.cm .mono{font-family:var(--f-mono,ui-monospace),ui-monospace,'SF Mono',Menlo,monospace;letter-spacing:0;font-variant-numeric:tabular-nums}
.cm button,.cm textarea,.cm input{font:inherit;color:inherit}
.cm-topo{display:flex;flex-wrap:wrap;gap:14px 28px;align-items:flex-end;justify-content:space-between}
.cm-topo h1{font-size:26px;font-weight:600;letter-spacing:-.035em;margin:0;color:var(--text)}
.cm-topo p{margin:6px 0 0;font-size:13px;color:var(--text-muted)}
.cm-kpis{display:flex;gap:24px}
.cm-kpis div{display:flex;flex-direction:column;gap:2px}
.cm-kpis span{font-size:11.5px;color:var(--text-faint)}
.cm-kpis b{font-size:17px;font-weight:600;letter-spacing:-.03em;color:var(--text);font-variant-numeric:tabular-nums}
.cm-aviso{font-size:13px;color:var(--amber);background:color-mix(in srgb,var(--amber) 10%,transparent);border:1px solid color-mix(in srgb,var(--amber) 30%,transparent);border-radius:10px;padding:9px 12px}
.cm-aviso.dentro{margin:0 12px}
.cm-grade{display:grid;grid-template-columns:320px minmax(0,1fr) 270px;gap:12px;height:calc(100dvh - 210px);min-height:560px}
.cm-lista,.cm-chat,.cm-ficha{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:0}
.cm-lista-cab{padding:12px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--cm-line)}
.cm-busca{display:flex;align-items:center;gap:8px;border:1px solid var(--cm-line);background:var(--surface);border-radius:10px;padding:0 10px;color:var(--text-faint)}
.cm-busca input{flex:1;min-width:0;border:0;background:none;outline:none;padding:7px 0;font-size:13px;color:var(--text)}
.cm-chips{display:flex;flex-wrap:wrap;gap:6px}
.cm-chips button{border:1px solid var(--cm-line);background:none;border-radius:999px;padding:2px 10px;font-size:12px;color:var(--text-muted);cursor:pointer;display:inline-flex;gap:5px}
.cm-chips button span{color:var(--text-faint);font-variant-numeric:tabular-nums}
.cm-chips button[aria-pressed="true"]{background:var(--text);color:var(--bg);border-color:var(--text)}
.cm-chips button[aria-pressed="true"] span{color:var(--bg);opacity:.7}
.cm-convs{flex:1;overflow-y:auto;min-height:0}
.cm-conv{display:flex;gap:10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--cm-line);background:none;padding:11px 12px;cursor:pointer;align-items:flex-start}
.cm-conv:hover{background:var(--cm-lane)}
.cm-conv[aria-current="true"]{background:var(--cm-dim)}
.cm-conv .av{width:34px;height:34px;flex:0 0 34px;border-radius:50%;border:1px solid var(--cm-line);background:var(--cm-lane);display:grid;place-items:center;font-size:12px;font-weight:500;color:var(--text-muted)}
.cm-conv .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cm-conv .l1{display:flex;align-items:baseline;gap:6px;min-width:0}
.cm-conv b{font-size:13.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-conv .h{margin-left:auto;font-size:10.5px;color:var(--text-faint);flex-shrink:0}
.cm-conv .msg{font-size:12.5px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-conv .etapa{font-size:11.5px;color:var(--accent-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-conv .nl{min-width:18px;height:18px;border-radius:9px;background:#25D366;color:#063;font-size:10.5px;font-weight:700;display:grid;place-items:center;padding:0 5px;margin-top:4px}
.tag-ia,.tag-time{font-family:var(--f-mono,ui-monospace),monospace;font-size:10px;border-radius:5px;padding:0 4px;flex-shrink:0}
.tag-ia{color:var(--blue);border:1px solid color-mix(in srgb,var(--blue) 40%,transparent)}
.tag-time{color:var(--green);border:1px solid color-mix(in srgb,var(--green) 40%,transparent)}
.cm-chat-cab{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--cm-line);flex-wrap:wrap}
.cm-chat-cab .quem{flex:1;min-width:160px;display:flex;flex-direction:column}
.cm-chat-cab .quem b{font-weight:500;color:var(--text)}
.cm-chat-cab .quem span{font-size:12px;color:var(--text-faint)}
.cm-chat-cab .botoes{display:flex;gap:8px;flex-wrap:wrap}
.cm-voltar{display:none;border:0;background:none;cursor:pointer;color:var(--text-muted);padding:4px}
.cm-ghost{border:1px solid var(--cm-line);background:none;border-radius:10px;padding:6px 11px;font-size:12.5px;font-weight:500;color:var(--text-muted);cursor:pointer;display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
.cm-ghost:hover{border-color:var(--cm-line2);color:var(--text)}
.cm-msgs{flex:1;overflow-y:auto;min-height:0;padding:16px 14px;display:flex;flex-direction:column;gap:8px}
.cm-msgs .dia{align-self:center;font-size:10.5px;color:var(--text-faint);text-transform:uppercase;margin:4px 0}
.cm-msgs .b{max-width:74%;padding:8px 12px;border-radius:14px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word;color:var(--text)}
.cm-msgs .b small{display:block;font-size:10px;opacity:.6;margin-top:3px;text-align:right}
.cm-msgs .b.ele{align-self:flex-start;background:var(--surface);border:1px solid var(--cm-line);border-bottom-left-radius:5px}
.cm-msgs .b.ia{align-self:flex-end;background:var(--cm-dim);border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);border-bottom-right-radius:5px}
.cm-msgs .b.eu{align-self:flex-end;background:var(--text);color:var(--bg);border-bottom-right-radius:5px}
.cm-msgs .b.falhou{outline:1px solid var(--red)}
.cm-msgs .nota{align-self:center;max-width:86%;font-size:11.5px;color:var(--text-faint);text-align:center;border:1px dashed var(--cm-line2);border-radius:8px;padding:3px 9px}
.cm-escrever{display:flex;gap:8px;padding:12px;border-top:1px solid var(--cm-line);align-items:flex-end}
.cm-escrever textarea{flex:1;min-width:0;resize:none;border:1px solid var(--cm-line);background:var(--surface);border-radius:12px;padding:9px 12px;font-size:13.5px;color:var(--text);max-height:140px;field-sizing:content;outline:none}
.cm-prim{border:0;background:var(--text);color:var(--bg);border-radius:10px;padding:8px 13px;font-size:13px;font-weight:500;cursor:pointer;display:inline-flex;gap:6px;align-items:center;justify-content:center;text-decoration:none;white-space:nowrap}
.cm-prim:disabled{opacity:.5;cursor:default}
.cm-prim.largo{margin-top:auto}
.cm-fora{margin:0;font-size:12.5px;color:var(--text-muted)}
.cm-ficha{padding:16px;gap:14px;overflow-y:auto}
.cm-ficha .nome{font-size:15px;font-weight:600;letter-spacing:-.02em;color:var(--text)}
.cm-ficha .kv{display:flex;flex-direction:column;gap:9px}
.cm-ficha .kv div{display:flex;justify-content:space-between;gap:10px;font-size:12.5px}
.cm-ficha .kv span{color:var(--text-faint)}
.cm-ficha .kv b{font-weight:500;text-align:right;color:var(--text)}
.cm-ficha .diag{border-top:1px solid var(--cm-line);padding-top:12px;display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--text-muted)}
.cm-ficha .diag h5{margin:0;font-size:12px;font-weight:500;color:var(--text-faint)}
.cm-ficha .diag b{font-weight:500;color:var(--text)}
.cm-ficha .neg{color:var(--red)}
.cm-vazio{padding:22px 14px;text-align:center;font-size:12.5px;color:var(--text-faint);margin:0}
.cm-vazio.grande{margin:auto}
.cm-vazio.pequeno{padding:4px 0;text-align:left}
@media (max-width:1180px){.cm-grade{grid-template-columns:300px minmax(0,1fr)}.cm-ficha{display:none}}
@media (max-width:760px){
  .cm-grade{grid-template-columns:1fr;height:auto}
  .cm-lista{max-height:none}
  .cm-grade.aberta .cm-lista{display:none}
  .cm-grade:not(.aberta) .cm-chat{display:none}
  .cm-chat{height:calc(100dvh - 190px);min-height:460px}
  .cm-voltar{display:inline-flex}
  .cm-kpis{gap:16px}
}
`
