'use client'

// BOTÃO "GRAVAR" (29/10/2026) — um só, usado na ficha da entrega (cada encontro), no detalhe da agenda,
// na turma e solto em /dashboard/gravacoes. Grava o microfone escolhido (ex.: Lark M2 no PC), sobe um
// pedaço a cada 30 s direto pra pasta (se o PC travar, o que já foi gravado não se perde), e no
// "Finalizar" o servidor transcreve e a IA preenche o sistema. Ver lib/gravacoes.ts.
import { useEffect, useRef, useState } from 'react'
import { fetchAuth } from '@/lib/api'

type Props = {
  contextoTipo: 'encontro' | 'agenda' | 'turma' | 'livre'
  contextoId?: string | null
  titulo?: string
  compacto?: boolean          // botão pequeno (na lista de encontros / modal)
  onPronto?: () => void       // quando a IA terminou de aplicar
}

const PEDACO_MS = 30000
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const mmss = (s: number) => `${String(Math.floor(s / 3600)).padStart(1, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

async function api(corpo: any) {
  const r = await fetchAuth('/api/gravacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  return r.json()
}

export default function GravarEncontro({ contextoTipo, contextoId, titulo, compacto, onPronto }: Props) {
  const [fase, setFase] = useState<'parado' | 'escolher' | 'gravando' | 'pausado' | 'enviando' | 'processando' | 'pronto' | 'erro' | 'desligado'>('parado')
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [mic, setMic] = useState('')
  const [seg, setSeg] = useState(0)
  const [nivel, setNivel] = useState(0)
  const [pendentes, setPendentes] = useState(0)
  const [msg, setMsg] = useState('')
  const [ultima, setUltima] = useState<any>(null)
  const ref = useRef<{ rec?: MediaRecorder; stream?: MediaStream; id?: string; seq: number; fila: Promise<void>; t0: number; acumulado: number; ctx?: AudioContext; raf?: number; wake?: any }>({ seq: 0, fila: Promise.resolve(), t0: 0, acumulado: 0 })

  // a última gravação deste encontro/compromisso (pra mostrar o resultado sem gravar de novo)
  useEffect(() => {
    if (!contextoId || contextoTipo === 'livre') return
    fetchAuth(`/api/gravacoes?contexto=${contextoTipo}&contexto_id=${contextoId}`).then(r => r.json()).then(j => {
      if (j?.config && !j.config.ligado) setFase('desligado')
      if (j?.gravacao) { setUltima(j.gravacao); if (j.gravacao.status === 'processando') acompanhar(j.gravacao.id) }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextoId, contextoTipo])

  useEffect(() => () => pararTudo(), [])
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => { if (fase === 'gravando' || fase === 'pausado' || fase === 'enviando') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', aviso); return () => window.removeEventListener('beforeunload', aviso)
  }, [fase])

  async function abrirEscolha() {
    setMsg('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop())
      const lista = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput')
      setMics(lista)
      let salvo = ''; try { salvo = localStorage.getItem('grav-mic') || '' } catch {}
      const lark = lista.find(d => /lark|hollyland|wireless|usb/i.test(d.label))
      setMic(lista.find(d => d.deviceId === salvo)?.deviceId || lark?.deviceId || lista[0]?.deviceId || '')
      setFase('escolher')
    } catch { setMsg('O navegador não deixou usar o microfone. Libera o microfone no cadeado ao lado do endereço.'); setFase('erro') }
  }

  function medir(stream: MediaStream) {
    try {
      const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an)
      const buf = new Uint8Array(an.fftSize); ref.current.ctx = ctx
      const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); setNivel(m / 128); ref.current.raf = requestAnimationFrame(loop) }
      loop()
    } catch {}
  }

  function enviar(blob: Blob) {
    const r = ref.current
    if (!r.id || blob.size < 200) return
    const seq = r.seq++
    setPendentes(p => p + 1)
    r.fila = r.fila.then(async () => {
      for (let t = 1; t <= 4; t++) {
        try {
          const u = await api({ acao: 'url_parte', id: r.id, seq })
          if (!u.ok) throw new Error(u.error)
          const put = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': blob.type || 'audio/webm', 'x-upsert': 'true' }, body: blob })
          if (!put.ok) throw new Error('envio ' + put.status)
          await api({ acao: 'parte_ok', id: r.id, seq })
          break
        } catch (e) { if (t === 4) setMsg('Um pedaço não subiu (internet?). A gravação continua.'); else await new Promise(res => setTimeout(res, 1500 * t)) }
      }
      setPendentes(p => p - 1)
    })
  }

  async function comecar() {
    setMsg('')
    try { localStorage.setItem('grav-mic', mic) } catch {}
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: mic ? { exact: mic } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: true } })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => (window as any).MediaRecorder?.isTypeSupported?.(m)) || ''
      const ini = await api({ acao: 'iniciar', contexto_tipo: contextoTipo, contexto_id: contextoId || null, titulo: titulo || null, mime: mime || 'audio/webm' })
      if (!ini.ok) { stream.getTracks().forEach(t => t.stop()); setMsg(ini.error || 'não consegui começar'); setFase(ini.error?.includes('desligada') ? 'desligado' : 'erro'); return }
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined)
      ref.current = { ...ref.current, rec, stream, id: ini.id, seq: 0, fila: Promise.resolve(), t0: Date.now(), acumulado: 0 }
      rec.ondataavailable = e => enviar(e.data)
      rec.start(PEDACO_MS)
      medir(stream)
      try { ref.current.wake = await (navigator as any).wakeLock?.request('screen') } catch {}
      setSeg(0); setFase('gravando')
    } catch (e: any) { setMsg('Não consegui abrir o microfone: ' + (e?.message || '')); setFase('erro') }
  }

  // relógio
  useEffect(() => {
    if (fase !== 'gravando') return
    const t = setInterval(() => { const r = ref.current; setSeg(Math.round((r.acumulado + (Date.now() - r.t0)) / 1000)) }, 500)
    return () => clearInterval(t)
  }, [fase])

  function pausar() { const r = ref.current; if (r.rec?.state === 'recording') { r.rec.pause(); r.acumulado += Date.now() - r.t0; setFase('pausado') } }
  function continuar() { const r = ref.current; if (r.rec?.state === 'paused') { r.rec.resume(); r.t0 = Date.now(); setFase('gravando') } }

  function pararTudo() {
    const r = ref.current
    try { if (r.raf) cancelAnimationFrame(r.raf); r.ctx?.close() } catch {}
    try { r.stream?.getTracks().forEach(t => t.stop()) } catch {}
    try { r.wake?.release?.() } catch {}
  }

  async function finalizar() {
    const r = ref.current
    if (!r.rec || !r.id) return
    if (r.rec.state === 'recording') r.acumulado += Date.now() - r.t0
    setFase('enviando')
    await new Promise<void>(res => { r.rec!.onstop = () => res(); r.rec!.stop() })
    pararTudo()
    await r.fila
    const f = await api({ acao: 'finalizar', id: r.id, duracao_s: Math.round(r.acumulado / 1000) })
    if (!f.ok) { setMsg(f.error || 'erro ao finalizar'); setFase('erro'); return }
    acompanhar(r.id)
  }

  async function cancelar() {
    const r = ref.current
    try { r.rec && r.rec.state !== 'inactive' && r.rec.stop() } catch {}
    pararTudo()
    if (r.id) await api({ acao: 'descartar', id: r.id }).catch(() => {})
    setFase('parado'); setSeg(0)
  }

  function acompanhar(id: string) {
    setFase('processando')
    const tick = async () => {
      const j = await fetchAuth(`/api/gravacoes?id=${id}`).then(r => r.json()).catch(() => null)
      const g = j?.gravacao
      if (g && ['pronta', 'aplicada'].includes(g.status)) { setUltima(g); setFase('pronto'); onPronto?.(); return }
      if (g?.status === 'erro') { setUltima(g); setMsg(g.erro || 'deu erro'); setFase('erro'); return }
      setTimeout(tick, 5000)
    }
    setTimeout(tick, 4000)
  }

  // ── telas ──
  if (fase === 'desligado') return <a href="/dashboard/gravacoes" style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-faint)', textDecoration: 'none' }}>Gravação desligada</a>

  if (fase === 'parado' || fase === 'erro') return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={abrirEscolha} style={{ ...btn, background: 'var(--red-bg, #3b1520)', color: 'var(--red, #fb7185)' }}>● {compacto ? 'Gravar' : 'Gravar encontro'}</button>
      {ultima && <Resultado g={ultima} compacto />}
      {msg && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>{msg}</span>}
    </span>
  )

  if (fase === 'escolher') return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Microfone:</span>
      <select value={mic} onChange={e => setMic(e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '5px 8px', fontSize: 12, color: 'var(--text)', maxWidth: 260 }}>
        {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microfone'}</option>)}
      </select>
      <button onClick={comecar} style={{ ...btn, background: 'var(--red, #e11d48)', color: '#fff' }}>● Começar a gravar</button>
      <button onClick={() => setFase('parado')} style={{ ...btn, background: 'transparent', color: 'var(--text-faint)' }}>voltar</button>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', width: '100%' }}>Avisa a pessoa que o encontro está sendo gravado pra registro.</span>
    </div>
  )

  if (fase === 'gravando' || fase === 'pausado' || fase === 'enviando') return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-2)', border: '1px solid var(--red, #e11d48)', borderRadius: 10, padding: '8px 10px' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: fase === 'gravando' ? 'var(--red, #e11d48)' : 'var(--text-faint)', boxShadow: fase === 'gravando' ? '0 0 0 4px rgba(225,29,72,.25)' : 'none' }} />
      <b style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{mmss(seg)}</b>
      <span style={{ width: 60, height: 6, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${Math.min(100, nivel * 160)}%`, background: 'var(--green)' }} /></span>
      {fase === 'gravando' && <button onClick={pausar} style={{ ...btn, background: 'var(--surface)', color: 'var(--text-2)' }}>Pausar</button>}
      {fase === 'pausado' && <button onClick={continuar} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Continuar</button>}
      {fase !== 'enviando'
        ? <button onClick={finalizar} style={{ ...btn, background: 'var(--green-bg)', color: 'var(--green)' }}>■ Finalizar</button>
        : <span style={{ fontSize: 12, color: 'var(--text-2)' }}>enviando os últimos pedaços…</span>}
      {fase !== 'enviando' && <button onClick={cancelar} style={{ ...btn, background: 'transparent', color: 'var(--text-faint)' }}>descartar</button>}
      {pendentes > 0 && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>subindo {pendentes}…</span>}
      {msg && <span style={{ fontSize: 11.5, color: 'var(--amber)' }}>{msg}</span>}
    </div>
  )

  if (fase === 'processando') return <span style={{ fontSize: 12, color: 'var(--accent-soft)', background: 'var(--surface-2)', borderRadius: 8, padding: '6px 10px' }}>⏳ A IA está ouvindo e preenchendo… (1 a 3 min)</span>

  return <Resultado g={ultima} />
}

function Resultado({ g, compacto }: { g: any; compacto?: boolean }) {
  const [aberto, setAberto] = useState(!compacto)
  if (!g) return null
  const a = g.analise || {}, ap = g.aplicado || {}
  if (compacto && !aberto) return <button onClick={() => setAberto(true)} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{g.status === 'erro' ? '⚠️ gravação com erro' : g.status === 'processando' ? '⏳ processando' : '🎙️ ver o que a IA fez'}</button>
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>🎙️ {a.titulo || g.titulo || 'Gravação'}</b>{compacto && <button onClick={() => setAberto(false)} style={{ ...btn, padding: '2px 8px', background: 'transparent', color: 'var(--text-faint)' }}>fechar</button>}</div>
      {a.resumo && <p style={{ margin: '6px 0', color: 'var(--text-2)' }}>{a.resumo}</p>}
      {(ap.itens || []).length > 0 && <div style={{ color: 'var(--green)' }}>{ap.itens.map((t: string, i: number) => <div key={i}>✓ {t}</div>)}</div>}
      {(ap.avisos || []).length > 0 && <div style={{ color: 'var(--amber)', marginTop: 4 }}>{ap.avisos.map((t: string, i: number) => <div key={i}>! {t}</div>)}</div>}
      {g.status === 'pronta' && <div style={{ color: 'var(--amber)', marginTop: 4 }}>Pronta pra revisar e aplicar em <a href={`/dashboard/gravacoes?g=${g.id}`} style={{ color: 'var(--accent-soft)' }}>Gravações</a>.</div>}
      <a href={`/dashboard/gravacoes?g=${g.id}`} style={{ display: 'inline-block', marginTop: 6, color: 'var(--accent-soft)', fontSize: 12 }}>ver tudo (mensagem pro cliente, ideias de conteúdo, transcrição) →</a>
    </div>
  )
}
