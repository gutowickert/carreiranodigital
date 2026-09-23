'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { fetchAuth } from '@/lib/api'
import { Vazio } from '@/components/ui'
import { Server, ExternalLink, Plus, X, RefreshCw, ClipboardList, Copy } from 'lucide-react'

// INSTALAÇÕES — todos os sistemas que a gente instalou, num lugar só.
//
// A tela existe porque a escola não sabia o que estava instalado: rodam 4 sistemas e ela conhecia 1.
// Os clientes existem em Entregas, mas com o NOME DA PESSOA — o CRM da GAJA está cadastrado como
// "Jhones Azambuja", e nada dizia que um era o outro. Aqui os dois mundos aparecem na mesma linha.
//
// Três coisas por linha, na ordem em que a pergunta aparece na cabeça:
//   1. o sistema está no ar?        (a escola bate no endereço — não mexe em cliente nenhum)
//   2. a implantação está em que pé? (o questionário, que mora no banco da escola)
//   3. o cliente pagou?              (a mensalidade, que agora vira lançamento sozinha)
//
// ⚠️ `interno` (JamRock, Núcleo) aparece na lista e NUNCA entra em cobrança. Sem essa distinção
// eles ficariam parecendo cliente que esqueceu de pagar.

type Inst = {
  id: string; nome: string; url: string | null; tipo: 'cliente' | 'interno'; observacoes: string | null
  contrato: { id: string; cliente: string; produto: string; status: string; fase: string | null; desde: string } | null
  cobranca: { valor: number | null; dia: number | null; desde: string | null; ligada: boolean; motivo: string | null
    emAberto: number; vencidas: number; proxima: { valor: number; vence: string; mes: string } | null } | null
  implantacao: { slug: string; respostas: number } | null
}
type NoAr = Record<string, { ok: boolean; status: number; ms: number; erro?: string }>

const br = (d?: string | null) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'
const dinheiro = (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })
const hoje = () => new Date().toISOString().slice(0, 10)

export default function Instalacoes() {
  const [lista, setLista] = useState<Inst[]>([])
  const [mrr, setMrr] = useState(0)
  const [noAr, setNoAr] = useState<NoAr>({})
  const [conferindo, setConferindo] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [editar, setEditar] = useState<Partial<Inst> | null>(null)
  const [questionario, setQuestionario] = useState<Inst | null>(null)

  async function carregar() {
    const r = await fetchAuth('/api/instalacoes')
    const j = await r.json().catch(() => null)
    setCarregando(false)
    if (!j?.ok) { setErro(j?.error === 'só administradores' ? 'Esta tela é só para administradores.' : (j?.error || 'não consegui carregar')); return }
    setLista(j.instalacoes || []); setMrr(j.mrr || 0); setErro('')
  }
  useEffect(() => { carregar() }, [])

  async function conferir() {
    setConferindo(true)
    const j = await fetchAuth('/api/instalacoes/no-ar').then(r => r.json()).catch(() => null)
    setConferindo(false)
    if (j?.ok) setNoAr(j.estado || {})
  }
  useEffect(() => { if (lista.length) conferir() }, [lista.length])

  const clientes = lista.filter(i => i.tipo === 'cliente')
  const internos = lista.filter(i => i.tipo === 'interno')
  const vencidas = clientes.reduce((s, i) => s + (i.cobranca?.vencidas || 0), 0)

  return (
    <Layout>
      <div style={{ padding: '20px clamp(12px, 3vw, 32px)', maxWidth: 1080, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <h1 className="display relevo-titulo" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Clientes do CRM</h1>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {clientes.length} de cliente · {internos.length} interna{internos.length !== 1 ? 's' : ''}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={conferir} disabled={conferindo} style={btnSec}>
            <RefreshCw size={14} style={conferindo ? { animation: 'girar 1s linear infinite' } : undefined} /> {conferindo ? 'conferindo…' : 'conferir se estão no ar'}
          </button>
          <button onClick={() => setEditar({ tipo: 'cliente' })} className="btn-afunda" style={btnPri}><Plus size={15} strokeWidth={2.4} /> Nova</button>
        </div>
        <style>{`@keyframes girar { to { transform: rotate(360deg) } }`}</style>

        {erro && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: '12px 16px', fontSize: 13.5, color: 'var(--red)' }}>{erro}</div>}

        {!erro && !carregando && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <div className="vidro" style={{ padding: '14px 18px', flex: '1 1 200px' }}>
              <div style={rot}>Recorrente por mês</div>
              <div className="tnum" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{dinheiro(mrr)}</div>
            </div>
            <div className="vidro" style={{ padding: '14px 18px', flex: '1 1 200px', borderColor: vencidas ? 'var(--red)' : undefined }}>
              <div style={rot}>Cobranças vencidas</div>
              <div className="tnum" style={{ fontSize: 26, fontWeight: 800, color: vencidas ? 'var(--red)' : 'var(--text)', marginTop: 2 }}>{vencidas}</div>
            </div>
          </div>
        )}

        {carregando ? (
          <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2].map(n => <div key={n} className="esqueleto" style={{ height: 92, borderRadius: 'var(--r-lg)' }} />)}</div>
        ) : !erro && !lista.length ? (
          <Vazio icone={Server} titulo="Nenhuma instalação" texto="Rode o SQL de produto e recarregue, ou cadastre a primeira." />
        ) : !erro && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {clientes.map(i => <Linha key={i.id} i={i} noAr={noAr[i.id]} onEditar={() => setEditar(i)} onQuestionario={() => setQuestionario(i)} />)}
            {internos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 2px' }}>
                <span style={{ ...rot, whiteSpace: 'nowrap' }}>Nossos — nunca entram em cobrança</span>
                <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
              </div>
            )}
            {internos.map(i => <Linha key={i.id} i={i} noAr={noAr[i.id]} onEditar={() => setEditar(i)} onQuestionario={() => setQuestionario(i)} />)}
          </div>
        )}

        {editar && <ModalInstalacao inicial={editar} onFechar={() => setEditar(null)} onSalvo={() => { setEditar(null); carregar() }} />}
        {questionario && <ModalQuestionario inst={questionario} onFechar={() => { setQuestionario(null); carregar() }} />}
      </div>
    </Layout>
  )
}

function Linha({ i, noAr, onEditar, onQuestionario }: { i: Inst; noAr?: NoAr[string]; onEditar: () => void; onQuestionario: () => void }) {
  const c = i.cobranca
  const atrasada = (c?.vencidas || 0) > 0
  const interno = i.tipo === 'interno'

  return (
    <div className="card-hover" style={{
      background: 'var(--surface)', border: `1px solid ${atrasada ? 'var(--red)' : 'var(--border)'}`,
      borderRadius: 'var(--r-lg)', padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
      opacity: interno ? .82 : 1,
    }}>
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>{i.nome}</span>
          {interno
            ? <Selo cor="var(--accent-soft)" bg="var(--accent-bg)">interno</Selo>
            : noAr === undefined ? null
              : noAr.ok ? <Selo cor="var(--green)" bg="var(--green-bg)">no ar · {noAr.ms}ms</Selo>
                : <Selo cor="var(--red)" bg="var(--red-bg)">{noAr.erro || `respondeu ${noAr.status}`}</Selo>}
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {i.url
            ? <a href={i.url} target="_blank" rel="noopener" style={{ color: 'var(--accent-soft)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i.url.replace(/^https:\/\//, '')} <ExternalLink size={11} />
              </a>
            : <span>sem endereço</span>}
          {i.contrato && <span>· contrato: <b style={{ color: 'var(--text-2)' }}>{i.contrato.cliente}</b></span>}
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onQuestionario} style={{ ...btnSec, padding: '5px 11px', fontSize: 12, borderColor: i.implantacao ? 'var(--border-strong)' : 'var(--accent)', color: i.implantacao ? 'var(--text-2)' : 'var(--accent-soft)' }}>
            <ClipboardList size={12} />
            {i.implantacao ? 'o link do questionário' : 'criar questionário'}
          </button>
          {i.implantacao && (
            <a href={`/dashboard/instalacoes/respostas/${i.implantacao.slug}`}
              style={{ ...btnSec, padding: '5px 11px', fontSize: 12, textDecoration: 'none', borderColor: i.implantacao.respostas ? 'var(--accent)' : 'var(--border-strong)', color: i.implantacao.respostas ? 'var(--accent-soft)' : 'var(--text-faint)' }}>
              {i.implantacao.respostas ? `ver ${i.implantacao.respostas} respostas ↗` : 'sem respostas ainda'}
            </a>
          )}
        </div>
        {i.observacoes && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.5 }}>{i.observacoes}</div>}
      </div>

      <div style={{ flex: '0 1 210px', textAlign: 'right' }}>
        {interno || !c ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{interno ? 'sem cobrança' : 'sem contrato ligado'}</div>
        ) : (
          <>
            <div className="tnum" style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
              {c.valor ? dinheiro(c.valor) : '—'}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>/mês</span>
            </div>
            <div style={{ fontSize: 12, color: atrasada ? 'var(--red)' : 'var(--text-muted)', marginTop: 3 }}>
              {!c.ligada
                ? <span style={{ color: 'var(--amber)' }}>não cobra — {c.motivo}</span>
                : atrasada ? `${c.vencidas} vencida${c.vencidas > 1 ? 's' : ''}`
                  : c.proxima ? `vence ${br(c.proxima.vence)}` : `dia ${c.dia}`}
            </div>
          </>
        )}
        <button onClick={onEditar} style={{ ...btnSec, marginTop: 8, padding: '5px 11px', fontSize: 12 }}>editar</button>
      </div>
    </div>
  )
}

function Selo({ children, cor, bg }: { children: React.ReactNode; cor: string; bg: string }) {
  return <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 'var(--r-pill)', background: bg, color: cor }}>{children}</span>
}

function ModalInstalacao({ inicial, onFechar, onSalvo }: { inicial: Partial<Inst>; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    nome: inicial.nome || '', url: inicial.url || '', tipo: inicial.tipo || 'cliente',
    projeto_id: inicial.contrato?.id || '', observacoes: inicial.observacoes || '',
  })
  // a cobrança mora no PROJETO (é do contrato, não do sistema). Aqui é só outra porta pro mesmo
  // dado — a ficha da entrega continua valendo e mostra o mesmo.
  const [c, setC] = useState({
    valor: inicial.cobranca?.valor != null ? String(inicial.cobranca.valor) : '',
    dia: inicial.cobranca?.dia != null ? String(inicial.cobranca.dia) : '',
    desde: inicial.cobranca?.desde || '',
  })
  const [projetos, setProjetos] = useState<any[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetchAuth('/api/projetos').then(r => r.json()).then(j => setProjetos(j?.projetos || j?.itens || [])).catch(() => {})
  }, [])

  async function salvar() {
    if (!f.nome.trim()) { setErro('Falta o nome do sistema.'); return }
    setSalvando(true); setErro('')
    const j = await fetchAuth('/api/instalacoes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, id: inicial.id, cobranca: f.tipo === 'cliente' && f.projeto_id ? c : undefined }),
    }).then(r => r.json()).catch(() => null)
    setSalvando(false)
    if (!j?.ok) { setErro(j?.error || 'não consegui salvar'); return }
    onSalvo()
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(8,4,20,.55)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="vidro" style={{ padding: 22, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 className="display" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{inicial.id ? 'Editar instalação' : 'Nova instalação'}</h2>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: 'var(--glass-field)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: 30, height: 30, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={15} /></button>
        </div>

        <div><label style={lbl}>Nome do sistema</label><input style={inp} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="GAJA Corretora de Seguros" autoFocus /></div>
        <div><label style={lbl}>Endereço</label><input style={inp} value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://crm-gaja.vercel.app" /></div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
          Só o endereço. <b>Senha de cliente não entra aqui</b> — quem clica cai no login dele.
        </p>

        <div><label style={lbl}>Tipo</label>
          <select style={inp} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as any })}>
            <option value="cliente">De cliente — entra na cobrança</option>
            <option value="interno">Interno — nosso, nunca cobra</option>
          </select>
        </div>

        <div><label style={lbl}>Contrato em Entregas</label>
          <select style={inp} value={f.projeto_id} onChange={e => setF({ ...f, projeto_id: e.target.value })}>
            <option value="">sem contrato ligado</option>
            {projetos.map((p: any) => <option key={p.id} value={p.id}>{p.cliente}</option>)}
          </select>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
          É o que liga o sistema ao contrato quando os nomes são diferentes — o valor e o dia da mensalidade saem de lá.
        </p>

        {f.tipo === 'cliente' && f.projeto_id && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ ...rot, marginBottom: 10 }}>Cobrança</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10 }}>
              <div><label style={lbl}>Mensalidade (R$)</label><input style={inp} value={c.valor} onChange={e => setC({ ...c, valor: e.target.value })} placeholder="1500" inputMode="decimal" /></div>
              <div><label style={lbl}>Vence dia</label><input style={inp} value={c.dia} onChange={e => setC({ ...c, dia: e.target.value })} placeholder="10" inputMode="numeric" /></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={lbl}>Cobrar a partir de</label>
              <input type="date" style={inp} value={c.desde} onChange={e => setC({ ...c, desde: e.target.value })} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '8px 0 0', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--amber)' }}>Vazio = não cobra nada.</b> O sistema nunca gera cobrança antes
              desta data — o que o cliente já pagou à mão fica como está. É a trava que evita ir atrás de quem
              não deve nada.
            </p>
          </div>
        )}

        <div><label style={lbl}>Observação</label><input style={inp} value={f.observacoes} onChange={e => setF({ ...f, observacoes: e.target.value })} placeholder="opcional" /></div>

        {erro && <p style={{ fontSize: 12.5, color: 'var(--red)', margin: 0 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFechar} style={{ ...btnSec, flex: 1 }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ ...btnPri, flex: 1 }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// O QUESTIONÁRIO — cria o link que se manda pro dono responder, ou mostra o que já existe.
//
// ⚠️ A CHAVE VIVE NO LINK, e só ali. É ela que protege as respostas: quem não tem o link inteiro
// não lê nem escreve nada. Por isso não existe tela que liste chaves — se o link se perder, o
// caminho é criar outro (e o antigo para de valer).
function ModalQuestionario({ inst, onFechar }: { inst: Inst; onFechar: () => void }) {
  const [link, setLink] = useState('')
  const [nome, setNome] = useState(inst.nome)
  const [respostas, setRespostas] = useState(inst.implantacao?.respostas ?? 0)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!inst.implantacao) return
    fetchAuth('/api/instalacoes/questionario').then(r => r.json()).then(j => {
      const q = (j?.questionarios || []).find((x: any) => x.slug === inst.implantacao!.slug)
      if (q) { setLink(`${window.location.origin}/implantacao/${q.slug}?k=${q.chave}`); setRespostas(q.respostas) }
    }).catch(() => {})
  }, [inst])

  async function criar() {
    setCriando(true); setErro('')
    const j = await fetchAuth('/api/instalacoes/questionario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
    }).then(r => r.json()).catch(() => null)
    setCriando(false)
    if (!j?.ok) { setErro(j?.error || 'não consegui criar'); return }
    setLink(`${window.location.origin}/implantacao/${j.slug}?k=${j.chave}`)
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(8,4,20,.55)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="vidro" style={{ padding: 22, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 className="display" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Questionário de implantação</h2>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: 'var(--glass-field)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: 30, height: 30, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={15} /></button>
        </div>

        {link ? (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>
              Manda este link pro dono da empresa. Ele responde aos poucos — <b>salva sozinho</b>, e o mesmo
              link traz de volta de onde parou. Dá pra responder <b>falando</b>: o áudio vira texto sozinho.
            </p>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '11px 13px', fontSize: 12.5, color: 'var(--text-2)', wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{link}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => { navigator.clipboard?.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2500) }} style={{ ...btnPri, flex: 1 }}>
                <Copy size={14} /> {copiado ? 'copiado!' : 'copiar o link'}
              </button>
              <a href={link} target="_blank" rel="noopener" style={{ ...btnSec, textDecoration: 'none' }}>abrir ↗</a>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
              {respostas > 0 ? `${respostas} respostas até agora. ` : 'Nenhuma resposta ainda. '}
              <b>A chave está dentro do link</b> — é ela que protege as respostas. Guarda o link; se ele se perder,
              o caminho é criar outro.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>
              Cria o questionário desta empresa e gera o link pra mandar pro dono. São ~100 perguntas em 17
              blocos, com as propostas que a gente já montou pra ele só aprovar ou ajustar.
            </p>
            <div><label style={lbl}>Nome da empresa (aparece pra ele)</label><input style={inp} value={nome} onChange={e => setNome(e.target.value)} /></div>
            {erro && <p style={{ fontSize: 12.5, color: 'var(--red)', margin: 0 }}>{erro}</p>}
            <button onClick={criar} disabled={criando} style={btnPri}>{criando ? 'Criando…' : 'Criar e gerar o link'}</button>
          </>
        )}
      </div>
    </div>
  )
}

const rot = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' } as React.CSSProperties
const btnPri = { padding: '9px 16px', background: 'var(--grad)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties
const btnSec = { padding: '8px 14px', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties
const inp = { background: 'var(--glass-field)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', width: '100%' } as React.CSSProperties
const lbl = { fontSize: 11.5, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } as React.CSSProperties
