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
    track('resultado_visto', { oportunidade_mes: d.oportunidade_mes, na_mesa_mes: d.na_mesa_mes, ganho_mes: d.ganho.valor_mes })

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
          <li><Ok />Quanto isso custa por mês e quanto dá pra ganhar a mais com anúncio, com a conta à mostra</li>
          <li><Ok />O que a Maia faz em cada ponto, do anúncio ao relatório</li>
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
  const g = d.ganho
  const P = PRODUTO[nicho]
  const [u1, uN] = q.unidade
  const un = (n: number) => (n < 2 ? u1 : uN)
  const pctMesa = d.oportunidade_mes > 0 ? Math.max(6, Math.round((d.na_mesa_mes / d.oportunidade_mes) * 100)) : 50
  const unMes = Math.floor(d.unidades_mes * 10) / 10
  const coisa = nicho === 'oficina' ? 'serviço' : 'óculos'
  return (
    <main className={`mq-res mq-${nicho}`}>
      <header className="mq-cab"><Topo /></header>

      <section className="mq-bloco">
        <p className="mq-olho">Diagnóstico pronto</p>
        <h1>Diagnóstico da {d.negocio}</h1>
        <p className="mq-sub">Com as suas respostas: o que a sua {q.nome} deixa na mesa hoje, o que dá pra ganhar a mais com anúncio, e o que a Maia faz em cada ponto.</p>

        <div className="mq-total">
          <span>Oportunidade por mês, somando os dois lados</span>
          <b>{reais(d.oportunidade_mes)}<small> por mês</small></b>
          <div className="mq-total-linha">
            <div><strong>{reais(d.oportunidade_ano)}</strong><em>em 12 meses</em></div>
            <div><strong>{num(unMes)} {un(unMes)}</strong><em>a mais por mês</em></div>
          </div>
          <div className="mq-barra2" aria-hidden="true"><i style={{ width: `${pctMesa}%` }} /><b /></div>
          <ul className="mq-legenda">
            <li><i className="l1" />Na mesa hoje <strong>{reais(d.na_mesa_mes)}</strong></li>
            <li><i className="l2" />A ganhar com anúncio <strong>{reais(g.valor_mes)}</strong></li>
          </ul>
        </div>

        <div className="mq-paga">
          <b>{d.pagam_maia} {d.pagam_maia === 1 ? u1 : uN}</b>
          <span>por mês {d.pagam_maia === 1 ? 'paga' : 'pagam'} a Maia. Com o seu valor médio de {reais(d.ticket)}, {d.pagam_maia === 1 ? `um ${coisa}` : `${d.pagam_maia} ${nicho === 'oficina' ? 'serviços' : 'óculos'}`} a mais por mês {d.pagam_maia === 1 ? 'cobre' : 'cobrem'} a mensalidade de {reais(OFERTA_QUIZ.mensal)}.</span>
        </div>
      </section>

      <section className="mq-bloco">
        <div className="mq-lado"><span className="mq-tag t1">Lado 1</span><h2 className="mq-h2">O que fica na mesa hoje</h2><p className="mq-lado-tot">{reais(d.na_mesa_mes)} por mês · {reais(d.na_mesa_ano)} em 12 meses</p></div>
        <ol className="mq-pontos">
          {d.pontos.map((x, i) => (
            <li key={x.id} className="mq-ponto">
              <div className="mq-ponto-cab"><span className="mq-n">{i + 1}</span><h3>{x.titulo}</h3></div>
              <div className="mq-stats">
                <div><b>{reais(x.valor_mes)}</b><span>por mês</span></div>
                <div><b>{reais(x.valor_mes * 12)}</b><span>em 12 meses</span></div>
                <div><b>{qtdCurta(x.unidades_mes, u1, uN)}</b><span>{x.unidades_mes < 1 ? 'por ano' : 'por mês'}</span></div>
              </div>
              <p>{x.onde_perde}</p>
              <div className="mq-maia"><strong>O que a Maia faz</strong><p>{x.maia_faz}</p></div>
              <p className="mq-premissa"><strong>Como chegamos nesse número.</strong> {x.premissa}</p>
            </li>
          ))}
        </ol>
        {d.bem.length > 0 && (
          <div className="mq-bem">
            <strong>O que você já faz bem</strong>
            <ul>{d.bem.map(b => <li key={b}><Ok /><span>{b} Com a Maia isso acontece sozinho, todo dia.</span></li>)}</ul>
          </div>
        )}
      </section>

      <section className="mq-bloco">
        <div className="mq-lado"><span className="mq-tag t2">Lado 2</span><h2 className="mq-h2">O que dá pra ganhar a mais com anúncio</h2><p className="mq-lado-tot">{reais(g.valor_mes)} por mês · {reais(g.valor_ano)} em 12 meses</p></div>
        <div className="mq-ponto mq-ganho">
          <div className="mq-ponto-cab"><span className="mq-n">+</span><h3>{g.titulo}</h3></div>
          <div className="mq-funil">
            <div><span>{g.verba_sugerida ? 'Verba sugerida' : 'Sua verba'}</span><b>{reais(g.verba)}</b><em>por mês</em></div>
            <div><span>Conversas</span><b>{g.conversas}</b><em>no WhatsApp</em></div>
            <div><span>{nicho === 'oficina' ? 'Carros' : 'Óculos'} {g.modo === 'novo' ? 'novos' : 'a mais'}</span><b>{qtdCurta(g.unidades_mes, u1, uN)}</b><em>{g.unidades_mes < 1 ? 'por ano' : 'por mês'}</em></div>
            <div className="dest"><span>Em {nicho === 'oficina' ? 'serviço' : 'vendas'}</span><b>{reais(g.valor_mes)}</b><em>por mês</em></div>
          </div>
          <p className="mq-retorno">A cada <b>R$ 1</b> de anúncio, cerca de <b>{reaisCent(g.retorno)}</b> em {nicho === 'oficina' ? 'serviço' : 'vendas'}{g.modo === 'otimizar' ? ', com a Maia cuidando da verba que você já investe' : ''}.</p>
          <p>{g.contexto}</p>
          <p className="mq-premissa"><strong>Como chegamos nesse número.</strong> {g.premissa}</p>
        </div>

        <div className="mq-medicao">
          <strong className="mq-medicao-t">Por que o anúncio rende: a Maia mede cada venda de ponta a ponta</strong>
          <ol className="mq-trilha" aria-label="Do anúncio à venda">
            <li>Anúncio</li><li>Conversa</li><li>Orçamento</li><li>{nicho === 'oficina' ? 'Serviço' : 'Venda'}</li>
          </ol>
          <ul className="mq-lista">
            <li><Ok /><span>Liga cada venda ao anúncio que trouxe o cliente: sabe qual anúncio vende e qual só traz curioso.</span></li>
            <li><Ok /><span>Corta o que não vende e cria anúncios novos no estilo do que vende, com ângulos diferentes.</span></li>
            <li><Ok /><span>Revisa a estratégia a cada 15 dias, olhando a época do ano {nicho === 'oficina' ? 'da oficina' : 'da ótica'}.</span></li>
            <li><Ok /><span>Mede o custo de cada conversa e de cada {nicho === 'oficina' ? 'serviço fechado' : 'venda'}, e mostra isso no seu WhatsApp.</span></li>
          </ul>
        </div>
        <p className="mq-aviso">Os números são uma estimativa feita só com as suas respostas e com as premissas escritas embaixo de cada ponto. Não são estatística de mercado nem garantia de resultado.</p>
      </section>

      <section className="mq-bloco mq-produto">
        <p className="mq-olho">O que é a Maia</p>
        <h2 className="mq-h2">Uma agência de marketing inteira numa IA, feita pra {q.nome}</h2>
        <p className="mq-sub">Tudo isso vem todo mês, sem reunião e sem você precisar entender de marketing.</p>
        <div className="mq-cards">
          {P.map(c => (
            <article key={c.t} className="mq-card">
              <span className="mq-card-tag">{c.tag}</span>
              <h3>{c.t}</h3>
              <ul>{c.itens.map(i => <li key={i}><Ok /><span>{i}</span></li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mq-bloco mq-oferta" id="oferta">
        <p className="mq-olho">Pra começar</p>
        <h2 className="mq-h2">Quanto custa</h2>
        <div className="mq-preco">
          <div><span>1º mês, já com a implantação</span><b>{reais(OFERTA_QUIZ.primeiro_mes)}</b></div>
          <div><span>Depois</span><b>{reais(OFERTA_QUIZ.mensal)}<small> por mês</small></b></div>
          <p>Sem fidelidade: você cancela quando quiser. A verba dos anúncios é à parte, paga por você direto à Meta. Pela sua conta, {d.pagam_maia} {d.pagam_maia === 1 ? u1 : uN} a mais por mês já {d.pagam_maia === 1 ? 'paga' : 'pagam'} a mensalidade.</p>
        </div>

        <h3 className="mq-h3">Como é a implantação</h3>
        <ol className="mq-passos">
          <li><b>Você fecha e escolhe o horário.</b> Pelo WhatsApp, com a nossa equipe.</li>
          <li><b>Chamada de vídeo, na mesma semana.</b> A gente conecta o WhatsApp da {q.nome} e a Maia aprende os seus {nicho === 'oficina' ? 'serviços' : 'produtos'}, preços e o seu jeito de atender.</li>
          <li><b>A Maia começa a trabalhar.</b> Você aprova os anúncios pelo celular e acompanha tudo pelo seu WhatsApp.</li>
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

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const reaisCent = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
function qtdCurta(u: number, u1: string, uN: string) {
  if (u < 1) { const a = Math.max(1, Math.floor(u * 12)); return `${a} ${a === 1 ? u1 : uN}` }
  const m = Math.floor(u * 10) / 10
  return `${num(m)} ${m < 2 ? u1 : uN}`
}

// A oferta inteira, adaptada ao nicho (vem todo mês). Sem posts no Instagram: o código só fala de posts no plano
// de R$ 997 (lib/maia/oferta.ts); não está confirmado que o plano online inclui o orgânico.
const PRODUTO: Record<Nicho, { tag: string; t: string; itens: string[] }[]> = {
  oficina: [
    { tag: 'Estratégia', t: 'Sabe o que anunciar e quando', itens: [
      'Escolhe o que anunciar primeiro: o serviço com margem e com procura na sua cidade.',
      'Monta o calendário do ano da oficina: antes das férias de julho e de fim de ano, época de chuva, Dia dos Pais.',
      'Revisa a estratégia a cada 15 dias, olhando a época e o que está vendendo.',
    ] },
    { tag: 'Criação', t: 'Cria os anúncios', itens: [
      'Cerca de 6 anúncios em vídeo e 6 em imagem por mês.',
      'Com fotos e vídeos reais da sua oficina, nada de imagem genérica.',
      'Gancho pro motorista da sua cidade e região. Quando um anúncio vende, cria outros no mesmo estilo, com ângulos novos.',
    ] },
    { tag: 'Tráfego', t: 'Roda as campanhas', itens: [
      'Cria e roda as campanhas no Facebook e no Instagram, pra sua cidade e região.',
      'Só Facebook e Instagram, onde o seu cliente está.',
      'Mede o custo de cada conversa e de cada serviço fechado.',
    ] },
    { tag: 'Atendimento', t: 'Atende e não deixa esfriar', itens: [
      'Responde o WhatsApp com o nome da oficina em até 1 minuto, 24 horas por dia.',
      'Pergunta o modelo e o ano do carro e o que está acontecendo, e passa pra você o que precisa da sua mão.',
      'Chama de novo quem pediu orçamento e sumiu (1, 3 e 6 dias) e manda recado pra sua base na hora da revisão.',
    ] },
    { tag: 'Medição', t: 'Mede de ponta a ponta e te conta', itens: [
      'Liga cada serviço fechado ao anúncio que trouxe o cliente.',
      'Análise curta a cada 2 dias no seu WhatsApp.',
      'Relatório completo todo dia 2: conversas, anúncios, o que funcionou e a projeção do mês.',
    ] },
    { tag: 'Você no comando', t: 'Tudo pelo celular', itens: [
      'Você aprova os anúncios pelo celular, sem reunião.',
      'Quer mudar algo? Pede pro WhatsApp da Maia, quando quiser.',
    ] },
  ],
  otica: [
    { tag: 'Estratégia', t: 'Sabe o que anunciar e quando', itens: [
      'Escolhe o que anunciar primeiro: o produto com margem e com procura na sua cidade.',
      'Monta o calendário do ano da ótica: volta às aulas, Dia das Mães, Dia dos Pais, Black Friday, fim de ano.',
      'Revisa a estratégia a cada 15 dias, olhando a época e o que está vendendo.',
    ] },
    { tag: 'Criação', t: 'Cria os anúncios', itens: [
      'Cerca de 6 anúncios em vídeo e 6 em imagem por mês.',
      'Com fotos e vídeos reais da sua loja e das suas armações, nada de imagem genérica.',
      'Gancho pro público da sua cidade. Quando um anúncio vende, cria outros no mesmo estilo, com ângulos novos.',
    ] },
    { tag: 'Tráfego', t: 'Roda as campanhas', itens: [
      'Cria e roda as campanhas no Facebook e no Instagram, pra sua cidade e região.',
      'Só Facebook e Instagram, onde o seu cliente está.',
      'Mede o custo de cada conversa e de cada venda.',
    ] },
    { tag: 'Atendimento', t: 'Atende e não deixa esfriar', itens: [
      'Responde o WhatsApp com o nome da ótica em até 1 minuto, 24 horas por dia.',
      'Pergunta o que a pessoa procura (armação, lente, óculos de sol) e se já tem a receita, e passa pra você o que precisa da sua mão.',
      'Chama de novo quem pediu orçamento e sumiu (1, 3 e 6 dias) e manda recado pra sua base quando os óculos fazem 1 ano.',
    ] },
    { tag: 'Medição', t: 'Mede de ponta a ponta e te conta', itens: [
      'Liga cada venda ao anúncio que trouxe o cliente.',
      'Análise curta a cada 2 dias no seu WhatsApp.',
      'Relatório completo todo dia 2: conversas, anúncios, o que funcionou e a projeção do mês.',
    ] },
    { tag: 'Você no comando', t: 'Tudo pelo celular', itens: [
      'Você aprova os anúncios pelo celular, sem reunião.',
      'Quer mudar algo? Pede pro WhatsApp da Maia, quando quiser.',
    ] },
  ],
}
