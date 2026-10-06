'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PERGUNTAS, NICHOS, type Pergunta } from '@/lib/checkup/perguntas'

// Check-up de IA (público). Uma pergunta por tela; escolha única avança sozinha. O progresso fica
// guardado no aparelho (se fechar, volta de onde parou). No fim: nome + WhatsApp -> /api/checkup.
const CHAVE = 'checkup_v1'
const FRASES = ['Lendo as tuas respostas', 'Comparando com negócios do teu setor', 'Calculando as horas que a IA pode assumir', 'Estimando o faturamento que está ficando na mesa', 'Escrevendo o teu diagnóstico']

const Marca = () => <span className="marca"><span className="teu">teu</span><span className="neg">negócio</span><i>OS</i></span>

export default function Checkup() {
  const router = useRouter()
  const [r, setR] = useState<Record<string, any>>({})
  const [passo, setPasso] = useState<number>(-1)          // -1 abertura · 0..n-1 perguntas · n contato
  const [nome, setNome] = useState('')
  const [whats, setWhats] = useState('')
  const [aceite, setAceite] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [frase, setFrase] = useState(0)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const carregou = useRef(false)

  const visiveis = useMemo(() => PERGUNTAS.filter(p => !p.se || p.se(r)), [r])
  const total = visiveis.length + 1
  const p: Pergunta | undefined = visiveis[passo]

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE) || 'null')
      if (s && s.r) { setR(s.r); setPasso(typeof s.passo === 'number' ? s.passo : -1); setNome(s.nome || ''); setWhats(s.whats || '') }
    } catch { /* sem armazenamento: começa do zero */ }
    carregou.current = true
  }, [])
  useEffect(() => {
    if (!carregou.current || enviando) return
    try { localStorage.setItem(CHAVE, JSON.stringify({ r, passo, nome, whats })) } catch { /* ok */ }
  }, [r, passo, nome, whats, enviando])
  useEffect(() => {
    if (!enviando) return
    const t = setInterval(() => setFrase(f => Math.min(f + 1, FRASES.length - 1)), 4500)
    return () => clearInterval(t)
  }, [enviando])
  useEffect(() => { window.scrollTo(0, 0); setBusca('') }, [passo])

  const avanca = () => setPasso(x => Math.min(x + 1, visiveis.length))
  const volta = () => setPasso(x => Math.max(x - 1, -1))
  const escolhe = (id: string, v: any, auto = true) => {
    setR(prev => ({ ...prev, [id]: v }))
    if (auto) setTimeout(avanca, 170)
  }

  async function enviar() {
    setErro('')
    const dig = whats.replace(/\D/g, '')
    if (nome.trim().length < 2) return setErro('Escreve o teu nome.')
    if (dig.length < 10 || dig.length > 13) return setErro('Confere o WhatsApp: DDD e número.')
    if (!aceite) return setErro('Marca o aceite pra gente te mandar o diagnóstico.')
    setEnviando(true); setFrase(0)
    const sp = new URLSearchParams(window.location.search)
    const fbp = document.cookie.split('; ').find(c => c.startsWith('_fbp='))?.slice(5) || null
    try {
      const res = await fetch('/api/checkup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, whatsapp: dig, respostas: r, pagina: window.location.href, fbp, fbclid: sp.get('fbclid'), utm_source: sp.get('utm_source'), utm_medium: sp.get('utm_medium'), utm_campaign: sp.get('utm_campaign'), utm_content: sp.get('utm_content') }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.codigo) throw new Error(j.erro || 'Não deu certo agora. Tenta de novo.')
      try { localStorage.removeItem(CHAVE) } catch { /* ok */ }
      router.push(`/checkup/r/${j.codigo}`)
    } catch (e: any) {
      setEnviando(false); setErro(e.message || 'Não deu certo agora. Tenta de novo.')
    }
  }

  if (enviando) return (
    <main className="ck-wiz">
      <div className="ck-topo"><Marca /></div>
      <div className="ck-analisa" role="status" aria-live="polite">
        <div className="ck-radar"><span /></div>
        <h1 className="ck-h">Analisando o teu negócio</h1>
        <p>{FRASES[frase]}...</p>
        <p style={{ fontSize: 13, color: 'var(--fraco)' }}>Leva uns 30 segundos. Não fecha a página.</p>
      </div>
    </main>
  )

  if (passo === -1) return (
    <main className="ck-wiz">
      <div className="ck-topo"><Marca /></div>
      <section className="ck-abre">
        <p className="ck-eyebrow">Check-up de IA · grátis</p>
        <h1>Quanto a IA pode fazer <em>pelo teu negócio?</em></h1>
        <p>Responde umas perguntas rápidas, quase tudo de tocar. No fim tu recebe um diagnóstico feito pro teu tipo de negócio.</p>
        <ul className="ck-ganhos">
          <li><b>◷</b>Quantas horas por semana dá pra tirar das tuas costas</li>
          <li><b>↗</b>Quanto faturamento está ficando na mesa</li>
          <li><b>✓</b>O que automatizar primeiro, e o que tu já faz hoje de graça</li>
        </ul>
        <button className="ck-btn" onClick={() => setPasso(0)}>{Object.keys(r).length ? 'Continuar de onde parei' : 'Começar o check-up'}</button>
        <p className="ck-mini">Leva uns 5 minutos.</p>
      </section>
    </main>
  )

  const naContato = passo >= visiveis.length
  const valor = p ? r[p.id] : undefined
  const pronto = !p ? true
    : p.tipo === 'texto' ? String(valor || '').trim().length >= 2
    : p.tipo === 'numero' ? Number(String(valor || '').replace(/\D/g, '')) > 0
    : p.tipo === 'multipla' ? Array.isArray(valor) && valor.length > 0
    : valor != null && valor !== ''

  return (
    <main className="ck-wiz">
      <div className="ck-topo">
        <button className="ck-voltar" onClick={volta} aria-label="Voltar">←</button>
        <div className="ck-barra" aria-hidden><b style={{ width: `${Math.round(((passo + 1) / total) * 100)}%` }} /></div>
        <span className="ck-passo">{Math.min(passo + 1, total)}/{total}</span>
      </div>

      {naContato ? (
        <section className="ck-corpo" key="contato">
          <p className="ck-eyebrow">Pronto</p>
          <h1 className="ck-h">Pra onde a gente manda o teu diagnóstico?</h1>
          <p className="ck-ajuda">Ele abre aqui na hora. O especialista também pode te chamar no WhatsApp pra explicar os números.</p>
          <label className="ck-campo"><span>Teu nome</span><input className="ck-in" value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" placeholder="Nome" /></label>
          <label className="ck-campo"><span>WhatsApp com DDD</span><input className="ck-in" value={whats} onChange={e => setWhats(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(51) 99999-9999" /></label>
          <label className="ck-aceite"><input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} />Aceito receber o diagnóstico e o contato do especialista do teunegócio OS no WhatsApp.</label>
          {erro && <p className="ck-erro" role="alert">{erro}</p>}
          <div className="ck-rodape"><button className="ck-btn" onClick={enviar}>Ver meu diagnóstico</button></div>
        </section>
      ) : p && (
        <section className="ck-corpo" key={p.id}>
          <h1 className="ck-h">{p.texto}</h1>
          {p.ajuda && <p className="ck-ajuda">{p.ajuda}</p>}

          {p.tipo === 'nicho' && <>
            <input className="ck-busca" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procura aqui (ex.: salão, ótica)" aria-label="Procurar tipo de negócio" />
            <div className="ck-ops ck-nichos">
              {NICHOS.filter(n => !busca || n[0] === 'outro' || n[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(busca.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))).map(n => (
                <button key={n[0]} className="ck-op" aria-pressed={valor === n[0]} onClick={() => escolhe('nicho', n[0])}>{n[1]}</button>
              ))}
            </div>
          </>}

          {p.tipo === 'escolha' && <div className="ck-ops">
            {p.opcoes!.map(o => <button key={o[0]} className="ck-op" aria-pressed={valor === o[0]} onClick={() => escolhe(p.id, o[0])}>{o[1]}</button>)}
          </div>}

          {p.tipo === 'escala' && <>
            <div className="ck-escala">
              {Array.from({ length: 11 }, (_, i) => <button key={i} className="ck-op" aria-pressed={valor === i} onClick={() => escolhe(p.id, i)}>{i}</button>)}
            </div>
            <div className="ck-escala-leg"><span>nenhum</span><span>todos</span></div>
          </>}

          {p.tipo === 'multipla' && <div className="ck-ops">
            {p.opcoes!.map(o => {
              const lista: string[] = Array.isArray(valor) ? valor : []
              const on = lista.includes(o[0])
              return <button key={o[0]} className="ck-op" aria-pressed={on} onClick={() => escolhe(p.id, on ? lista.filter(x => x !== o[0]) : [...lista, o[0]], false)}><span className="ck-check">{on ? '✓' : ''}</span>{o[1]}</button>
            })}
          </div>}

          {p.tipo === 'texto' && (p.id === 'cidade'
            ? <input className="ck-in" autoFocus value={valor || ''} onChange={e => escolhe(p.id, e.target.value, false)} placeholder={p.placeholder} onKeyDown={e => { if (e.key === 'Enter' && pronto) avanca() }} />
            : <textarea className="ck-in" autoFocus value={valor || ''} onChange={e => escolhe(p.id, e.target.value, false)} placeholder={p.placeholder} maxLength={300} />)}

          {p.tipo === 'numero' && <input className="ck-in" autoFocus inputMode="numeric" value={valor || ''} placeholder={p.placeholder}
            onChange={e => { const d = e.target.value.replace(/\D/g, ''); escolhe(p.id, d ? 'R$ ' + Number(d).toLocaleString('pt-BR') : '', false) }}
            onKeyDown={e => { if (e.key === 'Enter' && pronto) avanca() }} />}

          {['texto', 'numero', 'multipla'].includes(p.tipo) && <div className="ck-rodape"><button className="ck-btn" disabled={!pronto} onClick={avanca}>Continuar</button></div>}
        </section>
      )}
    </main>
  )
}
