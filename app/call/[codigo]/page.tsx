'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// A CHAMADA. Uma página só pros dois lados: o lead abre /call/<codigo>; quem convidou abre
// com ?h=<chave>. WebRTC ponto a ponto (voz, vídeo opcional), sinalização pelo Realtime do
// Supabase, sem servidor de mídia e sem assinatura. Quem convidou grava a conversa no próprio
// navegador (os dois lados misturados) em pedaços de 30s que sobem pro Storage; no fim o
// sistema junta, transcreve e joga no histórico do lead.

// STUN do Google acha o caminho direto na maioria das redes. Quando não dá (4G, rede de
// empresa), o TURN retransmite: aqui o do Open Relay, gratuito. Pra volume, trocar pelo da
// Cloudflare (1 TB/mês grátis) ou um coturn próprio.
const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' },
]

type Sinal = { t: 'pronto' | 'offer' | 'answer' | 'ice' | 'sair'; de: 'host' | 'lead'; sdp?: any; cand?: any }
type Fase = 'carregando' | 'invalida' | 'antes' | 'conectando' | 'conectado' | 'encerrada' | 'erro'

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function Chamada({ params }: { params: Promise<{ codigo: string }> }) {
  const [codigo, setCodigo] = useState('')
  const [h, setH] = useState('')
  const [info, setInfo] = useState<any>(null)
  const [fase, setFase] = useState<Fase>('carregando')
  const [erro, setErro] = useState('')
  const [comVideo, setComVideo] = useState(false)
  const [mudo, setMudo] = useState(false)
  const [seg, setSeg] = useState(0)
  const [outroEntrou, setOutroEntrou] = useState(false)
  const [gravando, setGravando] = useState(false)

  const pc = useRef<RTCPeerConnection | null>(null)
  const canal = useRef<any>(null)
  const local = useRef<MediaStream | null>(null)
  const remoto = useRef<MediaStream>(new MediaStream())
  const vLocal = useRef<HTMLVideoElement>(null)
  const vRemoto = useRef<HTMLVideoElement>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const dest = useRef<MediaStreamAudioDestinationNode | null>(null)
  const seq = useRef(0)
  const fila = useRef<any[]>([])
  const timer = useRef<any>(null)
  const pronto = useRef<any>(null)
  const papel = useRef<'host' | 'lead'>('lead')

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

  const enviar = (s: Sinal) => canal.current?.send({ type: 'broadcast', event: 'sinal', payload: s })
  const post = (body: any) => fetch(`/api/chamadas/${codigo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, h }) }).catch(() => null)

  async function entrar() {
    setFase('conectando'); setErro('')
    try {
      local.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: comVideo ? { facingMode: 'user', width: { ideal: 640 } } : false })
    } catch { setFase('erro'); setErro('Não consegui acessar o microfone. Confere a permissão do navegador e tenta de novo.'); return }
    if (vLocal.current) { vLocal.current.srcObject = local.current; vLocal.current.muted = true }

    const p = new RTCPeerConnection({ iceServers: ICE })
    pc.current = p
    local.current.getTracks().forEach(t => p.addTrack(t, local.current!))
    p.ontrack = e => {
      remoto.current.addTrack(e.track)
      if (vRemoto.current) { vRemoto.current.srcObject = remoto.current; vRemoto.current.play().catch(() => null) }
      if (papel.current === 'host' && e.track.kind === 'audio') misturarNaGravacao(e.track)
    }
    p.onicecandidate = e => { if (e.candidate) enviar({ t: 'ice', de: papel.current, cand: e.candidate.toJSON() }) }
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') { setFase('conectado'); setOutroEntrou(true); if (!timer.current) timer.current = setInterval(() => setSeg(s => s + 1), 1000); post({ acao: 'entrou' }); if (papel.current === 'host') iniciarGravacao() }
      if (p.connectionState === 'failed') { setErro('A conexão caiu. Os dois podem recarregar a página pra tentar de novo.'); setFase('erro') }
    }

    // sinalização: um canal por chamada, os dois lados ouvem
    const c = supabase.channel(`chamada:${codigo}`, { config: { broadcast: { self: false } } })
    canal.current = c
    c.on('broadcast', { event: 'sinal' }, ({ payload }: { payload: Sinal }) => tratar(payload))
    c.subscribe((st: string) => {
      if (st !== 'SUBSCRIBED') return
      enviar({ t: 'pronto', de: papel.current })
      // o lead avisa que está pronto até o host mandar a oferta
      if (papel.current === 'lead') pronto.current = setInterval(() => { if (!p.remoteDescription) enviar({ t: 'pronto', de: 'lead' }); else clearInterval(pronto.current) }, 3000)
    })
  }

  async function tratar(s: Sinal) {
    const p = pc.current
    if (!p || s.de === papel.current) return
    try {
      if (s.t === 'pronto') {
        setOutroEntrou(true)
        // quem convidou faz a oferta; o lead só responde "pronto" pra ele saber que tem alguém
        if (papel.current === 'host') { if (p.signalingState === 'stable' && !p.remoteDescription) await oferecer(); else if (p.connectionState === 'connected') { /* já falando */ } }
        else if (!p.remoteDescription) enviar({ t: 'pronto', de: 'lead' })
      } else if (s.t === 'offer' && papel.current === 'lead') {
        await p.setRemoteDescription(s.sdp)
        for (const c of fila.current) await p.addIceCandidate(c).catch(() => null); fila.current = []
        const ans = await p.createAnswer(); await p.setLocalDescription(ans)
        enviar({ t: 'answer', de: 'lead', sdp: p.localDescription })
        clearInterval(pronto.current)
      } else if (s.t === 'answer' && papel.current === 'host') {
        if (p.signalingState === 'have-local-offer') { await p.setRemoteDescription(s.sdp); for (const c of fila.current) await p.addIceCandidate(c).catch(() => null); fila.current = [] }
      } else if (s.t === 'ice') {
        if (p.remoteDescription) await p.addIceCandidate(s.cand).catch(() => null); else fila.current.push(s.cand)
      } else if (s.t === 'sair') {
        desligar(false); setFase('encerrada')
      }
    } catch (e: any) { setErro(e?.message || 'falha na conexão') }
  }

  async function oferecer() {
    const p = pc.current!
    const off = await p.createOffer(); await p.setLocalDescription(off)
    enviar({ t: 'offer', de: 'host', sdp: p.localDescription })
  }

  // ── gravação (só o host): mistura os dois áudios num fluxo e sobe em pedaços de 30s
  function iniciarGravacao() {
    if (rec.current || !local.current) return
    try {
      ctx.current = new AudioContext(); dest.current = ctx.current.createMediaStreamDestination()
      ctx.current.createMediaStreamSource(local.current).connect(dest.current)
      remoto.current.getAudioTracks().forEach(t => misturarNaGravacao(t))
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || ''
      const r = new MediaRecorder(dest.current.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined)
      r.ondataavailable = async e => {
        if (!e.data || !e.data.size) return
        const fd = new FormData(); fd.append('acao', 'pedaco'); fd.append('h', h); fd.append('seq', String(seq.current++)); fd.append('mime', r.mimeType || mime); fd.append('arquivo', e.data, 'p.webm')
        await fetch(`/api/chamadas/${codigo}`, { method: 'POST', body: fd }).catch(() => null)
      }
      r.start(30000); rec.current = r; setGravando(true)
    } catch { /* sem gravação, a chamada segue */ }
  }
  function misturarNaGravacao(track: MediaStreamTrack) {
    if (!ctx.current || !dest.current) return
    try { ctx.current.createMediaStreamSource(new MediaStream([track])).connect(dest.current) } catch { /* já misturado */ }
  }

  async function desligar(avisar = true) {
    if (avisar) enviar({ t: 'sair', de: papel.current })
    clearInterval(timer.current); clearInterval(pronto.current); timer.current = null
    const r = rec.current
    if (r && r.state !== 'inactive') {
      // o último pedaço só chega no ondataavailable depois do stop: espera ele subir
      await new Promise<void>(res => { r.onstop = () => res(); r.stop() })
      await new Promise(res => setTimeout(res, 800))
    }
    rec.current = null
    if (papel.current === 'host' && avisar) await post({ acao: 'encerrar' })
    pc.current?.close(); pc.current = null
    local.current?.getTracks().forEach(t => t.stop())
    canal.current && supabase.removeChannel(canal.current); canal.current = null
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
        {erro && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--red-bg, #3A1520)', color: 'var(--red, #F0475F)', fontSize: 13.5 }}>{erro}</div>}
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
        <video ref={vRemoto} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: remoto.current.getVideoTracks().length ? 'block' : 'none' }} />
        {!remoto.current.getVideoTracks().length && (
          <div style={{ textAlign: 'center', color: 'var(--text-2, #C9C3D9)' }}>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent, #6522D6)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 800, color: '#fff' }}>{(info?.com_quem || '?').trim()[0]?.toUpperCase()}</div>
            <div style={{ fontSize: 15 }}>{fase === 'conectado' ? 'Só voz' : 'Conectando…'}</div>
          </div>
        )}
        <video ref={vLocal} autoPlay playsInline muted style={{ position: 'absolute', right: 10, bottom: 10, width: 120, height: 160, objectFit: 'cover', borderRadius: 12, border: '2px solid var(--border-strong, #3A3452)', display: comVideo ? 'block' : 'none' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 720, display: 'flex', gap: 10, padding: '12px 0 4px' }}>
        <button onClick={alternarMudo} style={{ ...S.btn2, background: mudo ? 'var(--amber-bg, #3A2E10)' : S.btn2.background, color: mudo ? 'var(--amber, #F5B82E)' : S.btn2.color }}>{mudo ? 'Microfone desligado' : 'Silenciar'}</button>
        <button onClick={() => desligar(true)} style={{ ...S.btn2, background: 'var(--red, #F0475F)', color: '#fff', border: 'none' }}>{host ? 'Encerrar chamada' : 'Sair'}</button>
      </div>
      {erro && <div style={{ width: '100%', maxWidth: 720, marginTop: 6, fontSize: 13, color: 'var(--red, #F0475F)' }}>{erro}</div>}
    </div>
  )
}
