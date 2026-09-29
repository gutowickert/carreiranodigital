'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Mic, MicOff, Video, VideoOff, Maximize2, Minimize2, PhoneOff, Settings2 } from 'lucide-react'
import AssinaturaCND from '@/components/AssinaturaCND'

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
// COMO LIBERAR câmera/microfone bloqueados, no aparelho de quem está vendo. O "Tentar de novo" só
// adianta depois disto: bloqueado uma vez, o navegador não pergunta sozinho.
function comoLiberar() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua)) return 'Abre este link no navegador do celular (toque nos três pontinhos ou no ícone de compartilhar → Abrir no Safari/Chrome) e entra de novo.'
  if (/iPhone|iPad/i.test(ua)) return 'No iPhone: toque em "aA" na barra do endereço → Ajustes do Site → Câmera e Microfone → Permitir. Depois toque em Tentar de novo.'
  if (/Android/i.test(ua)) return 'No Android: toque no cadeado ao lado do endereço → Permissões → libere Câmera e Microfone. Depois toque em Tentar de novo.'
  return 'Clique no cadeado ao lado do endereço → libere Câmera e Microfone → e tente de novo.'
}

async function cameraFisica(): Promise<MediaTrackConstraints> {
  const base: MediaTrackConstraints = { facingMode: 'user', width: { ideal: 640 } }
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
    const fisica = cams.find(d => d.label && !/ndi|obs|virtual|snap|xsplit|manycam|droidcam|camo/i.test(d.label))
    return fisica ? { ...base, deviceId: { exact: fisica.deviceId } } : base
  } catch { return base }
}

// MICROFONE VIRTUAL = silêncio. No PC do Guto (27/09) o Chrome escolheu "Webcam 3 (NDI Webcam Audio)" e o outro
// lado recebia pacotes de silêncio: vídeo passava, voz não. Estes rótulos nunca são a primeira escolha.
const VIRTUAL_MIC = /ndi|obs|virtual|cable|voicemeeter|stereo mix|mixagem|loopback|what u hear|snap|xsplit|manycam|droidcam|camo/i
const AUDIO_BASE: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

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
  const [camOff, setCamOff] = useState(false)
  const [telaCheia, setTelaCheia] = useState(false)
  const [imersivo, setImersivo] = useState(false)      // iPhone sem tela cheia de página: esconde o cabeçalho
  const [micMenu, setMicMenu] = useState(false)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [micId, setMicId] = useState('')
  const [micLabel, setMicLabel] = useState('')
  const [preparado, setPreparado] = useState(false)    // já testou mic/câmera antes de entrar
  const palco = useRef<HTMLDivElement>(null)
  const micVersao = useRef(0)                          // muda quando o mic é trocado: o medidor religa
  const raioX = useRef<any>(null)
  const raioXn = useRef(0)

  const pc = useRef<RTCPeerConnection | null>(null)
  const canal = useRef<any>(null)
  const local = useRef<MediaStream | null>(null)
  const remoto = useRef<MediaStream | null>(null)   // criado só ao entrar: no servidor não existe MediaStream
  const vLocal = useRef<HTMLVideoElement>(null)
  const vRemoto = useRef<HTMLVideoElement>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  // O SOM DO OUTRO LADO sai por um <audio> proprio, nunca pelo <video>. O <video> fica display:none quando
  // nao ha camera, e o iPhone nao toca som de video escondido; com o <audio> separado o som toca sempre.
  const aRemoto = useRef<HTMLAudioElement | null>(null)
  // o AudioContext dos medidores nasce DENTRO do toque em Entrar: criado depois, sem gesto, o navegador
  // deixa ele suspenso e o medidor diz "nao capta nada" com som passando (visto no teste automatico)
  const ctxMed = useRef<AudioContext | null>(null)
  const dest = useRef<MediaStreamAudioDestinationNode | null>(null)
  const misturador = useRef<ChannelMergerNode | null>(null)   // canal 0 = eu (time), canal 1 = o outro lado
  const ice = useRef<RTCIceServer[]>(ICE_RESERVA)
  const fila = useRef<any[]>([])
  const timer = useRef<any>(null)
  const pronto = useRef<any>(null)
  const papel = useRef<'host' | 'lead'>('lead')
  const sessao = useRef('')          // a minha sessão nesta entrada
  const sessaoRemota = useRef('')    // a sessão do outro lado com quem estou (ou estava) negociando
  const encerrouEu = useRef(false)
  // A ESPERA (28/09/2026 — o Rick ficou numa tela parada e muda sem saber se o cliente tinha aberto):
  // som de "chamando", o passo a passo (abriu o link / entrou), o tempo esperando, e o reenvio do link.
  const [leadAbriu, setLeadAbriu] = useState(false)
  const [esperaSeg, setEsperaSeg] = useState(0)
  const [somEspera, setSomEspera] = useState(true)
  const avisoCanal = useRef<any>(null)
  const avisouEntrou = useRef(false)

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
  useEffect(() => { const f = () => setTelaCheia(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  // o <video> da prévia é outro elemento em cada tela (antes/durante): religa o stream quando a tela muda
  useEffect(() => { if (vLocal.current && local.current) { vLocal.current.srcObject = local.current; vLocal.current.muted = true } }, [fase, preparado, temVideoLocal])

  const enviar = (s: Omit<Sinal, 'sess' | 'de'>) => canal.current?.send({ type: 'broadcast', event: 'sinal', payload: { ...s, de: papel.current, sess: sessao.current } })
  // FECHOU A ABA (28/09/2026): sem isto a chamada só era processada no botão Encerrar, e quem fechava
  // a aba deixava a gravação órfã. sendBeacon é o único envio que o navegador garante na saída.
  // Só se já estava gravando — senão abrir e fechar o link criaria uma "ligação de 0s" no card.
  useEffect(() => {
    const sair = () => {
      if (papel.current !== 'host' || encerrouEu.current || !rec.current) return
      try { navigator.sendBeacon(`/api/chamadas/${codigo}`, new Blob([JSON.stringify({ acao: 'encerrar', h })], { type: 'application/json' })) } catch { /* a rede de segurança fecha depois */ }
    }
    window.addEventListener('pagehide', sair)
    return () => window.removeEventListener('pagehide', sair)
  }, [codigo, h])

  // sons curtos feitos na hora (sem arquivo): o "chamando" de telefone e o "plim" de quando algo acontece
  function tom(freqs: number[], dur: number, vol = 0.07) {
    const ac = ctxMed.current; if (!ac) return
    try {
      ac.resume().catch(() => null)
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + i * dur
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ac.destination)
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.03); g.gain.setValueAtTime(vol, t0 + dur - 0.05); g.gain.linearRampToValueAtTime(0, t0 + dur)
        o.start(t0); o.stop(t0 + dur + 0.02)
      })
    } catch { /* sem som */ }
  }
  const plim = () => tom([880, 1320], 0.14, 0.09)
  function avisarFora(texto: string) {
    if (typeof document === 'undefined' || !document.hidden) return
    document.title = `● ${texto}`
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(texto, { body: 'Volta pra aba da chamada.' }) } catch { /* ok */ }
  }
  useEffect(() => { const f = () => { if (!document.hidden && info?.empresa) document.title = `Chamada · ${info.empresa}` }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f) }, [info])

  // o CLIENTE avisa que abriu o link (antes mesmo de entrar), num canal leve só de presença
  useEffect(() => {
    if (!codigo || papel.current !== 'lead' || fase !== 'antes') return
    const c = avisoCanal.current || supabase.channel(`chamada-aviso:${codigo}`, { config: { broadcast: { self: false } } })
    if (!avisoCanal.current) { avisoCanal.current = c; c.subscribe() }
    const mandar = () => c.send({ type: 'broadcast', event: 'aviso', payload: { t: 'abriu' } }).catch(() => null)
    const t0 = setTimeout(mandar, 800), t1 = setInterval(mandar, 6000)
    return () => { clearTimeout(t0); clearInterval(t1) }
  }, [codigo, fase])

  // enquanto espera: conta o tempo e toca o "chamando" (425 Hz, 1s a cada 4s — o som de chamada no Brasil)
  useEffect(() => {
    if (fase !== 'conectando') return
    const conta = setInterval(() => setEsperaSeg(s => s + 1), 1000)
    const toca = () => { if (somEspera && !outroEntrou) tom([425], 1, 0.05) }
    toca(); const chama = setInterval(toca, 4000)
    return () => { clearInterval(conta); clearInterval(chama) }
  }, [fase, somEspera, outroEntrou])

  const post = (body: any) => fetch(`/api/chamadas/${codigo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, h }) }).catch(() => null)

  // ── a conexão: criada ao entrar e RECRIADA sempre que o outro lado chega com sessão nova
  function novoPc(): RTCPeerConnection {
    if (pc.current) { try { pc.current.onconnectionstatechange = null; pc.current.ontrack = null; pc.current.onicecandidate = null; pc.current.close() } catch { /* já fechada */ } }
    fila.current = []
    remoto.current = new MediaStream(); setTemVideoRemoto(false)
    if (vRemoto.current) vRemoto.current.srcObject = remoto.current
    if (aRemoto.current) aRemoto.current.srcObject = remoto.current
    const p = new RTCPeerConnection({ iceServers: ice.current })
    pc.current = p
    local.current?.getTracks().forEach(t => p.addTrack(t, local.current!))
    // LUGAR PRA VÍDEO E PRA ÁUDIO MESMO SEM CÂMERA (29/09/2026): quem convidava sem câmera montava a
    // oferta só com áudio, e o vídeo do cliente não tinha por onde passar — ele via a própria câmera e
    // do outro lado aparecia "Só voz". Com o lugar reservado (sem faixa), a câmera de qualquer lado
    // entra depois com replaceTrack, sem renegociar (ver ligarCamera).
    if (!local.current?.getVideoTracks().length) p.addTransceiver('video', { direction: 'sendrecv' })
    p.ontrack = e => {
      remoto.current?.addTrack(e.track)
      if (e.track.kind === 'video') setTemVideoRemoto(true)
      tocarRemoto()
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
        if (!raioX.current) raioX.current = setInterval(colherRaioX, 5000)
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

  // PEGAR MIC (+ CÂMERA): câmera é opcional (se falhar, entra só com voz e avisa); microfone é obrigatório e o
  // erro diz o motivo de verdade. Se o navegador entregar um microfone virtual, troca pelo primeiro físico.
  async function capturar(): Promise<boolean> {
    const audio: MediaTrackConstraints = micId ? { ...AUDIO_BASE, deviceId: { exact: micId } } : AUDIO_BASE
    let usouVideo = comVideo
    let s: MediaStream
    try {
      if (comVideo) {
        const video = await cameraFisica()
        try { s = await navigator.mediaDevices.getUserMedia({ audio, video }) }
        catch (e: any) { usouVideo = false; setComVideo(false); setAviso(`Câmera indisponível (${motivoMidia(e)}). Entrando só com voz.`); s = await navigator.mediaDevices.getUserMedia({ audio, video: false }) }
      } else s = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    } catch (e: any) { setFase('erro'); setErro(`Não consegui acessar o microfone: ${motivoMidia(e)}. ${comoLiberar()}`); return false }
    const f = s.getAudioTracks()[0]
    if (f && !micId && VIRTUAL_MIC.test(f.label)) {
      try {
        const reais = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.label && !VIRTUAL_MIC.test(d.label) && d.deviceId !== 'default' && d.deviceId !== 'communications')
        if (reais.length) {
          const real = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO_BASE, deviceId: { exact: reais[0].deviceId } }, video: false })
          const nf = real.getAudioTracks()[0]
          if (nf) { s.removeTrack(f); f.stop(); s.addTrack(nf); setMicId(reais[0].deviceId); log('mic virtual trocado:', f.label, '->', nf.label) }
        } else setAviso(`O navegador só achou microfone virtual (${f.label}). Toca em Áudio e escolhe outro.`)
      } catch { /* fica com o que veio */ }
    }
    local.current = s; micVersao.current++
    setMicLabel(s.getAudioTracks()[0]?.label || ''); setTemVideoLocal(usouVideo); setCamOff(false)
    if (vLocal.current) { vLocal.current.srcObject = s; vLocal.current.muted = true }
    return true
  }

  async function entrar() {
    setFase('conectando'); setErro(''); setAviso('')
    try { if (!ctxMed.current) ctxMed.current = new AudioContext(); ctxMed.current.resume().catch(() => null) } catch { /* sem medidor */ }
    if (!local.current) { const ok = await capturar(); if (!ok) return }

    // quem convida: pede a permissão de aviso do computador (dentro do toque) e ouve o "abriu o link"
    if (papel.current === 'host') {
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => null) } catch { /* ok */ }
      if (!avisoCanal.current) {
        const av = supabase.channel(`chamada-aviso:${codigo}`, { config: { broadcast: { self: false } } })
        av.on('broadcast', { event: 'aviso' }, ({ payload }: any) => {
          if (payload?.t === 'abriu') setLeadAbriu(ja => { if (!ja) { plim(); avisarFora(`${info?.com_quem || 'O convidado'} abriu o link`) } return true })
        })
        av.subscribe(); avisoCanal.current = av
      }
    } else if (avisoCanal.current) { try { supabase.removeChannel(avisoCanal.current) } catch { /* ok */ } avisoCanal.current = null }
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
        setOutroEntrou(true); setLeadAbriu(true)
        if (!avisouEntrou.current) { avisouEntrou.current = true; tom([660, 880, 1100], 0.12, 0.09); avisarFora(`${info?.com_quem || 'O outro lado'} entrou na chamada`) }
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
        // quem entrou sem câmera responde "posso mandar vídeo" mesmo assim: se ligar a câmera depois,
        // ela passa sem renegociar
        p.getTransceivers().forEach(tr => { if (tr.receiver.track?.kind === 'video' && tr.direction === 'recvonly') tr.direction = 'sendrecv' })
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
      // ESTÉREO, UM LADO POR CANAL: esquerdo = meu microfone (o time), direito = o outro lado (o lead).
      // É o que deixa a transcrição dizer com certeza quem falou (Deepgram multichannel), em vez de
      // adivinhar pela ordem de quem falou primeiro.
      ctx.current = new AudioContext(); dest.current = ctx.current.createMediaStreamDestination()
      misturador.current = ctx.current.createChannelMerger(2); misturador.current.connect(dest.current)
      ctx.current.createMediaStreamSource(local.current).connect(misturador.current, 0, 0)
      remoto.current?.getAudioTracks().forEach(t => misturarNaGravacao(t))
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || ''
      const r = new MediaRecorder(dest.current.stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined)
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
      const ac = ctxMed.current || (ctxMed.current = new AudioContext())
      if (ac.state !== 'running') ac.resume().catch(() => null)
      const fazer = (stream: MediaStream | null) => { if (!stream || !stream.getAudioTracks().length) return null; const an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an); return an }
      let anL = fazer(local.current), anR = fazer(remoto.current), versaoL = micVersao.current
      const buf = new Float32Array(512)
      const pico = (an: AnalyserNode | null) => { if (!an) return 0; an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) { const a = Math.abs(v); if (a > m) m = a } return m }
      medidor.current = setInterval(() => {
        if (versaoL !== micVersao.current) { anL = fazer(local.current); versaoL = micVersao.current }
        if (!anR && remoto.current?.getAudioTracks().length) anR = fazer(remoto.current)
        setNivelLocal(Math.min(1, pico(anL) * 4)); setNivelRemoto(Math.min(1, pico(anR) * 4))
      }, 120)
    } catch { /* sem medidor, a chamada segue */ }
  }
  // (re)liga os elementos ao stream remoto e manda tocar. Safari/iPhone nao percebe faixa nova adicionada a um
  // stream ja ligado: por isso o srcObject e reatribuido a cada faixa que chega.
  function tocarRemoto() {
    const r = remoto.current; if (!r) return
    if (aRemoto.current) {
      aRemoto.current.srcObject = r; aRemoto.current.muted = false; aRemoto.current.volume = 1
      aRemoto.current.play().then(() => setSomBloqueado(false)).catch(() => setSomBloqueado(true))
    }
    if (vRemoto.current) { vRemoto.current.srcObject = r; vRemoto.current.play().catch(() => null) }
  }
  // RAIO-X: o que o WebRTC está de fato mandando e recebendo de áudio. Alimenta os medidores (mais
  // confiável que o analyser, que depende do AudioContext acordar) e vai pro servidor a cada 10s, pra
  // ler depois de um teste que "não funcionou" (chamadas.diag).
  async function colherRaioX() {
    const p = pc.current; if (!p) return
    try {
      const st = await p.getStats()
      const d: any = { estado: p.connectionState, ice: p.iceConnectionState }
      st.forEach((s: any) => {
        if (s.type === 'outbound-rtp' && s.kind === 'audio') Object.assign(d, { envBytes: s.bytesSent, envPacotes: s.packetsSent })
        if (s.type === 'media-source' && s.kind === 'audio') d.nivelMic = s.audioLevel ?? null
        if (s.type === 'inbound-rtp' && s.kind === 'audio') Object.assign(d, { recBytes: s.bytesReceived, recPacotes: s.packetsReceived, nivelRec: s.audioLevel ?? null, perdidos: s.packetsLost, ocultos: s.concealedSamples })
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') { const l = st.get(s.localCandidateId); d.via = l?.candidateType + (l?.relayProtocol ? '/' + l.relayProtocol : '') }
      })
      const fx = local.current?.getAudioTracks()[0]
      d.mic = fx ? { label: fx.label, enabled: fx.enabled, muted: fx.muted, estado: fx.readyState } : 'sem faixa local'
      const rem = remoto.current?.getAudioTracks()[0]
      d.remota = rem ? { enabled: rem.enabled, muted: rem.muted, estado: rem.readyState } : 'sem faixa remota'
      d.som = aRemoto.current ? { pausado: aRemoto.current.paused, pronto: aRemoto.current.readyState, mudo: aRemoto.current.muted, volume: aRemoto.current.volume } : null
      d.ctx = ctxMed.current?.state || null
      d.envio = p.getSenders().map(s => s.track ? `${s.track.kind}:${s.track.enabled ? 'on' : 'off'}:${s.track.muted ? 'muted' : 'ok'}` : 'vazio').join(' ')
      // os medidores preferem o nível medido pelo WebRTC quando ele existe
      if (typeof d.nivelMic === 'number') setNivelLocal(v => Math.max(v, Math.min(1, d.nivelMic * 6)))
      if (typeof d.nivelRec === 'number') setNivelRemoto(v => Math.max(v, Math.min(1, d.nivelRec * 6)))
      raioXn.current++
      if (raioXn.current % 2 === 1) post({ acao: 'diag', d })
      log('raio-x', JSON.stringify(d).slice(0, 300))
    } catch (e: any) { log('raio-x falhou', e?.message) }
  }
  function liberarSom() { tocarRemoto(); try { ctxMed.current?.resume() } catch { /* sem contexto */ } }

  function misturarNaGravacao(track: MediaStreamTrack) {
    if (!ctx.current || !misturador.current) return
    try { ctx.current.createMediaStreamSource(new MediaStream([track])).connect(misturador.current, 0, 1) } catch { /* já misturado */ }
  }

  async function desligar(avisar = true) {
    if (encerrouEu.current) return
    if (avisar) { encerrouEu.current = true; enviar({ t: 'sair' }) }
    clearInterval(timer.current); clearInterval(pronto.current); clearInterval(medidor.current); clearInterval(raioX.current); timer.current = null; medidor.current = null; raioX.current = null
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
  function alternarCamera() {
    const ts = local.current?.getVideoTracks() || []
    if (!ts.length) { ligarCamera(); return }
    const off = !camOff; setCamOff(off); ts.forEach(t => { t.enabled = !off })
  }
  // LIGAR A CÂMERA NO MEIO DA CHAMADA: entrou sem câmera, ou negou e mudou de ideia. Pede a autorização
  // de novo (o navegador pergunta outra vez, ou avisa se está bloqueada) e põe a câmera no lugar de
  // vídeo que a chamada já reservou — do outro lado ela aparece na hora.
  async function ligarCamera() {
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: await cameraFisica(), audio: false })
      const faixa = cam.getVideoTracks()[0]; if (!faixa) return
      const p = pc.current
      const lugar = p?.getTransceivers().find(tr => tr.receiver.track?.kind === 'video' && tr.mid !== null) || p?.getTransceivers().find(tr => tr.receiver.track?.kind === 'video')
      if (lugar) await lugar.sender.replaceTrack(faixa)
      else if (p) p.addTrack(faixa, local.current || new MediaStream([faixa]))
      if (!local.current) local.current = new MediaStream()
      local.current.getVideoTracks().forEach(t => { t.stop(); local.current?.removeTrack(t) })
      local.current.addTrack(faixa)
      setTemVideoLocal(true); setCamOff(false); setComVideo(true); setAviso('')
      if (vLocal.current) { vLocal.current.srcObject = local.current; vLocal.current.muted = true }
    } catch (e: any) { setAviso(`A câmera não foi liberada (${motivoMidia(e)}). ${comoLiberar()}`) }
  }
  // TELA CHEIA: no computador e no Android, a página inteira vira tela cheia. O Safari do iPhone não
  // deixa página em tela cheia: lá o vídeo do outro lado abre em tela cheia nativa; sem vídeo, o modo
  // imersivo esconde o cabeçalho (toque no palco traz de volta).
  async function alternarTelaCheia() {
    const doc: any = document
    try {
      if (doc.fullscreenElement) { await doc.exitFullscreen(); return }
      const el: any = palco.current
      if (el?.requestFullscreen) { await el.requestFullscreen(); return }
      const v: any = vRemoto.current
      if (v?.webkitEnterFullscreen && temVideoRemoto) { v.webkitEnterFullscreen(); return }
      setImersivo(x => !x)
    } catch { setImersivo(x => !x) }
  }
  async function listarMics() {
    try { const ds = await navigator.mediaDevices.enumerateDevices(); setMics(ds.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')) } catch { /* sem lista */ }
  }
  // TROCAR DE MICROFONE no meio da chamada: pega o novo, troca a faixa no envio (sem renegociar),
  // liga ele na gravação e no medidor. Foi o que faltou no teste de 27/09: o Chrome pegou o mic
  // virtual do NDI e não havia como escolher outro.
  async function trocarMic(id: string) {
    try {
      const novo = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO_BASE, deviceId: { exact: id } }, video: false })
      const faixa = novo.getAudioTracks()[0]; if (!faixa) return
      faixa.enabled = !mudo
      const s = pc.current?.getSenders().find(x => x.track?.kind === 'audio'); if (s) await s.replaceTrack(faixa)
      const antigas = local.current?.getAudioTracks() || []
      antigas.forEach(t => { t.stop(); local.current?.removeTrack(t) })
      local.current?.addTrack(faixa)
      if (ctx.current && misturador.current) { try { ctx.current.createMediaStreamSource(new MediaStream([faixa])).connect(misturador.current, 0, 0) } catch { /* já misturado */ } }
      micVersao.current++
      setMicId(id); setMicLabel(faixa.label); setAviso(''); setMicMenu(false); log('mic trocado', faixa.label)
    } catch (e: any) { setAviso(`Não consegui usar esse microfone: ${motivoMidia(e)}.`) }
  }
  // "Testar antes de entrar": pede a permissão, mostra o nível do microfone e a lista pra escolher.
  async function preparar() {
    setErro('')
    try { if (!ctxMed.current) ctxMed.current = new AudioContext(); ctxMed.current.resume().catch(() => null) } catch { /* sem medidor */ }
    const ok = await capturar(); if (!ok) return
    setPreparado(true); listarMics(); medirAudio()
  }
  function mudarCamera(ligada: boolean) {
    setComVideo(ligada)
    // já tinha testado: solta o que pegou pra pegar de novo do jeito novo
    if (preparado) { local.current?.getTracks().forEach(t => t.stop()); local.current = null; setPreparado(false); setTemVideoLocal(false); clearInterval(medidor.current); medidor.current = null }
  }

  // ─────────────────────────────────────────────────────────────── a tela
  const host = papel.current === 'host'
  const S: Record<string, React.CSSProperties> = {
    fundo: { minHeight: '100vh', background: 'var(--bg, #0B0A10)', color: 'var(--text, #fff)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'inherit' },
    card: { width: '100%', maxWidth: 520, background: 'var(--surface, #15121F)', border: '1px solid var(--border, #2A2540)', borderRadius: 22, padding: 26, boxShadow: '0 30px 80px rgba(0,0,0,.45)' },
    marca: { fontSize: 11.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-soft, #C9AAFF)' },
    h1: { fontSize: 27, fontWeight: 800, margin: '8px 0 0', lineHeight: 1.12, letterSpacing: '-.02em' },
    p: { fontSize: 14.5, color: 'var(--text-2, #C9C3D9)', lineHeight: 1.5, margin: '10px 0 0' },
    btn: { border: 'none', borderRadius: 14, padding: '15px 18px', fontSize: 16, fontWeight: 800, cursor: 'pointer', width: '100%' },
    btn2: { border: '1px solid var(--border-strong, #3A3452)', background: 'var(--surface-2, #1D1929)', color: 'var(--text, #fff)', borderRadius: 14, padding: '12px 16px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', width: '100%' },
    aviso: { width: '100%', maxWidth: 560, padding: '9px 12px', borderRadius: 12, background: 'rgba(245,184,46,.16)', color: '#F5B82E', fontSize: 13, backdropFilter: 'blur(8px)' },
    sel: { width: '100%', background: 'var(--surface-2, #1D1929)', color: 'var(--text, #fff)', border: '1px solid var(--border-strong, #3A3452)', borderRadius: 12, padding: '11px 12px', fontSize: 14, fontFamily: 'inherit' },
  }
  const micOk = !mudo && nivelLocal >= 0.04
  const somOk = nivelRemoto >= 0.04
  const Medidor = ({ rotulo, nivel, texto, ok }: { rotulo: string; nivel: number; texto: string; ok: boolean }) => (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-faint, #9A93AE)' }}><span>{rotulo}</span><span style={{ color: ok ? '#22C55E' : '#F5B82E', fontWeight: 700 }}>{texto}</span></div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.10)', marginTop: 5, overflow: 'hidden' }}><div style={{ width: Math.round(Math.min(1, nivel) * 100) + '%', height: '100%', background: ok ? '#22C55E' : '#F5B82E', transition: 'width .1s' }} /></div>
    </div>
  )

  if (fase === 'carregando') return <div style={S.fundo}><div style={{ color: 'var(--text-faint, #7E7793)' }}>Abrindo a chamada…</div></div>
  if (fase === 'invalida') return <div style={S.fundo}><div style={S.card}><MarcaTopo info={info} estilo={S.marca} /><h1 style={S.h1}>Esse link não abre uma chamada.</h1><p style={S.p}>Confere se copiou o link inteiro, ou pede um novo pra quem te convidou.</p></div><div style={{ opacity: .6, transform: 'scale(.92)' }}><AssinaturaCND escuro /></div></div>
  if (fase === 'encerrada') return <div style={S.fundo}><div style={S.card}><MarcaTopo info={info} estilo={S.marca} /><h1 style={S.h1}>Chamada encerrada.</h1><p style={S.p}>{seg ? `Duração: ${fmt(seg)}. ` : ''}{host ? 'A gravação está sendo transcrita e vai pro histórico do lead em alguns minutos.' : 'Obrigado pela conversa. Se precisar, é só chamar no WhatsApp.'}</p></div><div style={{ opacity: .6, transform: 'scale(.92)' }}><AssinaturaCND escuro /></div></div>

  if (fase === 'antes' || fase === 'erro') return (
    <div style={S.fundo}>
      <div style={S.card}>
        <MarcaTopo info={info} estilo={S.marca} />
        <h1 style={S.h1}>{host ? `Chamada com ${info?.com_quem}` : `${info?.com_quem} te convidou pra uma chamada`}</h1>
        <p style={S.p}>{comVideo ? 'Com vídeo e voz.' : 'Só voz, como uma ligação.'} Funciona aqui no navegador, sem instalar nada.</p>
        {host && <p style={{ ...S.p, fontSize: 13, color: 'var(--text-faint, #7E7793)' }}>A conversa será gravada e transcrita pro histórico do lead. Avise a pessoa.</p>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, fontSize: 14.5, color: 'var(--text-2, #C9C3D9)', cursor: 'pointer' }}>
          <input type="checkbox" checked={comVideo} onChange={e => mudarCamera(e.target.checked)} style={{ width: 18, height: 18 }} /> Entrar com a câmera ligada
        </label>

        {/* o teste antes de entrar: barra do microfone + escolha do aparelho + prévia da câmera */}
        {preparado ? (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 16, background: 'var(--surface-2, #1D1929)', border: '1px solid var(--border, #2A2540)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Medidor rotulo="Teu microfone" nivel={nivelLocal} texto={micOk ? 'captando' : 'fala algo…'} ok={micOk} />
            {mics.length > 0 && (
              <label style={{ fontSize: 12, color: 'var(--text-faint, #9A93AE)' }}>Microfone
                <select value={micId || mics.find(m => m.label === micLabel)?.deviceId || ''} onChange={e => trocarMic(e.target.value)} style={{ ...S.sel, marginTop: 5 }}>
                  {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microfone'}</option>)}
                </select>
              </label>
            )}
            {micLabel && !mics.length && <div style={{ fontSize: 12, color: 'var(--text-faint, #9A93AE)' }}>Usando: {micLabel}</div>}
            {temVideoLocal && <video ref={vLocal} autoPlay playsInline muted style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 12, transform: 'scaleX(-1)', background: '#000' }} />}
          </div>
        ) : (
          <button onClick={preparar} style={{ ...S.btn2, marginTop: 16 }}>Testar microfone{comVideo ? ' e câmera' : ''}</button>
        )}
        {aviso && <div style={{ ...S.aviso, marginTop: 12 }}>{aviso}</div>}
        {erro && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--red-bg, #3A1520)', color: 'var(--red, #F0475F)', fontSize: 13.5, lineHeight: 1.45 }}>{erro}</div>}
        <button onClick={entrar} style={{ ...S.btn, marginTop: 14, background: '#22C55E', color: '#06220f', boxShadow: '0 12px 30px rgba(34,197,94,.28)' }}>{fase === 'erro' ? 'Tentar de novo' : 'Entrar na chamada'}</button>
      </div>
      <div style={{ opacity: .6, transform: 'scale(.92)' }}><AssinaturaCND escuro /></div>
    </div>
  )

  // ── A CHAMADA: o outro lado ocupa a tela toda; o resto flutua por cima
  const statusTexto = fase === 'conectado' ? fmt(seg) : outroEntrou ? 'conectando…' : 'esperando'
  const statusSub = fase === 'conectado' ? (gravando ? 'gravando' : 'ao vivo') : outroEntrou ? 'o outro lado já entrou' : host ? (leadAbriu ? `${info?.com_quem} abriu o link` : 'aguardando o convidado abrir o link') : `aguardando ${info?.com_quem}`
  const primeiroNome = (info?.com_quem || '').split(' ')[0]
  return (
    <div ref={palco} onClick={() => { if (imersivo) setImersivo(false) }} style={{ position: 'fixed', inset: 0, background: '#07060B', color: '#fff', overflow: 'hidden', fontFamily: 'inherit', userSelect: 'none' }}>
      <video ref={vRemoto} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: temVideoRemoto ? 'block' : 'none' }} />
      <audio ref={aRemoto} autoPlay style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      {!temVideoRemoto && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(60% 50% at 50% 40%, rgba(101,34,214,.35), transparent 70%)' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-2, #C9C3D9)' }}>
            <div style={{ width: 132, height: 132, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #c026d3)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 54, fontWeight: 800, color: '#fff', boxShadow: '0 20px 60px rgba(124,58,237,.45)', animation: fase === 'conectado' && somOk ? 'pulsar 1.2s ease-in-out infinite' : 'none' }}>{(info?.com_quem || '?').trim()[0]?.toUpperCase()}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{info?.com_quem}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>{fase === 'conectado' ? 'Só voz do outro lado' : outroEntrou ? 'Conectando…' : host ? 'Chamando…' : `Esperando ${info?.com_quem || 'o outro lado'} entrar`}</div>
            {fase !== 'conectado' && fase === 'conectando' && (
              <div onClick={e => e.stopPropagation()} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                {host && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, textAlign: 'left', fontSize: 13.5, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '12px 16px', minWidth: 250 }}>
                    <Passo feito rotulo={`Convite enviado · esperando há ${fmt(esperaSeg)}`} />
                    <Passo feito={leadAbriu} rotulo={`${primeiroNome || 'O convidado'} abriu o link`} />
                    <Passo feito={outroEntrou} rotulo={`${primeiroNome || 'O convidado'} entrou`} />
                  </div>
                )}
                {host && !leadAbriu && esperaSeg >= 180 && (
                  <div style={{ fontSize: 13, color: '#fde68a', maxWidth: 300, lineHeight: 1.45 }}>
                    {primeiroNome || 'O convidado'} ainda não abriu o convite. O mesmo convite continua valendo: se precisar, avisa por mensagem que tu já está na chamada esperando.
                  </div>
                )}
                <button onClick={() => setSomEspera(v => !v)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.75)', border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', font: 'inherit' }}>{somEspera ? 'Som de chamando: ligado' : 'Som de chamando: desligado'}</button>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes pulsar { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }`}</style>

      {/* eu, no cantinho */}
      <video ref={vLocal} autoPlay playsInline muted style={{ position: 'absolute', top: imersivo ? 'calc(14px + env(safe-area-inset-top))' : 'calc(96px + env(safe-area-inset-top))', right: 14, width: 'min(28vw, 150px)', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 16, border: '2px solid rgba(255,255,255,.35)', boxShadow: '0 12px 34px rgba(0,0,0,.55)', transform: 'scaleX(-1)', background: '#000', display: temVideoLocal && !camOff ? 'block' : 'none', transition: 'top .2s' }} />

      {/* cabeçalho flutuante */}
      {!imersivo && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'calc(12px + env(safe-area-inset-top)) 16px 44px', background: 'linear-gradient(180deg, rgba(0,0,0,.62), transparent)', pointerEvents: 'none' }}>
          <MarcaTopo info={info} estilo={S.marca} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{info?.com_quem}</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#fff', opacity: .9 }}>{statusTexto}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(8px)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{gravando && fase === 'conectado' && <span style={{ width: 7, height: 7, borderRadius: 4, background: '#F0475F', boxShadow: '0 0 0 3px rgba(240,71,95,.3)' }} />}{statusSub}</span>
            {fase === 'conectado' && <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: micOk ? 'rgba(34,197,94,.22)' : 'rgba(245,184,46,.22)', color: micOk ? '#86efac' : '#fde68a', backdropFilter: 'blur(8px)' }}>mic {mudo ? 'desligado' : micOk ? 'captando' : 'não capta nada'}</span>}
            {fase === 'conectado' && <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: somOk ? 'rgba(34,197,94,.22)' : 'rgba(245,184,46,.22)', color: somOk ? '#86efac' : '#fde68a', backdropFilter: 'blur(8px)' }}>som {somOk ? 'chegando' : 'nada chegando'}</span>}
          </div>
        </div>
      )}

      {/* controles flutuantes */}
      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '48px 14px calc(14px + env(safe-area-inset-bottom))', background: 'linear-gradient(0deg, rgba(0,0,0,.66), transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {somBloqueado && <button onClick={liberarSom} style={{ ...S.btn, maxWidth: 560, background: '#6522D6', color: '#fff', boxShadow: '0 12px 30px rgba(101,34,214,.4)' }}>Toque aqui para ouvir o outro lado</button>}
        {aviso && <div style={S.aviso}>{aviso}</div>}
        {erro && <div style={{ ...S.aviso, background: 'rgba(240,71,95,.18)', color: '#fca5a5' }}>{erro}</div>}
        {micMenu && (
          <div style={{ width: '100%', maxWidth: 560, padding: 14, borderRadius: 16, background: 'rgba(20,16,30,.92)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(14px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <Medidor rotulo="Teu microfone" nivel={nivelLocal} texto={mudo ? 'desligado' : micOk ? 'captando' : 'não capta nada'} ok={micOk} />
              <Medidor rotulo="Som do outro lado" nivel={nivelRemoto} texto={somOk ? 'chegando' : 'nada chegando'} ok={somOk} />
            </div>
            <label style={{ fontSize: 12, color: 'var(--text-faint, #9A93AE)' }}>Microfone em uso{micLabel ? `: ${micLabel}` : ''}
              {mics.length > 0
                ? <select value={micId || mics.find(m => m.label === micLabel)?.deviceId || ''} onChange={e => trocarMic(e.target.value)} style={{ ...S.sel, marginTop: 5 }}>{mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microfone'}</option>)}</select>
                : <div style={{ marginTop: 5, fontSize: 12.5, color: '#fde68a' }}>O navegador não listou outros microfones.</div>}
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: 'clamp(8px, 3vw, 18px)', alignItems: 'flex-start', justifyContent: 'center' }}>
          <Redondo icone={mudo ? MicOff : Mic} rotulo={mudo ? 'Ativar mic' : 'Silenciar'} ativo={mudo} onClick={alternarMudo} />
          <Redondo icone={!temVideoLocal || camOff ? VideoOff : Video} rotulo={!temVideoLocal || camOff ? 'Ligar câmera' : 'Câmera'} ativo={!temVideoLocal || camOff} onClick={alternarCamera} />
          <Redondo icone={telaCheia || imersivo ? Minimize2 : Maximize2} rotulo={telaCheia || imersivo ? 'Sair da tela cheia' : 'Tela cheia'} onClick={alternarTelaCheia} />
          <Redondo icone={Settings2} rotulo="Áudio" ativo={micMenu} onClick={() => { listarMics(); setMicMenu(v => !v) }} />
          <Redondo icone={PhoneOff} rotulo={host ? 'Encerrar' : 'Sair'} perigo onClick={() => desligar(true)} />
        </div>
      </div>
    </div>
  )
}

// botão redondo dos controles da chamada
function Redondo({ icone: Icone, rotulo, onClick, ativo, perigo }: { icone: any; rotulo: string; onClick: () => void; ativo?: boolean; perigo?: boolean }) {
  return (
    <button onClick={onClick} aria-label={rotulo} title={rotulo} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', font: 'inherit', padding: 0, width: 'clamp(56px, 16vw, 76px)' }}>
      <span style={{ width: perigo ? 66 : 56, height: 56, borderRadius: 28, display: 'grid', placeItems: 'center', background: perigo ? '#F0475F' : ativo ? '#F5B82E' : 'rgba(255,255,255,.16)', color: ativo && !perigo ? '#1a1200' : '#fff', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.2)', boxShadow: perigo ? '0 10px 26px rgba(240,71,95,.4)' : '0 6px 18px rgba(0,0,0,.35)', transition: 'transform .1s' }}><Icone size={23} strokeWidth={2} /></span>
      <span style={{ fontSize: 11, fontWeight: 700, opacity: .92, textAlign: 'center', lineHeight: 1.15 }}>{rotulo}</span>
    </button>
  )
}

// o topo da tela: a LOGO da empresa (pedido do Nando, 28/09/2026 — o nome escrito parecia provisório);
// sem logo cadastrada, o nome em texto
function MarcaTopo({ info, estilo }: { info: any; estilo: React.CSSProperties }) {
  if (info?.logo) return <img src={info.logo} alt={info?.empresa || ''} style={{ height: 34, maxWidth: 190, objectFit: 'contain', display: 'block', borderRadius: 6, marginBottom: 4 }} />
  return <div style={estilo}>{info?.empresa || ''}</div>
}

// um passo da espera: bolinha verde quando aconteceu
function Passo({ feito, rotulo }: { feito?: boolean; rotulo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: feito ? '#fff' : 'rgba(255,255,255,.5)' }}>
      <span style={{ width: 18, height: 18, borderRadius: 9, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900, background: feito ? '#22C55E' : 'transparent', border: feito ? 'none' : '1.5px solid rgba(255,255,255,.35)', color: '#06220f', flexShrink: 0 }}>{feito ? '✓' : ''}</span>
      {rotulo}
    </div>
  )
}
