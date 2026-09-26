'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// A CHAMADA. Uma página só pros dois lados: o lead abre /call/<codigo>; quem convidou abre
// com ?h=<chave>. WebRTC ponto a ponto (voz, vídeo opcional), sinalização pelo Realtime do
// Supabase, sem servidor de mídia e sem assinatura. Quem convidou grava a conversa no próprio
// navegador (os dois lados misturados) em pedaços de 30s que sobem pro Storage; no fim o
// sistema junta, transcreve e joga no histórico do lead.
//
// A REGRA DA NEGOCIAÇÃO: quem convidou (host) sempre faz a oferta. Cada lado, ao entrar,
// ganha um número de sessão e o anuncia ("pronto"). Se o host recebe um "pronto" de uma sessão
// que não é a que está conectada, ele descarta a conexão velha e negocia do zero. Sem isso, o
// lado que entrou primeiro ficava com o resto de uma tentativa anterior e nunca reofertava:
// "quem entra antes consegue, quem entra depois não".

// Servidores ICE vêm de /api/chamadas/ice (TURN da Cloudflare com credencial temporária quando
// configurado; senão STUN do Google + Open Relay). Esta lista é só o reserva se a rota falhar.
const ICE_RESERVA: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' },
]

type Sinal = { t: 'pronto' | 'offer' | 'answer' | 'ice' | 'sair'; de: 'host' | 'lead'; sess: string; sdp?: any; cand?: any }
type Fase = 'carregando' | 'invalida' | 'antes' | 'conectando' | 'conectado' | 'encerrada' | 'erro'

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const log = (...a: any[]) => console.log('[call]', ...a)

// o navegador diz o motivo pelo nome do erro; traduzido pra quem está do outro lado da tela
function motivoMidia(e: any) {
  const n = e?.name || ''
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'permissão negada no navegador. Clica no cadeado ao lado do endereço, libera microfone e câmera e recarrega'
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return 'nenhum dispositivo encontrado. Confere se está conectado'
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'o dispositivo não respondeu ou está em uso por outro programa (OBS, Zoom, Teams, NDI). Fecha ele e tenta de novo'
  if (n === 'OverconstrainedError') return 'o dispositivo não aceitou a configuração pedida'
  return n || 'erro desconhecido'
}

// escolhe uma câmera de verdade: ignora NDI, OBS e outras virtuais; sem rótulo (antes da permissão), fica no padrão
async function cameraFisica(): Promise<MediaTrackConstraints> {
  const base: MediaTrackConstraints = { facingMode: 'user', width: { ideal: 640 } }
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
    const fisica = cams.find(d => d.label && !/ndi|obs|virtual|snap|xsplit|manycam|droidcam|camo/i.test(d.label))
    return fisica ? { ...base, deviceId: { exact: fisica.deviceId } } : base
  } catch { return base }
}

export default function Chamada({ params }: { params: Promise<{ codigo: string }> }) {
  const [codigo, setCodigo] = useState('')
  const [h, setH] = useState('')
  const [info, setInfo] = useState<any>(null)
  const [fase, setFase] = useState<Fase>('carregando')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [comVideo, setComVideo] = useState(false)
  const [temVideoLocal, setTemVideoLocal] = useState(false)
  const [temVideoRemoto, setTemVideoRemoto] = useState(false)
  const [mudo, setMudo] = useState(false)
  const [seg, setSeg] = useState(0)
  const [outroEntrou, setOutroEntrou] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [nivelLocal, setNivelLocal] = useState(0)     // 0 a 1: o que o meu microfone capta
  const [nivelRemoto, setNivelRemoto] = useState(0)   // 0 a 1: o que chega do outro lado
  const [somBloqueado, setSomBloqueado] = useState(false)  // o navegador (celular) barrou o áudio até um toque
  const medidor = useRef<any>(null)

  const pc = useRef<RTCPeerConnection | null>(null)
  const canal = useRef<any>(null)
  const local = useRef<MediaStream | null>(null)
  const remoto = useRef<MediaStream | null>(null)   // criado só ao entrar: no servidor não existe MediaStream
  const vLocal = useRef<HTMLVideoElement>(null)
  const vRemoto = useRef<HTMLVideoElement>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const dest = useRef<MediaStreamAudioDestinationNode | null>(null)
  const ice = useRef<RTCIceServer[]>(ICE_RESERVA)
  const fila = useRef<any[]>([])
  const timer = useRef<any>(null)
  const pronto = useRef<any>(null)
  const papel = useRef<'host' | 'lead'>('lead')
  const sessao = useRef('')          // a minha sessão nesta entrada
  const sessaoRemota = useRef('')    // a sessão do outro lado com quem estou (ou estava) negociando
  const encerrouEu = useRef(false)

  useEffect(() => {
    params.then(async ({ codigo }) => {
      const chave = new URLSearchParams(window.location.search).get('h') || ''
      setCodigo(codigo); setH(chave)
      const j = await fetch(`/api/chamadas/${codigo}${chave ? `?h=${encodeURIComponent(chave)}` : ''}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      if (!j?.ok) { setFase('invalida'); return }
      setInfo(j); papel.current = j.host ? 'host' : 'lead'; setComVideo(!!j.com_video)
      document.title = `Chamada · ${j.empresa}`
      setFase(j.status === 'encerrada' || j.status === 'transcrita' ? 'encerrada' : 'antes')
    })
    return () => { desligar(false) }
  }, [])

  const enviar = (s: Omit<Sinal, 'sess' | 'de'>) => canal.current?.send({ type: 'broadcast', event: 'sinal', payload: { ...s, de: papel.current, sess: sessao.current } })
  const post = (body: any) => fetch(`/api/chamadas/${codigo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, h }) }).catch(() => null)

  // ── a conexão: criada ao entrar e RECRIADA sempre que o outro lado chega com sessão nova
  function novoPc(): RTCPeerConnection {
    if (pc.current) { try { pc.current.onconnectionstatechange = null; pc.current.ontrack = null; pc.current.onicecandidate = null; pc.current.close() } catch { /* já fechada */ } }
    fila.current = []
    remoto.current = new MediaStream(); setTemVideoRemoto(false)
    if (vRemoto.current) vRemoto.current.srcObject = remoto.current
    const p = new RTCPeerConnection({ iceServers: ice.current })
    pc.current = p
    local.current?.getTracks().forEach(t => p.addTrack(t, local.current!))
    p.ontrack = e => {
      remoto.current?.addTrack(e.track)
      if (e.track.kind === 'video') setTemVideoRemoto(true)
      if (vRemoto.current && remoto.current) { vRemoto.current.srcObject = remoto.current; vRemoto.current.play().then(() => setSomBloqueado(false)).catch(() => setSomBloqueado(true)) }
      if (papel.current === 'host' && e.track.kind === 'audio') misturarNaGravacao(e.track)
      if (e.track.kind === 'audio') medirAudio()
    }
    p.onicecandidate = e => { if (e.candidate) enviar({ t: 'ice', cand: e.candidate.toJSON() }) }
    p.onconnectionstatechange = () => {
      log('estado', p.connectionState)
      if (p.connectionState === 'connected') {
        setFase('conectado'); setOutroEntrou(true); setErro(''); setAviso('')
        if (!timer.current) timer.current = setInterval(() => setSeg(s => s + 1), 1000)
        post({ acao: 'entrou' })
        if (papel.current === 'host') iniciarGravacao()
        medirAudio()
      }
      // caiu: volta a "esperando" e fica pronto pra renegociar quando o outro voltar
      if (p.connectionState === 'failed' || p.connectionState === 'disconnected') {
        setAviso('A conexão com o outro lado caiu. Quando ele voltar, reconecta sozinho.')
        setOutroEntrou(false)
        if (papel.current === 'lead') { clearInterval(pronto.current); pronto.current = setInterval(() => enviar({ t: 'pronto' }), 3000) }
      }
    }
    return p
  }

  async function entrar() {
    setFase('conectando'); setErro(''); setAviso('')
    // câmera é opcional: se ela falhar (em uso por outro programa, bloqueada), entra só com voz e avisa.
    // Microfone é obrigatório, e o erro diz o motivo de verdade.
    const audio = { echoCancellation: true, noiseSuppression: true }
    let usouVideo = comVideo
    try {
      if (comVideo) {
        const video = await cameraFisica()
        try { local.current = await navigator.mediaDevices.getUserMedia({ audio, video }) }
        catch (e: any) { usouVideo = false; setComVideo(false); setAviso(`Câmera indisponível (${motivoMidia(e)}). Entrando só com voz.`); local.current = await navigator.mediaDevices.getUserMedia({ audio, video: false }) }
      } else local.current = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    } catch (e: any) { setFase('erro'); setErro(`Não consegui acessar o microfone: ${motivoMidia(e)}.`); return }
    setTemVideoLocal(usouVideo)
    if (vLocal.current) { vLocal.current.srcObject = local.current; vLocal.current.muted = true }

    sessao.current = Math.random().toString(36).slice(2, 10)
    try { const j = await fetch('/api/chamadas/ice', { cache: 'no-store' }).then(r => r.json()); if (j?.iceServers?.length) { ice.current = j.iceServers; log('ice', j.origem) } } catch { /* fica o reserva */ }
    novoPc()

    // sinalização: um canal por chamada, os dois lados ouvem
    const c = supabase.channel(`chamada:${codigo}`, { config: { broadcast: { self: false } } })
    canal.current = c
    c.on('broadcast', { event: 'sinal' }, ({ payload }: { payload: Sinal }) => tratar(payload))
    c.subscribe((st: string) => {
      log('canal', st)
      if (st !== 'SUBSCRIBED') return
      enviar({ t: 'pronto' })
      // o lead avisa que está pronto até estar conectado; o host responde ofertando
      if (papel.current === 'lead') { clearInterval(pronto.current); pronto.current = setInterval(() => { if (pc.current?.connectionState !== 'connected') enviar({ t: 'pronto' }); else clearInterval(pronto.current) }, 3000) }
    })
  }

  async function tratar(s: Sinal) {
    if (!pc.current || s.de === papel.current) return
    try {
      if (s.t === 'pronto') {
        setOutroEntrou(true)
        if (papel.current === 'host') {
          const p = pc.current
          const sessaoNova = !!sessaoRemota.current && sessaoRemota.current !== s.sess
          const conexaoRuim = p.connectionState === 'failed' || p.connectionState === 'disconnected' || p.connectionState === 'closed'
          const negociouMasNaoConectou = !!p.remoteDescription && p.connectionState !== 'connected' && p.connectionState !== 'connecting'
          // outro lado voltou (recarregou, tentou de novo): joga a conexão velha fora e negocia do zero
          if (sessaoNova || conexaoRuim || negociouMasNaoConectou) { log('renegociando: sessão nova?', sessaoNova, 'estado', p.connectionState); novoPc() }
          sessaoRemota.current = s.sess
          const q = pc.current!
          if (q.signalingState === 'stable' && !q.remoteDescription) await oferecer()
          // já conectado com essa mesma sessão: só um "pronto" repetido, nada a fazer
        } else if (pc.current.connectionState !== 'connected') enviar({ t: 'pronto' })
      } else if (s.t === 'offer' && papel.current === 'lead') {
        // oferta nova de um host que já tinha negociado comigo (ele recriou): recomeço também
        if (pc.current.remoteDescription || (sessaoRemota.current && sessaoRemota.current !== s.sess)) { log('host reofertou: recriando'); novoPc() }
        sessaoRemota.current = s.sess
        const p = pc.current!
        await p.setRemoteDescription(s.sdp)
        for (const c of fila.current) await p.addIceCandidate(c).catch(() => null); fila.current = []
        const ans = await p.createAnswer(); await p.setLocalDescription(ans)
        enviar({ t: 'answer', sdp: p.localDescription })
      } else if (s.t === 'answer' && papel.current === 'host') {
        const p = pc.current
        if (p.signalingState === 'have-local-offer') { await p.setRemoteDescription(s.sdp); for (const c of fila.current) await p.addIceCandidate(c).catch(() => null); fila.current = [] }
      } else if (s.t === 'ice') {
        const p = pc.current
        if (p.remoteDescription) await p.addIceCandidate(s.cand).catch(() => null); else fila.current.push(s.cand)
      } else if (s.t === 'sair') {
        if (papel.current === 'host') {
          // o lead saiu: a chamada continua aberta; se ele voltar, reconecta
          setOutroEntrou(false); setAviso(`${info?.com_quem || 'O outro lado'} saiu da chamada. Se voltar, reconecta sozinho. Pra terminar, clica em Encerrar.`)
        } else { desligar(false); setFase('encerrada') }
      }
    } catch (e: any) { log('erro ao tratar', s.t, e); setErro(e?.message || 'falha na conexão') }
  }

  async function oferecer() {
    const p = pc.current!
    const off = await p.createOffer(); await p.setLocalDescription(off)
    enviar({ t: 'offer', sdp: p.localDescription })
    log('oferta enviada')
  }

  // ── gravação (só o host): mistura os dois áudios num fluxo e sobe em pedaços de 30s.
  // Sobrevive a reconexões: o gravador é um só, e cada áudio remoto novo entra na mistura.
  function iniciarGravacao() {
    if (rec.current || !local.current) return
    try {
      ctx.current = new AudioContext(); dest.current = ctx.current.createMediaStreamDestination()
      ctx.current.createMediaStreamSource(local.current).connect(dest.current)
      remoto.current?.getAudioTracks().forEach(t => misturarNaGravacao(t))
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || ''
      const r = new MediaRecorder(dest.current.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined)
      r.ondataavailable = async e => {
        if (!e.data || !e.data.size) return
        const fd = new FormData(); fd.append('acao', 'pedaco'); fd.append('h', h); fd.append('seq', String(Math.floor(Date.now() / 1000))); fd.append('mime', r.mimeType || mime); fd.append('arquivo', e.data, 'p.webm')
        await fetch(`/api/chamadas/${codigo}`, { method: 'POST', body: fd }).catch(() => null)
      }
      r.start(30000); rec.current = r; setGravando(true)
    } catch { /* sem gravação, a chamada segue */ }
  }
  // OS MEDIDORES: mostram se o meu microfone está captando e se está chegando som do outro lado.
  // Sem isso ninguém sabe se o problema é o mic, a rede ou o alto-falante. Um AudioContext só pra
  // medir (o da gravação é do host; este roda nos dois lados).
  function medirAudio() {
    if (medidor.current) return
    try {
      const ac = new AudioContext()
      const fazer = (stream: MediaStream | null) => { if (!stream || !stream.getAudioTracks().length) return null; const an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an); return an }
      let anL = fazer(local.current), anR = fazer(remoto.current)
      const buf = new Float32Array(512)
      const pico = (an: AnalyserNode | null) => { if (!an) return 0; an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) { const a = Math.abs(v); if (a > m) m = a } return m }
      medidor.current = setInterval(() => {
        if (!anR && remoto.current?.getAudioTracks().length) anR = fazer(remoto.current)
        setNivelLocal(Math.min(1, pico(anL) * 4)); setNivelRemoto(Math.min(1, pico(anR) * 4))
      }, 120)
    } catch { /* sem medidor, a chamada segue */ }
  }
  function liberarSom() { vRemoto.current?.play().then(() => setSomBloqueado(false)).catch(() => null) }

  function misturarNaGravacao(track: MediaStreamTrack) {
    if (!ctx.current || !dest.current) return
    try { ctx.current.createMediaStreamSource(new MediaStream([track])).connect(dest.current) } catch { /* já misturado */ }
  }

  async function desligar(avisar = true) {
    if (encerrouEu.current) return
    if (avisar) { encerrouEu.current = true; enviar({ t: 'sair' }) }
    clearInterval(timer.current); clearInterval(pronto.current); clearInterval(medidor.current); timer.current = null; medidor.current = null
    const r = rec.current
    if (r && r.state !== 'inactive') {
      // o último pedaço só chega no ondataavailable depois do stop: espera ele subir
      await new Promise<void>(res => { r.onstop = () => res(); r.stop() })
      await new Promise(res => setTimeout(res, 800))
    }
    rec.current = null
    if (papel.current === 'host' && avisar) await post({ acao: 'encerrar' })
    try { pc.current?.close() } catch { /* ok */ }
    pc.current = null
    local.current?.getTracks().forEach(t => t.stop())
    if (canal.current) { supabase.removeChannel(canal.current); canal.current = null }
    ctx.current?.close().catch(() => null)
    if (avisar) setFase('encerrada')
  }

  function alternarMudo() {
    const on = !mudo; setMudo(on)
    local.current?.getAudioTracks().forEach(t => { t.enabled = !on })
  }

  // ─────────────────────────────────────────────────────────────── a tela
  const host = papel.current === 'host'
  const S: Record<string, React.CSSProperties> = {
    fundo: { minHeight: '100vh', background: 'var(--bg, #0B0A10)', color: 'var(--text, #fff)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'inherit' },
    card: { width: '100%', maxWidth: 520, background: 'var(--surface, #15121F)', border: '1px solid var(--border, #2A2540)', borderRadius: 18, padding: 24 },
    marca: { fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent, #C9AAFF)' },
    h1: { fontSize: 26, fontWeight: 800, margin: '8px 0 0', lineHeight: 1.15 },
    p: { fontSize: 14.5, color: 'var(--text-2, #C9C3D9)', lineHeight: 1.5, margin: '10px 0 0' },
    btn: { border: 'none', borderRadius: 12, padding: '14px 18px', fontSize: 16, fontWeight: 800, cursor: 'pointer', width: '100%' },
    btn2: { border: '1px solid var(--border-strong, #3A3452)', background: 'var(--surface-2, #1D1929)', color: 'var(--text, #fff)', borderRadius: 12, padding: '12px 16px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', flex: 1 },
    aviso: { width: '100%', maxWidth: 720, marginTop: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--amber-bg, #3A2E10)', color: 'var(--amber, #F5B82E)', fontSize: 13 },
  }

  if (fase === 'carregando') return <div style={S.fundo}><div style={{ color: 'var(--text-faint, #7E7793)' }}>Abrindo a chamada…</div></div>
  if (fase === 'invalida') return <div style={S.fundo}><div style={S.card}><div style={S.marca}>Carreira no Digital</div><h1 style={S.h1}>Esse link não abre uma chamada.</h1><p style={S.p}>Confere se copiou o link inteiro, ou pede um novo pra quem te convidou.</p></div></div>
  if (fase === 'encerrada') return <div style={S.fundo}><div style={S.card}><div style={S.marca}>Carreira no Digital</div><h1 style={S.h1}>Chamada encerrada.</h1><p style={S.p}>{seg ? `Duração: ${fmt(seg)}. ` : ''}{host ? 'A gravação está sendo transcrita e vai pro histórico do lead em alguns minutos.' : 'Obrigado pela conversa. Se precisar, é só chamar no WhatsApp.'}</p></div></div>

  if (fase === 'antes' || fase === 'erro') return (
    <div style={S.fundo}>
      <div style={S.card}>
        <div style={S.marca}>{info?.empresa}</div>
        <h1 style={S.h1}>{host ? `Chamada com ${info?.com_quem}` : `${info?.com_quem} te convidou pra uma chamada`}</h1>
        <p style={S.p}>{comVideo ? 'Com vídeo e voz.' : 'Só voz, como uma ligação.'} Funciona aqui no navegador, sem instalar nada. Ao entrar, o navegador pede permissão pro microfone{comVideo ? ' e pra câmera' : ''}.</p>
        {host && <p style={{ ...S.p, fontSize: 13, color: 'var(--text-faint, #7E7793)' }}>A conversa será gravada e transcrita pro histórico do lead. Avise a pessoa.</p>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, fontSize: 14, color: 'var(--text-2, #C9C3D9)', cursor: 'pointer' }}>
          <input type="checkbox" checked={comVideo} onChange={e => setComVideo(e.target.checked)} /> Entrar com a câmera ligada
        </label>
        {erro && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--red-bg, #3A1520)', color: 'var(--red, #F0475F)', fontSize: 13.5, lineHeight: 1.45 }}>{erro}</div>}
        <button onClick={entrar} style={{ ...S.btn, marginTop: 18, background: 'var(--green, #22C55E)', color: '#fff' }}>Entrar na chamada</button>
      </div>
    </div>
  )

  return (
    <div style={{ ...S.fundo, justifyContent: 'space-between', padding: 12 }}>
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px' }}>
        <div><div style={S.marca}>{info?.empresa}</div><div style={{ fontSize: 16, fontWeight: 800 }}>{info?.com_quem}</div></div>
        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{fase === 'conectado' ? fmt(seg) : outroEntrou ? 'conectando…' : 'esperando'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint, #7E7793)' }}>{fase === 'conectado' ? (gravando ? 'gravando' : 'ao vivo') : outroEntrou ? 'o outro lado já entrou' : host ? 'aguardando o convidado abrir o link' : `aguardando ${info?.com_quem}`}</div>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: 720, flex: 1, minHeight: 320, borderRadius: 18, overflow: 'hidden', background: 'var(--surface, #15121F)', border: '1px solid var(--border, #2A2540)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video ref={vRemoto} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: temVideoRemoto ? 'block' : 'none' }} />
        {!temVideoRemoto && (
          <div style={{ textAlign: 'center', color: 'var(--text-2, #C9C3D9)' }}>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent, #6522D6)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 800, color: '#fff' }}>{(info?.com_quem || '?').trim()[0]?.toUpperCase()}</div>
            <div style={{ fontSize: 15 }}>{fase === 'conectado' ? 'Só voz do outro lado' : outroEntrou ? 'Conectando…' : 'Esperando o outro lado entrar'}</div>
          </div>
        )}
        <video ref={vLocal} autoPlay playsInline muted style={{ position: 'absolute', right: 10, bottom: 10, width: 120, height: 160, objectFit: 'cover', borderRadius: 12, border: '2px solid var(--border-strong, #3A3452)', display: temVideoLocal ? 'block' : 'none' }} />
      </div>

      {somBloqueado && <button onClick={liberarSom} style={{ ...S.btn, maxWidth: 720, marginTop: 8, background: 'var(--accent, #6522D6)', color: '#fff' }}>Toque aqui para ouvir o outro lado</button>}
      {fase === 'conectado' && (
        <div style={{ width: '100%', maxWidth: 720, display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--text-faint, #7E7793)' }}>
          {[['Teu microfone', nivelLocal, mudo ? 'desligado' : nivelLocal < 0.04 ? 'não capta nada' : 'captando'], ['Som do outro lado', nivelRemoto, nivelRemoto < 0.04 ? 'nada chegando' : 'chegando']].map(([l, v, t]: any) => (
            <div key={l} style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l}</span><span style={{ color: (t === 'captando' || t === 'chegando') ? 'var(--green, #22C55E)' : 'var(--amber, #F5B82E)' }}>{t}</span></div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2, #1D1929)', marginTop: 4, overflow: 'hidden' }}><div style={{ width: Math.round(v * 100) + '%', height: '100%', background: v > 0.04 ? 'var(--green, #22C55E)' : 'var(--border-strong, #3A3452)', transition: 'width .1s' }} /></div>
            </div>
          ))}
        </div>
      )}
      {aviso && <div style={S.aviso}>{aviso}</div>}
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', gap: 10, padding: '12px 0 4px' }}>
        <button onClick={alternarMudo} style={{ ...S.btn2, background: mudo ? 'var(--amber-bg, #3A2E10)' : S.btn2.background, color: mudo ? 'var(--amber, #F5B82E)' : S.btn2.color }}>{mudo ? 'Microfone desligado' : 'Silenciar'}</button>
        <button onClick={() => desligar(true)} style={{ ...S.btn2, background: 'var(--red, #F0475F)', color: '#fff', border: 'none' }}>{host ? 'Encerrar chamada' : 'Sair'}</button>
      </div>
      {erro && <div style={{ width: '100%', maxWidth: 720, marginTop: 6, fontSize: 13, color: 'var(--red, #F0475F)' }}>{erro}</div>}
    </div>
  )
}
