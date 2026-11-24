'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  QUIZZES, OFERTA_QUIZ, DESTINO_COMECAR, DESTINO_DUVIDA, TURMA_QUIZ, UFS,
  diagnosticar, telefoneBR, mensagemWhats, reaisQuiz as reais, type Nicho, type Destino, type Diagnostico,
} from '@/lib/maia/quiz/quiz'

// Quiz de diagnóstico da Maia. Uma pergunta por tela (tocar avança sozinho), depois o contato, depois o
// resultado. A conta roda AQUI (mesma função da API), então o resultado aparece mesmo se a API cair; o envio
// do lead tenta de novo sozinho e, se não der, fica guardado no aparelho pra tentar na próxima visita. Os
// botões do fim vão pro WhatsApp da escola pelo /wa (rastreio + código), com o resumo na mensagem.

declare global { interface Window { fbq?: (...a: any[]) => void } }

const PENDENTE = 'maia_quiz_pendente'
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
const evId = () => { try { return crypto.randomUUID() } catch { return uid() + uid() } }
const cookie = (n: string) => { try { const m = document.cookie.match('(^|;)\\s*' + n + '=([^;]*)'); return m ? decodeURIComponent(m[2]) : null } catch { return null } }
const fbq = (...a: any[]) => { try { window.fbq?.(...a) } catch { /* sem pixel */ } }
const espera = (ms: number) => new Promise(res => setTimeout(res, ms))

function mascara(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

type Rastro = { vid: string; sid: string; utm: Record<string, string>; fbclid: string | null }

async function enviarLead(corpo: any): Promise<boolean> {
  for (const ms of [0, 1500, 4000, 8000]) {
    if (ms) await espera(ms)
    try {
      const res = await fetch('/api/maia/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), keepalive: true })
      if (res.ok) return true
      if (res.status === 400 || res.status === 429) return false   // erro de dado: tentar de novo não resolve
    } catch { /* rede: tenta de novo */ }
  }
  return false
}

const Seta = () => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
const Zap = () => <svg className="mq-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" /></svg>
const Ok = () => <svg className="mq-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>

function Topo() {
  return (
    <div className="mq-marca">
      <span className="mq-chapa"><img src="/imersao/midia/logo.webp" alt="Carreira no Digital" width="256" height="93" /></span>
      <span className="mq-nome">Maia</span>
    </div>
  )
}

export default function QuizMaia({ nicho }: { nicho: Nicho }) {
  const q = QUIZZES[nicho]
  const total = q.perguntas.length
  const [passo, setPasso] = useState(-1)       // -1 abertura · 0..total-1 perguntas · total contato · total+1 resultado
  const [r, setR] = useState<Record<string, string>>({})
  const [c, setC] = useState({ nome: '', negocio: '', whats: '', cidade: '', uf: '' })
  const [erro, setErro] = useState('')
  const [diag, setDiag] = useState<Diagnostico | null>(null)
  const [envio, setEnvio] = useState<'' | 'enviando' | 'ok' | 'falhou'>('')
  const ev = useRef<string>('')
  const rastro = useRef<Rastro | null>(null)

  // identidade do visitante (a mesma das outras páginas da escola) e origem do anúncio
  useEffect(() => {
    let vid = '', sid = ''
    try { vid = localStorage.getItem('cnd_vid') || ''; if (!vid) { vid = uid(); localStorage.setItem('cnd_vid', vid) } } catch { vid = uid() }
    try { sid = sessionStorage.getItem('cnd_sid') || ''; if (!sid) { sid = uid(); sessionStorage.setItem('cnd_sid', sid) } } catch { sid = uid() }
    const qs = new URLSearchParams(location.search)
    let fbclid = qs.get('fbclid')
    try { if (fbclid) localStorage.setItem('cnd_fbclid', fbclid); else fbclid = localStorage.getItem('cnd_fbclid') } catch { /* ok */ }
    const utm: Record<string, string> = {}
    for (const k of ['source', 'medium', 'campaign', 'content']) {
      let v = qs.get('utm_' + k) || ''
      try { if (v) sessionStorage.setItem('mq_utm_' + k, v); else v = sessionStorage.getItem('mq_utm_' + k) || '' } catch { /* ok */ }
      utm[k] = v
    }
    if (!utm.campaign) utm.campaign = `maia-quiz-${nicho}`
    rastro.current = { vid, sid, utm, fbclid }
    track('page_view')
    // lead que não conseguiu gravar numa visita anterior: tenta de novo agora
    try {
      const pend = JSON.parse(localStorage.getItem(PENDENTE) || 'null')
      if (pend && pend.corpo) enviarLead(pend.corpo).then(ok => { if (ok) try { localStorage.removeItem(PENDENTE) } catch { /* ok */ } })
    } catch { /* ok */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [passo])

  function track(evento: string, meta?: Record<string, any>) {
    const t = rastro.current
    if (!t) return
    try {
      const payload = JSON.stringify({
        visitor_id: t.vid, sessao_id: t.sid, evento, url: location.href, referrer: document.referrer,
        utm_source: t.utm.source, utm_medium: t.utm.medium, utm_campaign: t.utm.campaign, utm_content: t.utm.content,
        fbclid: t.fbclid, codigo_turma: TURMA_QUIZ, meta: { nicho, ...(meta || {}) },
      })
      if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([payload], { type: 'text/plain' }))
      else fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload, keepalive: true })
    } catch { /* rastreio nunca quebra a página */ }
  }

  function comecar() {
    track('quiz_inicio')
    fbq('track', 'ViewContent', { content_name: 'Maia', content_category: `Quiz ${q.nome}` })
    setPasso(0)
  }

  function escolhe(idx: number, v: string) {
    const p = q.perguntas[idx]
    setR(prev => ({ ...prev, [p.id]: v }))
    track('quiz_resposta', { n: idx + 1, pergunta: p.id, valor: v })
    setTimeout(() => setPasso(idx + 1), 180)
  }

  function verResultado(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const nome = c.nome.trim(), negocio = c.negocio.trim(), cidade = c.cidade.trim()
    if (nome.length < 2) return setErro('Escreva o seu nome.')
    if (negocio.length < 2) return setErro(`Escreva o nome da sua ${q.nome}.`)
    const tel = telefoneBR(c.whats)
    if (!tel) return setErro('Confira o WhatsApp: DDD e número, por exemplo (11) 98765-4321.')
    if (cidade.length < 2) return setErro('Escreva a sua cidade.')
    if (!c.uf) return setErro('Escolha o estado.')
    const d = diagnosticar(nicho, r, negocio)
    ev.current = evId()
    fbq('track', 'Lead', { content_name: 'Maia', content_category: `Quiz ${q.nome}` }, { eventID: ev.current })
    track('contato_enviado', { uf: c.uf, event_id: ev.current })
    setDiag(d)
    setPasso(total + 1)
    track('resultado_visto', { perda_mes: d.total_mes, principal: d.principal.id })

    const t = rastro.current
    const corpo = {
      nicho, nome, negocio, whatsapp: tel, cidade, uf: c.uf, respostas: r, event_id: ev.current, pagina: location.href,
      fbp: cookie('_fbp'), fbc: cookie('_fbc'), fbclid: t?.fbclid || null,
      utm_source: t?.utm.source || null, utm_medium: t?.utm.medium || null, utm_campaign: t?.utm.campaign || null, utm_content: t?.utm.content || null,
    }
    setEnvio('enviando')
    enviarLead(corpo).then(ok => {
      setEnvio(ok ? 'ok' : 'falhou')
      try { if (ok) localStorage.removeItem(PENDENTE); else localStorage.setItem(PENDENTE, JSON.stringify({ corpo, em: Date.now() })) } catch { /* ok */ }
      if (!ok) track('lead_falhou')
    })
  }

  function link(destino: Destino, botao: 'comecar' | 'duvida'): string {
    if (destino.tipo === 'link') return destino.url
    if (!diag) return '#'
    const t = rastro.current
    const sp = new URLSearchParams()
    sp.set('msg', mensagemWhats(diag, { cidade: c.cidade.trim(), uf: c.uf }, botao))
    sp.set('turma', TURMA_QUIZ)
    if (typeof location !== 'undefined') sp.set('src', location.href)
    if (t) { sp.set('vid', t.vid); sp.set('sid', t.sid) }
    // o mesmo event_id do Lead: se o lead só nascer pelo WhatsApp (a API falhou), a Meta não conta dois
    if (ev.current) sp.set('event_id', ev.current)
    const fbp = cookie('_fbp'), fbc = cookie('_fbc')
    if (fbp) sp.set('fbp', fbp)
    if (fbc) sp.set('fbc', fbc)
    if (t?.fbclid) sp.set('fbclid', t.fbclid)
    if (t) for (const k of ['source', 'medium', 'campaign', 'content']) if (t.utm[k]) sp.set('utm_' + k, t.utm[k])
    return '/wa?' + sp.toString()
  }

  function clique(botao: 'comecar' | 'duvida') {
    track(botao === 'comecar' ? 'clique_comecar' : 'clique_duvida', { envio })
    if (botao === 'comecar') fbq('track', 'InitiateCheckout', { content_name: 'Maia', content_category: `Quiz ${q.nome}`, currency: 'BRL', value: OFERTA_QUIZ.primeiro_mes }, { eventID: 'ic-' + ev.current })
  }

  const linkComecar = useMemo(() => link(DESTINO_COMECAR, 'comecar'), [diag, c.cidade, c.uf, envio]) // eslint-disable-line react-hooks/exhaustive-deps
  const linkDuvida = useMemo(() => link(DESTINO_DUVIDA, 'duvida'), [diag, c.cidade, c.uf, envio]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- abertura ----------------
  if (passo === -1) return (
    <main className={`mq-tela mq-${nicho}`}>
      <header className="mq-cab"><Topo /></header>
      <section className="mq-abre">
        <p className="mq-olho">{q.eyebrow}</p>
        <h1>{q.titulo}</h1>
        <p className="mq-sub">{q.sub}</p>
        <ul className="mq-ganhos">
          <li><Ok />Onde o cliente escapa hoje, ponto por ponto</li>
          <li><Ok />Quanto isso custa por mês, com a conta à mostra</li>
          <li><Ok />O que a Maia faz em cada ponto</li>
        </ul>
        <button className="mq-btn" onClick={comecar}>Começar o diagnóstico</button>
        <p className="mq-mini">1 minuto · {total} perguntas de tocar · sem custo</p>
      </section>
    </main>
  )

  // ---------------- perguntas ----------------
  if (passo < total) {
    const p = q.perguntas[passo]
    return (
      <main className={`mq-tela mq-${nicho}`}>
        <header className="mq-barra-topo">
          <button className="mq-voltar" onClick={() => setPasso(x => x - 1)} aria-label="Voltar"><Seta /></button>
          <div className="mq-barra" aria-hidden="true"><b style={{ width: `${Math.round(((passo + 1) / (total + 1)) * 100)}%` }} /></div>
          <span className="mq-conta">{passo + 1} de {total}</span>
        </header>
        <section className="mq-corpo" key={p.id}>
          <h1 className="mq-h">{p.titulo}</h1>
          {p.ajuda && <p className="mq-ajuda">{p.ajuda}</p>}
          <div className="mq-ops" role="radiogroup" aria-label={p.titulo}>
            {p.opcoes.map(o => (
              <button key={o.v} role="radio" aria-checked={r[p.id] === o.v} className={`mq-op${r[p.id] === o.v ? ' on' : ''}`} onClick={() => escolhe(passo, o.v)}>
                <span className="mq-bola" aria-hidden="true" />{o.t}
              </button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  // ---------------- contato ----------------
  if (passo === total) return (
    <main className={`mq-tela mq-${nicho}`}>
      <header className="mq-barra-topo">
        <button className="mq-voltar" onClick={() => setPasso(total - 1)} aria-label="Voltar"><Seta /></button>
        <div className="mq-barra" aria-hidden="true"><b style={{ width: `${Math.round((total / (total + 1)) * 100)}%` }} /></div>
        <span className="mq-conta">Último passo</span>
      </header>
      <form className="mq-corpo mq-form" onSubmit={verResultado} noValidate>
        <h1 className="mq-h">Seu diagnóstico está pronto. Pra quem é?</h1>
        <p className="mq-ajuda">A conta usa o nome da {q.nome}. O WhatsApp é pra nossa equipe tirar alguma dúvida, se você quiser.</p>
        <label>Seu nome<input autoComplete="given-name" value={c.nome} onChange={e => setC({ ...c, nome: e.target.value })} placeholder="Ex.: Carlos" /></label>
        <label>Nome da {q.nome}<input autoComplete="organization" value={c.negocio} onChange={e => setC({ ...c, negocio: e.target.value })} placeholder={nicho === 'oficina' ? 'Ex.: Auto Center Silva' : 'Ex.: Ótica Visão'} /></label>
        <label>WhatsApp com DDD<input type="tel" inputMode="numeric" autoComplete="tel-national" value={c.whats} onChange={e => setC({ ...c, whats: mascara(e.target.value) })} placeholder="(11) 98765-4321" /></label>
        <div className="mq-linha">
          <label className="mq-cidade">Cidade<input autoComplete="address-level2" value={c.cidade} onChange={e => setC({ ...c, cidade: e.target.value })} placeholder="Sua cidade" /></label>
          <label className="mq-uf">Estado<select value={c.uf} onChange={e => setC({ ...c, uf: e.target.value })}><option value="">UF</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}</select></label>
        </div>
        {erro && <p className="mq-erro" role="alert">{erro}</p>}
        <button className="mq-btn" type="submit">Ver meu diagnóstico</button>
        <p className="mq-mini">Seus dados ficam só com a Carreira no Digital. Nada de lista de spam.</p>
      </form>
    </main>
  )

  // ---------------- resultado ----------------
  const d = diag!
  const comConta = d.pontos.filter(x => x.valor_mes > 0)
  return (
    <main className={`mq-res mq-${nicho}`}>
      <header className="mq-cab"><Topo /></header>

      <section className="mq-bloco">
        <p className="mq-olho">Diagnóstico pronto</p>
        <h1>Diagnóstico da {d.negocio}</h1>
        <p className="mq-sub">Com as suas respostas, estes são os pontos onde a sua {q.nome} perde cliente hoje, e o que a Maia faz em cada um.</p>

        <div className="mq-total">
          <span>Estimativa conservadora do que fica na mesa: cerca de</span>
          <b>{reais(d.total_mes)}<small> por mês</small></b>
          <em>{reais(d.total_ano)} em 12 meses, somando {comConta.length} {comConta.length === 1 ? 'ponto' : 'pontos'} abaixo</em>
        </div>
      </section>

      <section className="mq-bloco">
        <ol className="mq-pontos">
          {d.pontos.map((x, i) => (
            <li key={x.id} className="mq-ponto">
              <div className="mq-ponto-cab">
                <span className="mq-n">{i + 1}</span>
                <h2>{x.titulo}</h2>
              </div>
              {x.valor_mes > 0
                ? <p className="mq-valor"><b>cerca de {reais(x.valor_mes)} por mês</b><span>{x.quantidade}</span></p>
                : <p className="mq-valor mq-fora"><span>Esse ponto não entra na conta: depende da verba e da sua cidade.</span></p>}
              <p>{x.onde_perde}</p>
              <div className="mq-maia"><strong>O que a Maia faz</strong><p>{x.maia_faz}</p></div>
              {x.premissa && <p className="mq-premissa"><strong>Como chegamos nesse número.</strong> {x.premissa}</p>}
            </li>
          ))}
        </ol>
        {d.bem.length > 0 && (
          <div className="mq-bem">
            <strong>O que você já faz bem</strong>
            <ul>{d.bem.map(b => <li key={b}><Ok />{b} Com a Maia isso passa a acontecer sozinho, todo dia.</li>)}</ul>
          </div>
        )}
        <p className="mq-aviso">Os números são uma estimativa feita só com as suas respostas e com suposições baixas de propósito, escritas embaixo de cada ponto. Não são estatística de mercado.</p>
      </section>

      <section className="mq-bloco mq-oferta" id="oferta">
        <p className="mq-olho">A Maia na sua {q.nome}</p>
        <h2 className="mq-h2">O que vem junto</h2>
        <ul className="mq-lista">
          <li><Ok /><span><b>Atendimento no WhatsApp</b> com o nome da sua {q.nome}, em até 1 minuto, 24 horas por dia.</span></li>
          <li><Ok /><span><b>Retomada de orçamento</b>: chama de novo quem sumiu, no dia seguinte, com 3 dias e com 6 dias.</span></li>
          <li><Ok /><span><b>Recado pra sua base</b> de clientes nas épocas certas.</span></li>
          <li><Ok /><span><b>Anúncios no Facebook e no Instagram</b> criados e acompanhados pela Maia.</span></li>
          <li><Ok /><span><b>Relatório no seu WhatsApp</b>: quantos chamaram, quantos fecharam, quanto o anúncio gastou.</span></li>
          <li><Ok /><span><b>Implantação online</b>, por chamada de vídeo, na mesma semana.</span></li>
        </ul>

        <div className="mq-preco">
          <div><span>1º mês, já com a implantação</span><b>{reais(OFERTA_QUIZ.primeiro_mes)}</b></div>
          <div><span>Depois</span><b>{reais(OFERTA_QUIZ.mensal)}<small> por mês</small></b></div>
          <p>Sem fidelidade: você cancela quando quiser. A verba dos anúncios é à parte, paga por você direto à Meta.</p>
        </div>

        <h3 className="mq-h3">Como é a implantação</h3>
        <ol className="mq-passos">
          <li><b>Você fecha e escolhe o horário.</b> Pelo WhatsApp, com a nossa equipe.</li>
          <li><b>Chamada de vídeo, na mesma semana.</b> A gente conecta o WhatsApp da {q.nome} e a Maia aprende os seus {nicho === 'oficina' ? 'serviços' : 'produtos'}, preços e o seu jeito de atender.</li>
          <li><b>A Maia começa a atender.</b> Você acompanha pelo relatório no seu WhatsApp.</li>
        </ol>

        <div className="mq-acoes">
          <a className="mq-btn" href={linkComecar} target="_blank" rel="noopener" onClick={() => clique('comecar')}><Zap />Quero começar</a>
          <a className="mq-btn mq-btn-sec" href={linkDuvida} target="_blank" rel="noopener" onClick={() => clique('duvida')}>Tirar uma dúvida</a>
        </div>
        <p className="mq-mini">Os dois botões abrem o WhatsApp da Carreira no Digital com o resumo do seu diagnóstico.</p>
      </section>

      <div className="mq-fixo">
        <a className="mq-btn" href={linkComecar} target="_blank" rel="noopener" onClick={() => clique('comecar')}>Quero começar</a>
        <a className="mq-btn mq-btn-sec" href={linkDuvida} target="_blank" rel="noopener" onClick={() => clique('duvida')}>Tirar uma dúvida</a>
      </div>
    </main>
  )
}
