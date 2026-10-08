'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import AssinaturaCND from '@/components/AssinaturaCND'

// A REUNIÃO POR VÍDEO (veio da JamRock em 08/10/2026; lá nasceu em 29/09). Uma página pra todo mundo: o convidado abre
// /r/<codigo>; quem marcou (o anfitrião) abre com ?h=<chave>.
//
// Veio da chamada da Dani (1 com 1). Aqui cabe mais gente: cada navegador abre uma conexão com
// cada um dos outros (malha). Pra duas pontas não oferecerem ao mesmo tempo, quem tem o id MENOR
// oferece. Todo mundo se anuncia ("oi") a cada 5s: é assim que quem chega descobre quem já está, e
// quem some (fechou, caiu) é tirado da tela depois de 20s sem aviso.
//
// SALA DE ESPERA: quem abre o link bate na porta e espera o anfitrião liberar. Só conecta com quem
// o servidor diz que está dentro (lista de /api/reunioes/<codigo>, ação "estado").
//
// GRAVAÇÃO: cada pessoa grava SÓ O PRÓPRIO microfone, em pedaços de 20s (a gravação recomeça a
// cada pedaço, então cada um é um arquivo completo que dá pra transcrever sozinho, na hora). A
// fala sai com o nome certo, e as sugestões ao vivo do anfitrião se alimentam disso.

const ICE_RESERVA: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' },
]
const AUDIO_BASE: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
// "ESTOU DE FONE" (07/10): com fone não existe eco, então o navegador não precisa cortar a voz de quem chega
// enquanto a pessoa fala (era o "um fala e o outro some" da reunião da Mormaii). Sem fone, o corte do eco
// continua ligado, senão a sala inteira se ouve em eco. Igual ao "som original" do Zoom.
const AUDIO_FONE: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: true, autoGainControl: true }
const somCfg = (fone: boolean) => (fone ? AUDIO_FONE : AUDIO_BASE)
function foneSalvo() { try { return localStorage.getItem('rj-fone') === '1' } catch { return false } }
// microfone virtual = silêncio (o Chrome do Guto escolheu o do NDI no teste da Dani, 27/09)
const VIRTUAL = /ndi|obs|virtual|cable|voicemeeter|stereo mix|mixagem|loopback|what u hear|snap|xsplit|manycam|droidcam|camo/i
const PEDACO_MS = 20000

type Fase = 'carregando' | 'invalida' | 'entrada' | 'espera' | 'recusada' | 'sala' | 'saida' | 'encerrada'
type Sinal = { t: 'oi' | 'offer' | 'answer' | 'ice' | 'sair' | 'fim' | 'cam' | 'tela' | 'pedir-tela' | 'libera-tela' | 'ia' | 'mutar'; de: string; para?: string; sess: string; desde?: number; nome?: string; cam?: boolean; tela?: boolean; on?: boolean; sdp?: any; cand?: any }
type Par = { id: string; nome: string; sess: string; desde: number; pc: RTCPeerConnection; stream: MediaStream; fila: any[]; visto: number; cam: boolean; tela: boolean; ofertou: boolean; estado: string; an?: AnalyserNode }

// ícones (desenhados aqui: esta instalação não tem biblioteca de ícones)
const Ico = ({ size = 18, children }: { size?: number; children: React.ReactNode }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
const Mic = ({ size }: { size?: number }) => <Ico size={size}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Ico>
const MicOff = ({ size }: { size?: number }) => <Ico size={size}><path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2M15 10V6a3 3 0 0 0-6 0M5 11a7 7 0 0 0 11 5.7M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></Ico>
const Video = ({ size }: { size?: number }) => <Ico size={size}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></Ico>
const VideoOff = ({ size }: { size?: number }) => <Ico size={size}><path d="M3 3l18 18M16 16v1a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1m4 0h5a1 1 0 0 1 1 1v3.3l5-3.3v10" /></Ico>
const Sparkles = ({ size }: { size?: number }) => <Ico size={size}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Ico>
const Chat = ({ size }: { size?: number }) => <Ico size={size}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Ico>
const Tela = ({ size }: { size?: number }) => <Ico size={size}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4M9 9l3-3 3 3M12 6v6" /></Ico>
const Janela = ({ size }: { size?: number }) => <Ico size={size}><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" /></Ico>
const X = ({ size }: { size?: number }) => <Ico size={size}><path d="M6 6l12 12M18 6L6 18" /></Ico>

// links no chat viram clicáveis
function comLinks(t: string) {
  const partes = (t || '').split(/(https?:\/\/[^\s]+)/g)
  return partes.map((p, i) => /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : p)
}

const log = (...a: any[]) => console.log('[reuniao]', ...a)
const iniciais = (n: string) => (n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?'
const CORES = ['#4fb3a9', '#e0a83b', '#8c9eff', '#e86aa6', '#6cc0e5', '#b59cff', '#f08a4b']
const corDe = (id: string) => CORES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES.length]
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function motivoMidia(e: any) {
  const n = e?.name || ''
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'o navegador bloqueou'
  if (n === 'NotFoundError') return 'nenhum microfone encontrado neste aparelho'
  if (n === 'NotReadableError' || n === 'AbortError') return 'o microfone ou a câmera estão em uso por outro programa. Feche ele e tente de novo'
  return n || 'erro desconhecido'
}

// COMO LIBERAR câmera/microfone bloqueados, no aparelho de quem está vendo (veio da chamada da escola,
// 29/09): bloqueado uma vez, o navegador não pergunta sozinho, então "Tentar de novo" só adianta depois disto.
function comoLiberar() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua)) return 'Abra este link no navegador do celular (toque nos três pontinhos ou em compartilhar → Abrir no Safari/Chrome) e entre de novo.'
  if (/iPhone|iPad/i.test(ua)) return 'No iPhone: toque em "aA" na barra do endereço → Ajustes do Site → Câmera e Microfone → Permitir. Depois toque em Tentar de novo.'
  if (/Android/i.test(ua)) return 'No Android: toque no cadeado ao lado do endereço → Permissões → libere Câmera e Microfone. Depois toque em Tentar de novo.'
  return 'Clique no cadeado ao lado do endereço, libere Câmera e Microfone e tente de novo.'
}

// câmeras que aparecem na lista e não transmitem: virtuais e a INFRAVERMELHA do Windows Hello (a do PC
// do Rick "não respondia", 29/09). Abre a câmera sem desistir na primeira: a padrão, depois cada uma
// da lista. Só para de vez se a pessoa NEGOU a permissão.
const CAM_NAO_SERVE = /ndi|obs|virtual|snap|xsplit|manycam|droidcam|camo|\bir\b|infrared|infravermelh|windows hello/i
async function abrirCamera(): Promise<MediaStreamTrack> {
  const base: MediaTrackConstraints = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
  const tentativas: MediaTrackConstraints[] = [base]
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId && !CAM_NAO_SERVE.test(d.label || ''))
    for (const c of cams) tentativas.push({ deviceId: { exact: c.deviceId }, width: { ideal: 640 } })
  } catch { /* sem lista */ }
  let ultimo: any = null
  for (const v of tentativas) {
    try { const f = (await navigator.mediaDevices.getUserMedia({ video: v, audio: false })).getVideoTracks()[0]; if (f) return f }
    catch (e: any) { ultimo = e; if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') break }
  }
  throw ultimo || new Error('sem câmera')
}

export default function Reuniao({ params }: { params: Promise<{ codigo: string }> }) {
  const [codigo, setCodigo] = useState('')
  const [h, setH] = useState('')
  const [info, setInfo] = useState<any>(null)
  const [fase, setFase] = useState<Fase>('carregando')
  const [nome, setNome] = useState('')
  const [aceito, setAceito] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [temPrevia, setTemPrevia] = useState(false)
  const [mudo, setMudo] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [temCamera, setTemCamera] = useState(false)
  const [pares, setPares] = useState<Par[]>([])
  const [falando, setFalando] = useState('')
  const [euFalando, setEuFalando] = useState(false)
  const [esperando, setEsperando] = useState<{ id: string; nome: string }[]>([])
  const [somBloqueado, setSomBloqueado] = useState(false)
  const [seg, setSeg] = useState(0)
  const [sug, setSug] = useState<any>(null)
  const [sugAberta, setSugAberta] = useState(false)
  const [confirmarFim, setConfirmarFim] = useState(false)
  const [convite, setConvite] = useState(false)
  // A IA OUVINDO (30/09): o anfitrião liga quando a reunião começa de verdade. Desligada, ninguém grava
  // nem transcreve, e as sugestões param — a zoeira do começo não gasta crédito nem entra no resumo.
  const [iaOuvindo, setIaOuvindo] = useState(false)
  const [reaberta, setReaberta] = useState(false)       // na tela de fim: a reunião foi reaberta
  const [reabrindo, setReabrindo] = useState(false)
  const iaRef = useRef(false)
  // o chat (ideia do Rick, 29/09): todos escrevem e veem
  const [msgs, setMsgs] = useState<any[]>([])
  const [textoChat, setTextoChat] = useState('')
  const [naoLidas, setNaoLidas] = useState(0)
  const [lado, setLado] = useState<'sug' | 'chat'>('sug')      // a aba do painel do anfitrião
  const [chatAberto, setChatAberto] = useState(false)          // o painel do convidado (e o do celular)
  const chatVisivel = useRef(false)
  const listaChat = useRef<HTMLDivElement>(null)
  // apresentar a tela (slides, PDF, uma janela): só no computador
  const [apresentando, setApresentando] = useState(false)
  const [podeApresentar, setPodeApresentar] = useState(false)
  const tela = useRef<MediaStreamTrack | null>(null)
  const vTela = useRef<HTMLVideoElement>(null)
  // A JANELINHA (30/09, pedido do Nando: apresentar e continuar vendo a reunião). Uma janela flutuante,
  // sempre por cima, com a reunião dentro — no Chrome/Edge (Document Picture-in-Picture) vão os vídeos
  // de todos e os botões; nos outros, o vídeo de quem está falando (picture-in-picture do vídeo).
  const [pipWin, setPipWin] = useState<Window | null>(null)
  const [podePip, setPodePip] = useState<'' | 'doc' | 'video'>('')
  // o convidado PEDE pra apresentar e o anfitrião libera (pedido do Nando, 29/09)
  const [podeTela, setPodeTela] = useState(false)
  const [pediuTela, setPediuTela] = useState(false)
  const [pedidosTela, setPedidosTela] = useState<{ id: string; nome: string }[]>([])
  const [copiou, setCopiou] = useState('')

  const host = !!info?.host
  const eu = useRef<{ pessoa_id: string; token: string }>({ pessoa_id: '', token: '' })
  const local = useRef<MediaStream | null>(null)
  const vPrevia = useRef<HTMLVideoElement>(null)
  const vEu = useRef<HTMLVideoElement>(null)
  const canal = useRef<any>(null)
  const paresRef = useRef<Map<string, Par>>(new Map())
  const admitidos = useRef<Set<string>>(new Set())
  const sessao = useRef('')
  const ice = useRef<RTCIceServer[]>(ICE_RESERVA)
  const ac = useRef<AudioContext | null>(null)
  const anEu = useRef<AnalyserNode | null>(null)
  const gravando = useRef(false)
  const rec = useRef<MediaRecorder | null>(null)
  const timers = useRef<any[]>([])
  const ultimoEstado = useRef(0)
  const esperandoIds = useRef<Set<string>>(new Set())
  const saiu = useRef(false)
  // UMA ENTRADA SÓ POR VEZ (30/09, reunião da Mormaii): o Samuca entrou "em dobro" (a espera pediu o
  // estado duas vezes com a internet lenta e a sala foi iniciada duas vezes) — as conexões com ele
  // ficavam trocando de uma cópia pra outra e o som sumia. Agora a sala só inicia uma vez, e se a mesma
  // pessoa abrir em outra aba/aparelho, vale a entrada MAIS NOVA (`desde`) e a antiga sai.
  const salaIniciada = useRef(false)
  const desde = useRef(0)
  useEffect(() => {
    if (/iPhone|iPad|Android/i.test(navigator.userAgent)) return
    if ('documentPictureInPicture' in window) setPodePip('doc')
    else if ((document as any).pictureInPictureEnabled) setPodePip('video')
  }, [])
  useEffect(() => { setPodeApresentar(!!(typeof navigator !== 'undefined' && navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia) && !/iPhone|iPad|Android/i.test(navigator.userAgent)) }, [])
  // o que os intervalos leem (um setInterval guarda o valor do momento em que foi criado)
  const mudoRef = useRef(false), camOffRef = useRef(false), nomeRef = useRef('')
  const [fone, setFone] = useState(false), foneRef = useRef(false)
  useEffect(() => { const f = foneSalvo(); foneRef.current = f; setFone(f) }, [])
  useEffect(() => { mudoRef.current = mudo; camOffRef.current = camOff; nomeRef.current = nome.trim() }, [mudo, camOff, nome])

  const chaveLocal = () => `reuniao:${codigo}`
  const post = (body: any) => fetch(`/api/reunioes/${codigo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, h, pessoa_id: eu.current.pessoa_id, token: eu.current.token }) }).then(r => r.json()).catch(() => null)

  // ── abrir: quem é a reunião, e se este link é do anfitrião
  useEffect(() => {
    params.then(async ({ codigo }) => {
      const chave = new URLSearchParams(window.location.search).get('h') || ''
      setCodigo(codigo); setH(chave)
      const j = await fetch(`/api/reunioes/${codigo}${chave ? `?h=${encodeURIComponent(chave)}` : ''}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      if (!j?.ok) { setFase('invalida'); return }
      setInfo(j)
      iaRef.current = !!j.ia_ouvindo; setIaOuvindo(!!j.ia_ouvindo)
      document.title = `${j.titulo} · ${j.empresa}`
      try { const s = JSON.parse(sessionStorage.getItem(`reuniao:${codigo}`) || 'null'); if (s?.pessoa_id) { eu.current = { pessoa_id: s.pessoa_id, token: s.token }; setNome(s.nome || '') } } catch { /* sem memória */ }
      if (j.host) setNome(n => n || j.anfitriao || '')
      if ((j.status === 'encerrada' || j.status === 'resumida') && !j.host) { setFase('encerrada'); return }
      setFase('entrada')
    })
    return () => { limparTudo() }
  }, [])

  // NA TELA DE FIM: se o anfitrião reabrir, quem está aqui fica sabendo sozinho e pode entrar de novo
  useEffect(() => {
    if (fase !== 'encerrada' || host || !codigo) return
    setReaberta(false)
    const t = setInterval(async () => {
      const j = await fetch(`/api/reunioes/${codigo}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      if (j?.ok && (j.status === 'em_andamento' || j.status === 'marcada')) { setReaberta(true); tom([660, 880, 1100], 0.12) }
    }, 5000)
    return () => clearInterval(t)
  }, [fase, host, codigo])
  async function reabrir() {
    setReabrindo(true)
    const j = await fetch(`/api/reunioes/${codigo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'reabrir', h }) }).then(r => r.json()).catch(() => null)
    setReabrindo(false)
    if (!j?.ok) { setAviso('Não consegui reabrir. Confira a internet e tente de novo.'); return }
    setAviso(''); setFase('entrada')
  }

  // prévia da câmera na entrada (o navegador pede a permissão aqui, como no Meet)
  useEffect(() => { if (fase === 'entrada' && !local.current) capturar().catch(() => null) }, [fase])
  useEffect(() => {
    if (vPrevia.current && local.current) { vPrevia.current.srcObject = local.current; vPrevia.current.muted = true }
    if (vEu.current && local.current) { vEu.current.srcObject = local.current; vEu.current.muted = true }
  }, [fase, temPrevia, temCamera, camOff, pares.length])

  // fechou a aba: avisa os outros e sai da lista (o anfitrião que fecha NÃO encerra: pode ter só recarregado)
  useEffect(() => {
    const sair = () => {
      try { enviar({ t: 'sair' }) } catch { /* ok */ }
      if (!host && eu.current.pessoa_id) try { navigator.sendBeacon(`/api/reunioes/${codigo}`, new Blob([JSON.stringify({ acao: 'sair', pessoa_id: eu.current.pessoa_id, token: eu.current.token })], { type: 'application/json' })) } catch { /* ok */ }
    }
    window.addEventListener('pagehide', sair)
    return () => window.removeEventListener('pagehide', sair)
  }, [codigo, host])

  async function capturar(): Promise<boolean> {
    setErro('')
    let s: MediaStream
    try {
      try { s = await navigator.mediaDevices.getUserMedia({ audio: somCfg(foneRef.current), video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }) }
      catch (e: any) {
        s = await navigator.mediaDevices.getUserMedia({ audio: somCfg(foneRef.current), video: false })
        try { s.addTrack(await abrirCamera()) }
        catch { setAviso('Câmera indisponível agora. Você entra só com a voz e pode tocar em Ligar câmera depois.') }
      }
    } catch (e: any) { setErro(`Não consegui usar o microfone: ${motivoMidia(e)}. ${comoLiberar()}`); return false }
    // microfone virtual: troca pelo primeiro de verdade
    const f = s.getAudioTracks()[0]
    if (f && VIRTUAL.test(f.label)) {
      try {
        const reais = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.label && !VIRTUAL.test(d.label) && d.deviceId !== 'default' && d.deviceId !== 'communications')
        if (reais.length) {
          const nf = (await navigator.mediaDevices.getUserMedia({ audio: { ...somCfg(foneRef.current), deviceId: { exact: reais[0].deviceId } } })).getAudioTracks()[0]
          if (nf) { s.removeTrack(f); f.stop(); s.addTrack(nf) }
        }
      } catch { /* fica com o que veio */ }
    }
    local.current = s
    // CONVIDADO ENTRA MUDO (07/10), como no Meet: microfone aberto à toa com barulho de fundo cortava quem falava.
    // Liga no botão do microfone quando for falar. Quem conduz entra com o microfone ligado.
    if (!host) { s.getAudioTracks().forEach(t => { t.enabled = false }); mudoRef.current = true; setMudo(true) }
    setTemCamera(s.getVideoTracks().length > 0); setTemPrevia(true)
    return true
  }

  // LIGAR A CÂMERA DEPOIS (entrou sem, ou negou e mudou de ideia): pede de novo e põe no lugar de vídeo
  // que cada conexão já reservou — os outros veem na hora, sem renegociar (veio da escola, 29/09)
  async function ligarCamera() {
    try {
      const faixa = await abrirCamera()
      if (!local.current) local.current = new MediaStream()
      local.current.getVideoTracks().forEach(t => { t.stop(); local.current?.removeTrack(t) })
      local.current.addTrack(faixa)
      if (!tela.current) for (const p of paresRef.current.values()) { const tr = lugarDoVideo(p.pc); if (tr) await tr.sender.replaceTrack(faixa).catch(() => null) }
      setTemCamera(true); setCamOff(false); camOffRef.current = false; setAviso(''); setTemPrevia(true)
      if (fase === 'sala') enviar({ t: 'cam', cam: true })
    } catch (e: any) {
      const negou = e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      setAviso(negou ? `A câmera não foi liberada. ${comoLiberar()}` : `A câmera não respondeu (${motivoMidia(e)}). Feche o programa que está usando a câmera (Teams, Zoom, WhatsApp do computador, outra aba) e toque em Ligar câmera de novo.`)
    }
  }
  // troca o microfone pelo mesmo aparelho com o corte de eco ligado ou desligado (só na entrada, antes das conexões)
  async function marcarFone(f: boolean) {
    setFone(f); foneRef.current = f
    try { localStorage.setItem('rj-fone', f ? '1' : '0') } catch { /* ok */ }
    const s = local.current, velho = s?.getAudioTracks()[0]
    if (!s || !velho) return
    // o velho para ANTES: com ele aberto, o Chrome reaproveita o microfone com o ajuste antigo
    const dev = velho.getSettings().deviceId
    s.removeTrack(velho); velho.stop()
    let novo: MediaStreamTrack | undefined
    try { novo = (await navigator.mediaDevices.getUserMedia({ audio: { ...somCfg(f), ...(dev ? { deviceId: { exact: dev } } : {}) } })).getAudioTracks()[0] }
    catch { try { novo = (await navigator.mediaDevices.getUserMedia({ audio: somCfg(f) })).getAudioTracks()[0] } catch { /* abaixo */ } }
    if (!novo) { setErro('Não consegui reabrir o microfone. Recarregue a página.'); return }
    novo.enabled = !mudoRef.current
    s.addTrack(novo)
  }
  function alternarMudo() { const on = !mudo; setMudo(on); local.current?.getAudioTracks().forEach(t => { t.enabled = !on }) }
  function alternarCamera() {
    const ts = local.current?.getVideoTracks() || []
    if (!ts.length) { ligarCamera(); return }
    const off = !camOff; setCamOff(off); ts.forEach(t => { t.enabled = !off })
    if (fase === 'sala') enviar({ t: 'cam', cam: !off })
  }

  // ── entrar: bate na porta (o anfitrião entra direto)
  async function entrar() {
    if (!nome.trim()) { setErro('Digite seu nome.'); return }
    setErro(''); setEntrando(true); saiu.current = false
    try { if (!ac.current) ac.current = new AudioContext(); ac.current.resume().catch(() => null) } catch { /* sem medidor */ }
    if (!local.current) { const ok = await capturar(); if (!ok) { setEntrando(false); return } }
    const j = await post({ acao: 'bater', nome: nome.trim() })
    setEntrando(false)
    if (!j?.ok) { setErro(j?.error || 'Não consegui entrar. Confira a internet e tente de novo.'); return }
    if (j.status === 'encerrada') { setFase('encerrada'); return }
    eu.current = { pessoa_id: j.pessoa_id, token: j.token }
    try { sessionStorage.setItem(chaveLocal(), JSON.stringify({ pessoa_id: j.pessoa_id, token: j.token, nome: nome.trim() })) } catch { /* ok */ }
    if (j.status === 'dentro') iniciarSala()
    else if (j.status === 'recusada') setFase('recusada')
    else { setFase('espera'); esperarLiberar() }
  }

  function esperarLiberar() {
    let feito = false
    const t = setInterval(async () => {
      if (feito || salaIniciada.current) { clearInterval(t); return }
      const j = await post({ acao: 'estado' })
      if (!j?.ok || feito || salaIniciada.current) return
      if (j.reuniao === 'encerrada' || j.reuniao === 'resumida') { clearInterval(t); setFase('encerrada'); return }
      if (j.status === 'dentro') { feito = true; clearInterval(t); iniciarSala() }
      if (j.status === 'recusada') { clearInterval(t); setFase('recusada') }
    }, 2500)
    timers.current.push(t)
  }

  // ── a sala
  const enviar = (s: Omit<Sinal, 'de' | 'sess'>) => canal.current?.send({ type: 'broadcast', event: 'sinal', payload: { ...s, de: eu.current.pessoa_id, sess: sessao.current, desde: desde.current } })
  const anunciar = () => enviar({ t: 'oi', nome: nomeRef.current, cam: !camOffRef.current && (local.current?.getVideoTracks().length || 0) > 0, tela: !!tela.current })
  const atualizarTela = () => setPares([...paresRef.current.values()].sort((a, b) => a.nome.localeCompare(b.nome)))

  async function atualizarEstado(forcar = false) {
    if (!forcar && Date.now() - ultimoEstado.current < 1500) return
    ultimoEstado.current = Date.now()
    const j = await post({ acao: 'estado' })
    if (!j?.ok) return
    admitidos.current = new Set((j.dentro || []).map((p: any) => p.id))
    if (typeof j.ia === 'boolean' && j.ia !== iaRef.current) mudarIa(j.ia)
    if (!host && (j.reuniao === 'encerrada' || j.reuniao === 'resumida')) { sairDaSala('encerrada'); return }
    if (host) {
      const lista = j.esperando || []
      const novo = lista.some((p: any) => !esperandoIds.current.has(p.id))
      esperandoIds.current = new Set(lista.map((p: any) => p.id))
      if (novo) tom([880, 1320], 0.14)
      setEsperando(lista)
    }
    // quem não está mais dentro sai da tela
    for (const id of [...paresRef.current.keys()]) if (!admitidos.current.has(id)) fecharPar(id)
  }

  // ── ARRUMAÇÃO DOS QUADROS (07/10, celular): a sala escolhe quantas colunas usar pro tamanho da tela, como o
  // Meet (celular em pé, deitado, computador), e quando o vídeo teria corte grande (celular em pé num quadro
  // deitado, ou o contrário) mostra o vídeo inteiro. Antes, ao virar o celular, os rostos ficavam cortados.
  useEffect(() => {
    if (fase !== 'sala') return
    const ajustar = () => {
      const g = document.querySelector<HTMLElement>('.rj-grade'); if (!g) return
      if (g.classList.contains('tela')) { if (g.style.gridTemplateColumns) g.style.gridTemplateColumns = '' }
      else {
        const n = g.children.length, W = g.clientWidth, H = g.clientHeight
        const gap = parseFloat(getComputedStyle(g).columnGap) || 8
        let cols = 1, melhor = 0
        for (let c = 1; c <= n; c++) {
          const lin = Math.ceil(n / c), tw = (W - gap * (c - 1)) / c, th = (H - gap * (lin - 1)) / lin
          if (tw <= 0 || th <= 0) continue
          const vw = Math.min(tw, th * 4 / 3), area = vw * vw * 3 / 4
          if (area > melhor * 1.04) { melhor = area; cols = c }
        }
        const v = `repeat(${cols}, minmax(0, 1fr))`
        if (g.style.gridTemplateColumns !== v) g.style.gridTemplateColumns = v
      }
      g.querySelectorAll<HTMLVideoElement>('video').forEach(v => {
        if (v.classList.contains('rj-contain') || !v.videoWidth || !v.parentElement) return
        const vr = v.videoWidth / v.videoHeight, tr = v.parentElement.clientWidth / Math.max(1, v.parentElement.clientHeight)
        const corte = 1 - Math.min(vr, tr) / Math.max(vr, tr)
        const fit = corte > 0.3 ? 'contain' : ''
        if (v.style.objectFit !== fit) v.style.objectFit = fit
      })
    }
    ajustar()
    const t = setInterval(ajustar, 700)
    window.addEventListener('resize', ajustar); window.addEventListener('orientationchange', ajustar)
    return () => { clearInterval(t); window.removeEventListener('resize', ajustar); window.removeEventListener('orientationchange', ajustar) }
  }, [fase])

  // ── VOLTANDO DE UMA LIGAÇÃO (07/10): no celular, uma ligação pausa o som e às vezes fecha o microfone. Ao voltar,
  // o áudio dos outros vinha atrasado uns 30s (o acumulado tocando) e o microfone podia ter morrido. Agora, se a
  // página ficou escondida mais de 3s ou o microfone acabou, religa: zera o atraso de cada pessoa e reabre o microfone.
  useEffect(() => {
    if (fase !== 'sala') return
    let escondeu = 0
    const reabrirMic = async () => {
      try {
        const novo = (await navigator.mediaDevices.getUserMedia({ audio: somCfg(foneRef.current) })).getAudioTracks()[0]
        if (!novo) return
        novo.enabled = !mudoRef.current
        const s = local.current || (local.current = new MediaStream())
        s.getAudioTracks().forEach(t => { t.stop(); s.removeTrack(t) }); s.addTrack(novo)
        novo.addEventListener('ended', () => { reabrirMic() })
        for (const p of paresRef.current.values()) {
          const snd = p.pc.getSenders().find(x => x.track?.kind === 'audio')
          if (snd) await snd.replaceTrack(novo).catch(() => null)
        }
      } catch { setAviso('O microfone não voltou depois da ligação. Toque em Sair e entre de novo pelo link.') }
    }
    const religar = () => {
      try { ac.current?.resume() } catch { /* ok */ }
      document.querySelectorAll<HTMLAudioElement>('.rj-quadro audio').forEach(a => {
        const st = a.srcObject; a.srcObject = null; a.srcObject = st
        a.play().then(() => setSomBloqueado(false)).catch(() => setSomBloqueado(true))
      })
      const f = local.current?.getAudioTracks()[0]
      if (!f || f.readyState === 'ended') reabrirMic()
    }
    const vis = () => {
      if (document.visibilityState === 'hidden') { escondeu = Date.now(); return }
      if (escondeu && Date.now() - escondeu > 3000) religar()
      escondeu = 0
    }
    const f0 = local.current?.getAudioTracks()[0]
    const morreu = () => { if (document.visibilityState === 'visible') reabrirMic() }
    f0?.addEventListener('ended', morreu)
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('pageshow', vis)
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('pageshow', vis); f0?.removeEventListener('ended', morreu) }
  }, [fase])

  async function iniciarSala() {
    if (salaIniciada.current) return
    salaIniciada.current = true
    desde.current = Date.now()
    setFase('sala')
    sessao.current = Math.random().toString(36).slice(2, 10)
    try { const j = await fetch('/api/reunioes/ice', { cache: 'no-store' }).then(r => r.json()); if (j?.iceServers?.length) ice.current = j.iceServers } catch { /* reserva */ }
    await atualizarEstado(true)
    const c = supabase.channel(`reuniao:${codigo}`, { config: { broadcast: { self: false } } })
    canal.current = c
    c.on('broadcast', { event: 'sinal' }, ({ payload }: { payload: Sinal }) => { tratar(payload).catch(e => log('erro', e)) })
    c.on('broadcast', { event: 'chat' }, ({ payload }: any) => receberMensagem(payload))
    c.subscribe((st: string) => { log('canal', st); if (st === 'SUBSCRIBED') anunciar() })
    timers.current.push(setInterval(anunciar, 5000))
    timers.current.push(setInterval(() => atualizarEstado(true), 4000))
    timers.current.push(setInterval(() => {
      // sumiu há 20s (fechou sem avisar, caiu a internet): sai da tela
      for (const p of paresRef.current.values()) if (Date.now() - p.visto > 20000) fecharPar(p.id)
    }, 5000))
    timers.current.push(setInterval(() => setSeg(s => s + 1), 1000))
    carregarChat(); timers.current.push(setInterval(carregarChat, 10000))
    medir()
    gravar()
    if (host) { buscarSugestoes(); timers.current.push(setInterval(buscarSugestoes, 20000)) }
  }

  function criarPar(id: string, sess: string, nomeP: string, desdeP = 0): Par {
    fecharPar(id, false)
    const pc = new RTCPeerConnection({ iceServers: ice.current })
    const p: Par = { id, nome: nomeP || 'Convidado', sess, desde: desdeP, pc, stream: new MediaStream(), fila: [], visto: Date.now(), cam: true, tela: false, ofertou: false, estado: 'new' }
    // quem está apresentando manda a tela no lugar da câmera (também pra quem chega no meio)
    local.current?.getTracks().forEach(t => pc.addTrack(t.kind === 'video' && tela.current ? tela.current : t, local.current!))
    // LUGAR PRA VÍDEO MESMO SEM CÂMERA (a lição do Rick na escola, 29/09): sem isso, quem entra sem câmera
    // monta a conexão só com áudio e o vídeo dos outros não tem por onde passar
    if (!local.current?.getVideoTracks().length) {
      if (tela.current) pc.addTrack(tela.current, local.current || new MediaStream())
      else pc.addTransceiver('video', { direction: 'sendrecv' })
    }
    pc.ontrack = e => {
      p.stream.addTrack(e.track)
      if (e.track.kind === 'audio' && ac.current) { try { const an = ac.current.createAnalyser(); an.fftSize = 512; ac.current.createMediaStreamSource(new MediaStream([e.track])).connect(an); p.an = an } catch { /* sem medidor */ } }
      // o Safari não percebe faixa nova num stream já ligado: troca o objeto pra ele reler
      p.stream = new MediaStream(p.stream.getTracks())
      atualizarTela()
    }
    pc.onicecandidate = e => { if (e.candidate) enviar({ t: 'ice', para: id, cand: e.candidate.toJSON() }) }
    pc.onconnectionstatechange = () => { p.estado = pc.connectionState; log(p.nome, pc.connectionState); atualizarTela() }
    paresRef.current.set(id, p)
    atualizarTela()
    return p
  }
  function fecharPar(id: string, redesenhar = true) {
    const p = paresRef.current.get(id); if (!p) return
    try { p.pc.onconnectionstatechange = null; p.pc.ontrack = null; p.pc.onicecandidate = null; p.pc.close() } catch { /* ok */ }
    paresRef.current.delete(id)
    if (redesenhar) atualizarTela()
  }

  async function tratar(s: Sinal) {
    const me = eu.current.pessoa_id
    if (!s || (s.para && s.para !== me) || saiu.current) return
    // eu mesmo, noutra aba ou aparelho, entrando DEPOIS desta: esta aqui sai
    if (s.de === me) {
      if (s.t === 'oi' && s.sess !== sessao.current && (s.desde || 0) > desde.current) {
        setAviso('Você entrou nesta reunião em outra aba ou aparelho. Esta aqui foi desligada pra não ficar em dobro.')
        sairDaSala('saida')
      }
      return
    }
    // mensagem de uma entrada ANTIGA de alguém que já entrou de novo: ignora
    const conhecido = paresRef.current.get(s.de)
    if (conhecido && s.sess !== conhecido.sess && (s.desde || 0) < conhecido.desde) return
    if (s.t === 'fim') {
      const j = await fetch(`/api/reunioes/${codigo}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      if (j?.status === 'encerrada' || j?.status === 'resumida') sairDaSala('encerrada')
      return
    }
    if (s.t === 'sair') { fecharPar(s.de); return }
    if (s.t === 'cam') { const p = paresRef.current.get(s.de); if (p) { p.cam = !!s.cam; atualizarTela() } return }
    if (s.t === 'ia') { mudarIa(!!s.on); return }
    if (s.t === 'mutar') {
      mudoRef.current = true; setMudo(true); local.current?.getAudioTracks().forEach(t => { t.enabled = false })
      setAviso('Quem conduz silenciou o seu microfone. Toque no microfone quando for falar.'); return
    }
    if (s.t === 'tela') { const p = paresRef.current.get(s.de); if (p) { p.tela = !!s.on; atualizarTela() } return }
    if (s.t === 'pedir-tela') { if (host) { setPedidosTela(l => l.some(x => x.id === s.de) ? l : [...l, { id: s.de, nome: s.nome || 'Alguém' }]); tom([880, 1320], 0.14) } return }
    if (s.t === 'libera-tela') { setPediuTela(false); setPodeTela(!!s.on); if (s.on) setAviso('Liberado: toque em Apresentar pra mostrar a sua tela.'); else { setAviso('Quem conduz não liberou a apresentação agora.'); if (tela.current) pararApresentacao() } return }
    // só conversa com quem o anfitrião liberou
    if (!admitidos.current.has(s.de)) { await atualizarEstado(true); if (!admitidos.current.has(s.de)) return }

    if (s.t === 'oi') {
      let p = paresRef.current.get(s.de)
      const ruim = p && ['failed', 'closed'].includes(p.pc.connectionState)
      const novo = !p || p.sess !== s.sess || ruim
      if (novo) p = criarPar(s.de, s.sess, s.nome || '', s.desde || 0)
      p!.visto = Date.now(); p!.nome = s.nome || p!.nome; p!.cam = s.cam !== false; p!.tela = !!s.tela
      if (novo) { anunciar(); atualizarTela() }
      // quem tem o id menor oferece: nunca os dois ao mesmo tempo
      if (me < s.de && !p!.ofertou) {
        p!.ofertou = true
        const off = await p!.pc.createOffer(); await p!.pc.setLocalDescription(off)
        enviar({ t: 'offer', para: s.de, sdp: p!.pc.localDescription })
      }
    } else if (s.t === 'offer') {
      let p = paresRef.current.get(s.de)
      if (!p || p.sess !== s.sess || p.pc.remoteDescription) p = criarPar(s.de, s.sess, s.nome || p?.nome || '', s.desde || 0)
      p.visto = Date.now()
      await p.pc.setRemoteDescription(s.sdp)
      for (const c of p.fila) await p.pc.addIceCandidate(c).catch(() => null); p.fila = []
      // sem câmera agora, mas pode ligar depois: responde "posso mandar vídeo" mesmo assim
      p.pc.getTransceivers().forEach(tr => { if (tr.receiver.track?.kind === 'video' && tr.direction === 'recvonly') tr.direction = 'sendrecv' })
      const ans = await p.pc.createAnswer(); await p.pc.setLocalDescription(ans)
      enviar({ t: 'answer', para: s.de, sdp: p.pc.localDescription })
    } else if (s.t === 'answer') {
      const p = paresRef.current.get(s.de)
      if (p && p.sess === s.sess && p.pc.signalingState === 'have-local-offer') {
        await p.pc.setRemoteDescription(s.sdp)
        for (const c of p.fila) await p.pc.addIceCandidate(c).catch(() => null); p.fila = []
      }
    } else if (s.t === 'ice') {
      const p = paresRef.current.get(s.de); if (!p || p.sess !== s.sess) return
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(s.cand).catch(() => null); else p.fila.push(s.cand)
    }
  }

  // ── quem está falando (a moldura acende) e o meu nível
  function medir() {
    try {
      const a = ac.current || (ac.current = new AudioContext())
      if (a.state !== 'running') a.resume().catch(() => null)
      if (local.current?.getAudioTracks().length) { const an = a.createAnalyser(); an.fftSize = 512; a.createMediaStreamSource(local.current).connect(an); anEu.current = an }
      const buf = new Float32Array(512)
      const nivel = (an?: AnalyserNode | null) => { if (!an) return 0; an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); return m }
      // A MOLDURA DE QUEM FALA não pisca (30/09): acende só com voz clara (0,08) e fica acesa 900ms depois
      // da última fala. Antes acendia e apagava a cada oscilação do barulho perto do limite.
      let atual = '', ultimaFala = 0, euUltima = 0
      timers.current.push(setInterval(() => {
        const agora = Date.now()
        let melhor = '', max = 0.08
        for (const p of paresRef.current.values()) { const n = nivel(p.an); if (n > max) { max = n; melhor = p.id } }
        if (melhor) { ultimaFala = agora; if (melhor !== atual) { atual = melhor; setFalando(melhor) } }
        else if (atual && agora - ultimaFala > 900) { atual = ''; setFalando('') }
        if (!mudoRef.current && nivel(anEu.current) > 0.08) { euUltima = agora; setEuFalando(true) }
        else if (agora - euUltima > 900) setEuFalando(false)
      }, 200))
    } catch { /* sem medidor */ }
  }

  // ── a gravação: só o meu microfone, em pedaços completos de 20s
  function gravar() {
    const faixa = local.current?.getAudioTracks()[0]
    if (!faixa || typeof MediaRecorder === 'undefined') return
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || ''
    gravando.current = true
    const proximo = () => {
      if (!gravando.current) return
      // IA desligada: não grava; confere de novo daqui a pouco
      if (!iaRef.current) { setTimeout(proximo, 1500); return }
      let r: MediaRecorder
      try { r = new MediaRecorder(new MediaStream([local.current?.getAudioTracks()[0] || faixa]), mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined) } catch { return }
      const partes: Blob[] = [], t0 = Date.now()
      r.ondataavailable = e => { if (e.data?.size) partes.push(e.data) }
      r.onstop = () => {
        const blob = new Blob(partes, { type: r.mimeType || mime || 'audio/webm' })
        if (blob.size > 800) {
          const fd = new FormData()
          fd.append('acao', 'pedaco'); fd.append('pessoa_id', eu.current.pessoa_id); fd.append('token', eu.current.token)
          fd.append('t0', String(t0)); fd.append('agora', String(Date.now())); fd.append('mime', blob.type); fd.append('arquivo', blob, 'p')
          fetch(`/api/reunioes/${codigo}`, { method: 'POST', body: fd }).catch(() => null)
        }
        proximo()
      }
      r.start(); rec.current = r
      setTimeout(() => { if (r.state !== 'inactive') r.stop() }, PEDACO_MS)
    }
    proximo()
  }
  // liga/desliga pra todo mundo: cada um para ou volta a gravar o próprio microfone
  function mudarIa(on: boolean) {
    iaRef.current = on; setIaOuvindo(on)
    if (!on && rec.current && rec.current.state !== 'inactive') rec.current.stop()
  }
  async function alternarIa() {
    const on = !iaRef.current
    mudarIa(on)
    const j = await post({ acao: 'ia', on })
    if (!j?.ok) { mudarIa(!on); setAviso('Não consegui mudar a IA agora. Tente de novo.'); return }
    enviar({ t: 'ia', on })
    if (on) setTimeout(buscarSugestoes, 25000)
  }
  async function pararGravacao() {
    gravando.current = false
    const r = rec.current
    if (r && r.state !== 'inactive') await new Promise<void>(res => { const antes = r.onstop; r.onstop = (e: any) => { (antes as any)?.call(r, e); res() }; r.stop() })
    rec.current = null
  }

  // ── sugestões ao vivo (só o anfitrião)
  async function buscarSugestoes() {
    if (!iaRef.current) return
    const j = await fetch(`/api/reunioes/${codigo}/sugestoes?h=${encodeURIComponent(h)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    if (j?.ok) setSug(j)
    else if (j?.error) setSug((s: any) => s && !s.erro ? s : { erro: 'As sugestões não responderam agora. Tento de novo em instantes.' })
  }

  async function liberar(id: string, sim: boolean) {
    setEsperando(l => l.filter(p => p.id !== id))
    await post({ acao: sim ? 'liberar' : 'recusar', alvo: id })  // o anfitrião se prova pela chave
    atualizarEstado(true)
  }

  function limparTudo() {
    salaIniciada.current = false
    timers.current.forEach(t => clearInterval(t)); timers.current = []
    for (const id of [...paresRef.current.keys()]) fecharPar(id, false)
    if (canal.current) { try { supabase.removeChannel(canal.current) } catch { /* ok */ } canal.current = null }
  }
  async function sairDaSala(destino: 'saida' | 'encerrada') {
    if (saiu.current) return
    saiu.current = true
    enviar({ t: 'sair' })
    if (tela.current) { tela.current.onended = null; tela.current.stop(); tela.current = null; setApresentando(false) }
    await pararGravacao()
    limparTudo()
    local.current?.getTracks().forEach(t => t.stop()); local.current = null; setTemPrevia(false)
    setPares([]); setFase(destino)
  }
  async function sair() {
    await post({ acao: 'sair' })
    sairDaSala('saida')
  }
  async function encerrarParaTodos() {
    setConfirmarFim(false)
    await pararGravacao()
    await post({ acao: 'encerrar' })
    enviar({ t: 'fim' })
    sairDaSala('encerrada')
  }

  // o lugar de vídeo de uma conexão (o negociado primeiro)
  const lugarDoVideo = (pc: RTCPeerConnection) => pc.getTransceivers().find(t => t.receiver.track?.kind === 'video' && t.mid !== null) || pc.getTransceivers().find(t => t.receiver.track?.kind === 'video')

  // ── APRESENTAR A TELA: troca a câmera pela tela em cada conexão (sem renegociar). Todos veem grande.
  function pedirTela() { setPediuTela(true); enviar({ t: 'pedir-tela', nome: nomeRef.current }) }
  function responderTela(id: string, sim: boolean) { setPedidosTela(l => l.filter(x => x.id !== id)); enviar({ t: 'libera-tela', para: id, on: sim }) }
  // abre a janelinha; no Chrome, a reunião inteira vai pra dentro dela (o desenho está em `janelinha`, lá embaixo)
  async function abrirJanelinha() {
    if (pipWin && !pipWin.closed) { pipWin.focus(); return pipWin }
    if (podePip === 'doc') {
      try {
        const w: Window = await (window as any).documentPictureInPicture.requestWindow({ width: 300, height: 560 })
        const st = w.document.createElement('style'); st.textContent = CSS + CSS_JANELINHA; w.document.head.appendChild(st)
        w.document.title = 'Reunião'
        w.addEventListener('pagehide', () => setPipWin(null))
        setPipWin(w); return w
      } catch { setAviso('Não consegui abrir a janelinha neste navegador.') }
    } else if (podePip === 'video') {
      const alvo = document.querySelector<HTMLVideoElement>('.rj-quadro.falando video') || document.querySelector<HTMLVideoElement>('.rj-quadro:not(.rj-eu) video')
      if (!alvo) { setAviso('Neste navegador a janelinha mostra o vídeo de quem está falando, e ninguém está com a câmera ligada agora.'); return null }
      try { await (alvo as any).requestPictureInPicture() } catch { setAviso('Não consegui abrir a janelinha neste navegador.') }
    }
    return null
  }
  useEffect(() => { if (fase !== 'sala' && pipWin && !pipWin.closed) pipWin.close() }, [fase, pipWin])

  async function apresentar() {
    if (tela.current) { pararApresentacao(); return }
    if (!host && !podeTela) { pedirTela(); return }
    // no Chrome, o 1º toque abre a janelinha com o botão "Escolher o que apresentar": assim a reunião fica
    // flutuando por cima enquanto se mexe no documento
    if (podePip === 'doc' && (!pipWin || pipWin.closed)) { await abrirJanelinha(); return }
    try {
      const s = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 15 }, audio: false })
      const faixa: MediaStreamTrack = s.getVideoTracks()[0]; if (!faixa) return
      try { (faixa as any).contentHint = 'detail' } catch { /* ok */ }
      tela.current = faixa
      faixa.onended = () => pararApresentacao()     // o "Parar de compartilhar" do próprio navegador
      for (const p of paresRef.current.values()) { const tr = lugarDoVideo(p.pc); if (tr) await tr.sender.replaceTrack(faixa).catch(() => null) }
      setApresentando(true); enviar({ t: 'tela', on: true })
    } catch (e: any) {
      // o toque veio da janelinha e o navegador não deixou abrir a escolha de tela por ela
      if (e?.name === 'InvalidStateError') { setAviso('Toque em Apresentar na tela da reunião pra escolher o que mostrar. A janelinha continua aberta.'); return }
      if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') setAviso('Não consegui apresentar a tela neste navegador. Use o Chrome, o Edge ou o Safari no computador.')
    }
  }
  function pararApresentacao() {
    const faixa = tela.current; if (!faixa) return
    tela.current = null; faixa.onended = null; faixa.stop()
    const cam = local.current?.getVideoTracks()[0] || null
    for (const p of paresRef.current.values()) { const tr = lugarDoVideo(p.pc); if (tr) tr.sender.replaceTrack(cam).catch(() => null) }
    setApresentando(false); enviar({ t: 'tela', on: false })
  }
  useEffect(() => { if (vTela.current && tela.current) { const ms = new MediaStream([tela.current]); if ((vTela.current.srcObject as any)?.getVideoTracks?.()[0] !== tela.current) vTela.current.srcObject = ms } }, [apresentando, pares.length])

  // ── O CHAT
  async function carregarChat() { const j = await post({ acao: 'mensagens' }); if (j?.ok) setMsgs(m => j.mensagens.length >= m.length ? j.mensagens : m) }
  function receberMensagem(m: any) {
    if (!m?.id) return
    setMsgs(l => l.some(x => x.id === m.id) ? l : [...l, m])
    if (!chatVisivel.current && m.pessoa_id !== eu.current.pessoa_id) { setNaoLidas(n => n + 1); tom([1046], 0.09) }
  }
  async function enviarChat() {
    const t = textoChat.trim(); if (!t) return
    setTextoChat('')
    const j = await post({ acao: 'mensagem', texto: t })
    if (!j?.ok) { setTextoChat(t); setAviso('A mensagem não foi. Confira a internet e tente de novo.'); return }
    receberMensagem(j.mensagem)
    canal.current?.send({ type: 'broadcast', event: 'chat', payload: j.mensagem })
  }
  useEffect(() => { listaChat.current?.scrollTo({ top: 1e9 }) }, [msgs.length, lado, chatAberto])

  // CONVIDAR COM A REUNIÃO ROLANDO (só o anfitrião): o mesmo convite da tela Reuniões — foto em alta
  // com o texto e o link. No celular abre o compartilhar; no computador copia o texto e baixa a foto.
  const linkConvidado = () => `${window.location.origin}/r/${codigo}`
  const textoConvite = () => `Oi! Segue o link da nossa reunião sobre ${info?.titulo || 'o assunto'}. É só tocar no link e entrar, sem instalar nada.\n\n${linkConvidado()}`
  async function copiarTexto(txt: string, qual: string) {
    try { await navigator.clipboard.writeText(txt); setCopiou(qual); setTimeout(() => setCopiou(''), 2500) } catch { window.prompt('Copie:', txt) }
  }
  async function mandarFoto() {
    const txt = textoConvite()
    try { await navigator.clipboard.writeText(txt) } catch { /* segue */ }
    try {
      const blob = await fetch(`/r/${codigo}/convite-foto`).then(x => x.blob())
      const arq = new File([blob], `convite-carreiranodigital-${codigo}.png`, { type: 'image/png' })
      const nav: any = navigator
      if (nav.canShare && nav.canShare({ files: [arq] })) { await nav.share({ files: [arq], text: txt }); return }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = arq.name; a.click()
      setCopiou('foto'); setTimeout(() => setCopiou(''), 6000)
    } catch { /* cancelou */ }
  }

  function tom(freqs: number[], dur: number) {
    const a = ac.current; if (!a) return
    try {
      freqs.forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + i * dur
        o.frequency.value = f; o.connect(g); g.connect(a.destination)
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.08, t0 + 0.03); g.gain.linearRampToValueAtTime(0, t0 + dur)
        o.start(t0); o.stop(t0 + dur + 0.02)
      })
    } catch { /* sem som */ }
  }

  // ─────────────────────────────────────────── a tela
  const empresa = info?.empresa || 'Carreira no Digital'
  const quandoTxt = info?.quando ? new Date(info.quando).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : ''
  const primeiro = (nome || '').trim().split(' ')[0]

  // A FAIXA DO TOPO. É uma função que devolve a faixa, NÃO um componente declarado aqui dentro: como
  // componente, ele nascia de novo a cada segundo (o relógio atualiza a tela) e o logo e o letreiro
  // eram remontados e recarregados toda hora — piscavam e apareciam pixelados (Nando, 29/09).
  const barra = (direita?: React.ReactNode) => (
    <div className="rj-barra">
      <img src="/logo-menu.png" alt="Carreira no Digital" className="rj-marca" width={88} height={32} decoding="async" />
      <div className="rj-dir">{direita}</div>
    </div>
  )

  const estilo = <style>{CSS}</style>

  if (fase === 'carregando') return <div className="rj">{estilo}<div className="rj-centro"><p className="rj-p">Abrindo a reunião…</p></div></div>
  if (fase === 'invalida') return (
    <div className="rj">{estilo}{barra()}<div className="rj-centro"><div className="rj-card"><h1 className="rj-h1">Esse link não abre uma reunião.</h1><p className="rj-p">Confira se copiou o link inteiro, ou peça um novo pra quem te convidou.</p><AssinaturaCND escuro /></div></div></div>
  )

  if (fase === 'entrada') return (
    <div className="rj">{estilo}{barra()}
      <div className="rj-centro">
        <div className="rj-card">
          <h1 className="rj-h1">{info?.titulo}</h1>
          <p className="rj-p">{host ? 'Você conduz esta reunião. Quem abrir o link espera você liberar a entrada.' : `${info?.apresentacao || `Reunião com a ${empresa}`}${quandoTxt ? ` · ${quandoTxt}` : ''}`}</p>
          <div className="rj-previa">
            {temPrevia && temCamera && !camOff
              ? <video ref={vPrevia} autoPlay playsInline muted className="rj-video rj-espelho" />
              : <span className="rj-av rj-av-g" style={{ background: '#2c2728' }}>{iniciais(nome)}</span>}
            <div className="rj-previa-ctl">
              <button type="button" className={`rj-redondo-btn ${mudo ? 'off' : ''}`} onClick={alternarMudo} aria-label="Microfone">{mudo ? <MicOff size={17} /> : <Mic size={17} />}</button>
              <button type="button" className={`rj-redondo-btn ${camOff || !temCamera ? 'off' : ''}`} onClick={alternarCamera} aria-label={temCamera ? 'Câmera' : 'Ligar câmera'}>{camOff || !temCamera ? <VideoOff size={17} /> : <Video size={17} />}</button>
            </div>
          </div>
          <input className="rj-input" id="rj-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" aria-label="Seu nome" maxLength={60} />
          <label className="rj-consent rj-fone"><input type="checkbox" checked={fone} onChange={e => marcarFone(e.target.checked)} /><span><b>🎧 Marque só se você está usando fone de ouvido.</b><br />Está ouvindo pelo som do computador ou do celular, sem fone? Então <b>não marque</b>, senão os outros vão ouvir eco.</span></label>
          <p className="rj-dica">Se estiverem na mesma sala, entrem por um aparelho só.</p>
          {!host && <label className="rj-consent"><input type="checkbox" checked={aceito} onChange={e => setAceito(e.target.checked)} /><span>{info?.apresentacao ? 'Esta reunião será gravada para registro do que foi combinado.' : `Esta reunião será gravada pela ${empresa} para registro do que foi combinado.`}</span></label>}
          {aviso && <div className="rj-aviso">{aviso}</div>}
          {erro && <div className="rj-erro">{erro}{!temPrevia && <> <button type="button" className="rj-link" onClick={() => capturar()}>Tentar de novo</button></>}</div>}
          <button type="button" className="rj-btn" disabled={entrando || !nome.trim() || (!host && !aceito)} onClick={entrar}>{entrando ? 'Entrando…' : host ? 'Abrir a reunião' : 'Entrar na reunião'}</button>
          <AssinaturaCND escuro />
        </div>
      </div>
    </div>
  )

  if (fase === 'espera') return (
    <div className="rj">{estilo}{barra()}
      <div className="rj-centro"><div className="rj-card">
        <div className="rj-espera"><span className="rj-av" style={{ background: '#4fb3a9' }}>{iniciais(nome)}</span><span className="rj-pontos"><i /><i /><i /></span></div>
        <h1 className="rj-h1">Aguardando {info?.anfitriao || 'quem convidou'} liberar sua entrada</h1>
        <p className="rj-p">Você entra assim que ele aceitar. Pode deixar esta tela aberta.</p>
        <AssinaturaCND escuro />
      </div></div>
    </div>
  )

  if (fase === 'recusada') return (
    <div className="rj">{estilo}{barra()}
      <div className="rj-centro"><div className="rj-card"><h1 className="rj-h1">Sua entrada não foi liberada.</h1><p className="rj-p">Se achar que foi engano, fale com {info?.anfitriao || 'quem te convidou'}.</p><AssinaturaCND escuro /></div></div>
    </div>
  )

  if (fase === 'saida' || fase === 'encerrada') return (
    <div className="rj">{estilo}{barra()}
      <div className="rj-centro"><div className="rj-card">
        <h1 className="rj-h1 rj-grande">{primeiro ? `Valeu, ${primeiro}` : 'Valeu!'}</h1>
        <p className="rj-p">{host && fase === 'encerrada' ? 'Reunião encerrada. O resumo, as objeções e o que cada pessoa falou ficam prontos no sistema em alguns minutos.' : fase === 'encerrada' ? (reaberta ? `${info?.anfitriao || 'Quem convidou'} reabriu a reunião.` : 'A reunião terminou. Se ela for reaberta, esta tela avisa.') : 'Você saiu da reunião. Pode fechar esta janela.'}</p>
        {fase === 'saida' && <button type="button" className="rj-btn2" onClick={() => { setFase('entrada') }}>Voltar pra reunião</button>}
        {!host && fase === 'encerrada' && reaberta && <button type="button" className="rj-btn" onClick={() => setFase('entrada')}>Entrar de novo</button>}
        {host && fase === 'encerrada' && <>
          <button type="button" className="rj-btn" disabled={reabrindo} onClick={reabrir}>{reabrindo ? 'Reabrindo…' : 'Reabrir a reunião'}</button>
          <p className="rj-p rj-pq">Encerrou sem querer? Reabra: o link continua o mesmo, quem já estava entra de novo sem esperar, e o resumo é refeito no fim.</p>
          <a className="rj-btn2" href="/dashboard/reunioes">Abrir Reuniões no sistema</a>
        </>}
        {aviso && <div className="rj-aviso">{aviso}</div>}
        <AssinaturaCND escuro />
      </div></div>
    </div>
  )

  // ── A JANELINHA: a reunião em miniatura, dentro da janela flutuante (portal: os mesmos vídeos e botões)
  const abs = (u: string) => (typeof window !== 'undefined' ? window.location.origin : '') + u
  const janelinha = pipWin && !pipWin.closed && fase === 'sala' ? createPortal(
    <div className="rj rj-mini">
      <div className="mini-topo"><img src={abs('/logo-menu.png')} alt="" /><span>{pares.length + 1} {pares.length ? 'pessoas' : 'pessoa'} · {fmt(seg)}</span>{apresentando && <b className="mini-ao-vivo">apresentando</b>}</div>
      <div className="mini-lista">
        {pares.map(p => (
          <div key={p.id} className={`rj-quadro mini-q ${falando === p.id ? 'falando' : ''}`} style={{ ['--c' as any]: corDe(p.id) }}>
            {(p.cam || p.tela) && p.stream.getVideoTracks().length > 0
              ? <video autoPlay playsInline muted className={`rj-video ${p.tela ? 'rj-contain' : ''}`} ref={el => { if (el && el.srcObject !== p.stream) { el.srcObject = p.stream; el.play().catch(() => null) } }} />
              : <span className="rj-av rj-av-g" style={{ background: corDe(p.id) }}>{iniciais(p.nome)}</span>}
            <div className="rj-nome">{p.nome.split(' ')[0]}</div>
          </div>
        ))}
        <div className={`rj-quadro mini-q ${euFalando ? 'falando' : ''}`} style={{ ['--c' as any]: '#7c3aed' }}>
          {temCamera && !camOff && local.current?.getVideoTracks()[0]
            ? <video autoPlay playsInline muted className="rj-video rj-espelho" ref={el => { const f = local.current?.getVideoTracks()[0]; if (el && f && (el.srcObject as any)?.getVideoTracks?.()[0] !== f) { el.srcObject = new MediaStream([f]); el.play().catch(() => null) } }} />
            : <span className="rj-av rj-av-g" style={{ background: '#7c3aed' }}>{iniciais(nome)}</span>}
          <div className="rj-nome">Você{mudo && ' · sem som'}</div>
        </div>
      </div>
      {!apresentando && (host || podeTela) && <button type="button" className="rj-btn mini-apresentar" onClick={apresentar}>Escolher o que apresentar</button>}
      <div className="mini-botoes">
        <button type="button" className={`rj-redondo-btn g ${mudo ? 'off' : ''}`} onClick={alternarMudo} aria-label="Microfone">{mudo ? <MicOff size={17} /> : <Mic size={17} />}</button>
        <button type="button" className={`rj-redondo-btn g ${camOff || !temCamera ? 'off' : ''}`} onClick={alternarCamera} aria-label="Câmera">{camOff || !temCamera ? <VideoOff size={17} /> : <Video size={17} />}</button>
        {apresentando && <button type="button" className="rj-redondo-btn g on" onClick={pararApresentacao} aria-label="Parar de apresentar" title="Parar de apresentar"><Tela size={17} /></button>}
        <button type="button" className="rj-redondo-btn g" onClick={() => { window.focus(); pipWin.close() }} aria-label="Voltar pra reunião" title="Fechar a janelinha e voltar pra reunião"><X size={17} /></button>
      </div>
    </div>, pipWin.document.body) : null

  // ── NA REUNIÃO
  const apresentador = apresentando ? 'eu' : (pares.find(p => p.tela)?.id || '')
  chatVisivel.current = host ? (lado === 'chat') : chatAberto
  const comLado = host || chatAberto
  const n = pares.length + 1
  const conectando = (p: Par) => p.estado !== 'connected'
  return (
    <div className="rj rj-sala">{estilo}{janelinha}
      {barra(<>{host && <button type="button" className={`rj-ia ${iaOuvindo ? 'on' : ''}`} onClick={alternarIa} title={iaOuvindo ? 'A IA está transcrevendo e sugerindo. Toque pra pausar.' : 'A IA está pausada: nada é transcrito. Toque pra ligar.'}><i />{iaOuvindo ? 'IA ouvindo' : 'IA pausada'}</button>}{host && <button type="button" className="rj-convidar" onClick={() => setConvite(v => !v)}>+ Convidar</button>}<span className="rj-conta">{n} {n === 1 ? 'pessoa' : 'pessoas'}</span><span className="rj-relogio">{fmt(seg)}</span></>)}
      {host && convite && (
        <div className="rj-convite">
          <div className="rj-convite-h"><b>Convidar pra esta reunião</b><button type="button" className="rj-fechar" style={{ display: 'block' }} onClick={() => setConvite(false)} aria-label="Fechar"><X size={16} /></button></div>
          <code>{typeof window !== 'undefined' ? linkConvidado() : ''}</code>
          <div className="rj-convite-b">
            <button type="button" className="rj-mini rj-mini-ok" onClick={mandarFoto}>Mandar foto + convite</button>
            <button type="button" className="rj-mini" onClick={() => copiarTexto(textoConvite(), 'texto')}>{copiou === 'texto' ? 'Texto copiado' : 'Copiar texto'}</button>
            <button type="button" className="rj-mini" onClick={() => copiarTexto(linkConvidado(), 'link')}>{copiou === 'link' ? 'Link copiado' : 'Copiar link'}</button>
          </div>
          {copiou === 'foto' && <p className="rj-p rj-pq" style={{ color: '#57c28a' }}>Foto baixada e texto copiado. No WhatsApp, mande a foto e cole o texto na legenda.</p>}
          <p className="rj-p rj-pq">Quem abrir o link cai na sala de espera e aparece aqui pra você liberar.</p>
        </div>
      )}
      <div className={`rj-meio ${comLado ? 'com-sug' : ''}`}>
        <div className="rj-palco">
          {host && (esperando.length > 0 || pedidosTela.length > 0) && (
            <div className="rj-batidas">
              {pedidosTela.map(p => (
                <div key={'t' + p.id} className="rj-batida">
                  <span className="rj-av rj-av-p" style={{ background: '#3a3435' }}><Tela size={14} /></span>
                  <span className="rj-batida-t"><b>{p.nome}</b> pediu pra apresentar a tela</span>
                  <button type="button" className="rj-mini" onClick={() => responderTela(p.id, false)}>Recusar</button>
                  <button type="button" className="rj-mini rj-mini-ok" onClick={() => responderTela(p.id, true)}>Deixar</button>
                </div>
              ))}
              {esperando.map(p => (
                <div key={p.id} className="rj-batida">
                  <span className="rj-av rj-av-p" style={{ background: '#3a3435' }}>{iniciais(p.nome)}</span>
                  <span className="rj-batida-t"><b>{p.nome}</b> quer entrar</span>
                  <button type="button" className="rj-mini" onClick={() => liberar(p.id, false)}>Recusar</button>
                  <button type="button" className="rj-mini rj-mini-ok" onClick={() => liberar(p.id, true)}>Liberar</button>
                </div>
              ))}
            </div>
          )}
          <div className={`rj-grade ${apresentador ? "tela" : ""}`} data-n={Math.min(n, 9)}>
            {pares.map(p => (
              <div key={p.id} className={`rj-quadro ${falando === p.id ? 'falando' : ''} ${apresentador === p.id ? 'apresenta' : ''}`} style={{ ['--c' as any]: corDe(p.id) }}>
                {(p.cam || p.tela) && p.stream.getVideoTracks().length > 0 && <video autoPlay playsInline muted className={`rj-video ${p.tela ? 'rj-contain' : ''}`} ref={el => { if (el && el.srcObject !== p.stream) { el.srcObject = p.stream; el.play().catch(() => null) } }} />}
                {!(p.cam || p.tela) || !p.stream.getVideoTracks().length ? <span className="rj-av rj-av-g" style={{ background: corDe(p.id) }}>{iniciais(p.nome)}</span> : null}
                <audio autoPlay ref={el => { if (el && el.srcObject !== p.stream) { el.srcObject = p.stream; el.play().then(() => setSomBloqueado(false)).catch(() => setSomBloqueado(true)) } }} />
                <div className="rj-nome">{p.nome.split(' ')[0]}{p.tela && <small> · apresentando</small>}{conectando(p) && <small> · conectando…</small>}</div>
                {host && <button type="button" className="rj-silenciar" onClick={() => enviar({ t: 'mutar', para: p.id })} aria-label={`Silenciar ${p.nome}`}><MicOff size={13} /> Silenciar</button>}
              </div>
            ))}
            <div className={`rj-quadro rj-eu ${euFalando ? 'falando' : ''} ${apresentando ? 'apresenta' : ''}`} style={{ ['--c' as any]: '#7c3aed' }}>
              {apresentando ? <video ref={vTela} autoPlay playsInline muted className="rj-video rj-contain" />
                : temCamera && !camOff ? <video ref={vEu} autoPlay playsInline muted className="rj-video rj-espelho" /> : <span className="rj-av rj-av-g" style={{ background: '#7c3aed' }}>{iniciais(nome)}</span>}
              <div className="rj-nome">Você{apresentando && <small> · apresentando</small>}{mudo && <small> · sem som</small>}</div>
            </div>
          </div>
          {host && !iaOuvindo && pares.length > 0 && esperando.length === 0 && pedidosTela.length === 0 && (
            <div className="rj-lembrete"><span>A IA ainda não está ouvindo. Quando a reunião começar de verdade, ligue.</span><button type="button" className="rj-mini rj-mini-ok" onClick={alternarIa}>Ligar a IA</button></div>
          )}
          {pares.length === 0 && !(host && esperando.length) && <div className="rj-sozinho">{host ? 'Ninguém entrou ainda. Quem abrir o link aparece aqui pra você liberar.' : `Esperando ${info?.anfitriao || 'os outros'}…`}</div>}
        </div>

        {comLado && (
          <aside className={`rj-sug ${(host ? sugAberta : chatAberto) ? 'aberta' : ''}`}>
            <div className="rj-sug-h">
              {host
                ? <div className="rj-abas"><button type="button" className={lado === 'sug' ? 'on' : ''} onClick={() => setLado('sug')}>Sugestões</button><button type="button" className={lado === 'chat' ? 'on' : ''} onClick={() => { setLado('chat'); setNaoLidas(0) }}>Chat{naoLidas > 0 && lado !== 'chat' ? <i className="rj-bolinha">{naoLidas}</i> : null}</button></div>
                : <b>Chat</b>}
              {host && lado === 'sug' && <span className="rj-so">só você vê</span>}
              <button type="button" className="rj-fechar" style={!host ? { display: 'block' } : undefined} onClick={() => host ? setSugAberta(false) : setChatAberto(false)} aria-label="Fechar"><X size={16} /></button>
            </div>
            {host && lado === 'sug' ? (
              <>
            {!iaOuvindo && <div className="rj-pausada"><b>IA pausada.</b> Nada está sendo transcrito nem gastando crédito. <button type="button" className="rj-mini rj-mini-ok" onClick={alternarIa}>Ligar a IA</button></div>}
            {!sug ? <p className="rj-p rj-pq">{iaOuvindo ? 'Ouvindo a conversa…' : 'As sugestões aparecem aqui quando a IA estiver ligada.'}</p> : sug.erro ? <p className="rj-p rj-pq">{sug.erro}</p> : (
              <>
                {Array.isArray(sug.pauta) && sug.pauta.length > 0 && (
                  <div><div className="rj-rot">Pauta</div>
                    <ul className="rj-pauta">{sug.pauta.map((p: any, i: number) => <li key={i} className={p.estado}><i>{p.estado === 'feito' ? '✓' : ''}</i>{p.item}</li>)}</ul>
                  </div>
                )}
                {sug.agora?.responda && (
                  <div className="rj-agora">
                    <span className={`rj-tag ${sug.agora.tipo === 'objecao' ? 'obj' : ''}`}>{sug.agora.titulo || (sug.agora.tipo === 'objecao' ? 'Objeção' : 'Dica')}</span>
                    {sug.agora.trecho && <q>{sug.agora.trecho}</q>}
                    {sug.agora.quem && <div className="rj-quem">{sug.agora.quem}</div>}
                    <div className="rj-diga"><span className="rj-rot">Responda</span>{sug.agora.responda}</div>
                    {sug.agora.pergunte && <div className="rj-pergunte"><span className="rj-rot">Pergunte</span>{sug.agora.pergunte}</div>}
                  </div>
                )}
                {Array.isArray(sug.antes) && sug.antes.length > 0 && (
                  <div><div className="rj-rot">Antes</div><ul className="rj-antes">{sug.antes.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></div>
                )}
              </>
            )}
              </>
            ) : (
              <div className="rj-chat">
                <div className="rj-chat-lista" ref={listaChat}>
                  {msgs.length === 0 && <p className="rj-p rj-pq">Ninguém escreveu ainda. O que for escrito aqui todos na reunião veem, e fica salvo junto com a reunião.</p>}
                  {msgs.map(m => {
                    const meu = m.pessoa_id === eu.current.pessoa_id
                    return (
                      <div key={m.id} className={`rj-msg ${meu ? 'meu' : ''}`}>
                        {!meu && <span className="rj-msg-nome">{(m.nome || '').split(' ')[0]}</span>}
                        <span className="rj-msg-txt">{comLinks(m.texto)}</span>
                        <span className="rj-msg-hora">{new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</span>
                      </div>
                    )
                  })}
                </div>
                <form className="rj-chat-form" onSubmit={e => { e.preventDefault(); enviarChat() }}>
                  <input id="rj-chat-texto" value={textoChat} onChange={e => setTextoChat(e.target.value)} placeholder="Escreva pra todos…" maxLength={2000} autoComplete="off" />
                  <button type="submit" className="rj-mini rj-mini-ok" disabled={!textoChat.trim()}>Enviar</button>
                </form>
              </div>
            )}
          </aside>
        )}
      </div>

      <div className="rj-lema">domine o agora</div>
      <div className="rj-doca">
        {somBloqueado && <button type="button" className="rj-btn rj-som" onClick={() => { document.querySelectorAll('.rj audio').forEach((a: any) => a.play().then(() => setSomBloqueado(false)).catch(() => null)); ac.current?.resume() }}>Toque aqui para ouvir os outros</button>}
        {aviso && <div className="rj-aviso">{aviso}</div>}
        {pediuTela && <div className="rj-aviso">Pedido enviado. Você pode apresentar assim que {info?.anfitriao || 'quem conduz'} liberar.</div>}
        {confirmarFim ? (
          <div className="rj-confirma"><span>Encerrar a reunião pra todos?</span><button type="button" className="rj-mini" onClick={() => setConfirmarFim(false)}>Cancelar</button><button type="button" className="rj-mini rj-mini-fim" onClick={encerrarParaTodos}>Encerrar</button></div>
        ) : (
          <div className="rj-botoes">
            <button type="button" className={`rj-redondo-btn g ${mudo ? 'off' : ''}`} onClick={alternarMudo} aria-label={mudo ? 'Ligar microfone' : 'Silenciar'}>{mudo ? <MicOff size={19} /> : <Mic size={19} />}</button>
            <button type="button" className={`rj-redondo-btn g ${camOff || !temCamera ? 'off' : ''}`} onClick={alternarCamera} aria-label={camOff || !temCamera ? 'Ligar câmera' : 'Desligar câmera'}>{camOff || !temCamera ? <VideoOff size={19} /> : <Video size={19} />}</button>
            {podeApresentar && <button type="button" className={`rj-redondo-btn g ${apresentando ? 'on' : ''} ${pediuTela ? 'esperando' : ''}`} onClick={apresentar} aria-label={apresentando ? 'Parar de apresentar' : host || podeTela ? 'Apresentar a tela' : 'Pedir pra apresentar'} title={apresentando ? 'Parar de apresentar' : host || podeTela ? 'Apresentar a tela (slides, PDF, uma janela)' : pediuTela ? 'Pedido enviado' : 'Pedir pra apresentar a tela'}><Tela size={19} /></button>}
            {podePip && <button type="button" className={`rj-redondo-btn g ${pipWin ? 'on' : ''}`} onClick={abrirJanelinha} aria-label="Janelinha" title="Janelinha: a reunião flutuando por cima das outras janelas (pra apresentar e continuar vendo todo mundo)"><Janela size={19} /></button>}
            <button type="button" className="rj-redondo-btn g rj-com-bolinha" onClick={() => { if (host) { setLado('chat'); setSugAberta(true) } else setChatAberto(v => !v); setNaoLidas(0) }} aria-label="Chat"><Chat size={19} />{naoLidas > 0 && <i className="rj-bolinha">{naoLidas}</i>}</button>
            {host && <button type="button" className="rj-redondo-btn g rj-so-cel" onClick={() => { setLado('sug'); setSugAberta(v => !v) }} aria-label="Sugestões"><Sparkles size={19} /></button>}
            {host
              ? <button type="button" className="rj-sair" onClick={() => setConfirmarFim(true)}>Encerrar<span className="rj-longo"> para todos</span></button>
              : <button type="button" className="rj-sair" onClick={sair}>Sair</button>}
          </div>
        )}
      </div>
    </div>
  )
}

// a janelinha usa o CSS da sala + isto (a janela flutuante é um documento à parte: as fontes do site não vão junto)
const CSS_JANELINHA = `
html,body{margin:0;background:#0f0c17;height:100%}
.rj-mini{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;gap:8px;padding:8px;overflow:hidden}
.mini-topo{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ash);font-variant-numeric:tabular-nums}
.mini-topo img{width:auto;height:20px}
.mini-ao-vivo{margin-left:auto;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--grad);border-radius:99px;padding:2px 8px}
.mini-lista{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;overflow-y:auto}
.mini-q{flex:1 1 0;min-height:72px;border-radius:12px}
.mini-q .rj-av-g{width:40px;height:40px;font-size:14px}
.mini-q .rj-nome{font-size:11px;left:6px;bottom:6px;padding:2px 7px}
.mini-apresentar{width:100%;padding:10px;font-size:13px;border-radius:12px}
.mini-botoes{display:flex;gap:6px;justify-content:center;padding:6px;border-radius:999px;background:var(--vidro);border:1px solid var(--vidro-bd)}
.mini-botoes .rj-redondo-btn{width:40px;height:40px}
`

const CSS = `
.rj{--ink:#0f0c17;--black:#08060d;--coal:#171320;--slate:#1f1a2b;--slate2:#2a2338;--line:#372e4c;--bone:#f4f1fa;--bone2:#d4cce6;--ash:#a39bb8;--ash2:#766e8a;--red:#7c3aed;--red2:#6d28d9;--ok:#57c28a;--warn:#f2b544;
  min-height:100dvh;background:var(--ink);color:var(--bone);display:flex;flex-direction:column;font-family:var(--rj-fonte),-apple-system,'Segoe UI',Roboto,sans-serif}
.rj *{box-sizing:border-box}
.rj-barra{display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 18px 10px;background:var(--black);border-bottom:1px solid #1a1718;flex:none}
.rj-marca{height:32px;width:auto;display:block}
.rj-dir{margin-left:auto;display:flex;align-items:center;gap:14px;font-size:12px;color:var(--ash2);font-variant-numeric:tabular-nums}
.rj-centro{flex:1;display:grid;place-items:center;padding:28px 16px;background:radial-gradient(ellipse at 70% 0%,rgba(124,58,237,.10),transparent 55%)}
.rj-card{width:min(440px,100%);display:flex;flex-direction:column;gap:14px}
.rj-h1{margin:0;font-size:24px;font-weight:700;line-height:1.2;text-wrap:balance}
.rj-grande{font-size:30px}
.rj-p{margin:0;color:var(--ash);font-size:14.5px;line-height:1.5}
.rj-pq{font-size:13px}
.rj-previa{position:relative;aspect-ratio:16/10;border-radius:12px;overflow:hidden;background:linear-gradient(160deg,#2b2627,#141112);border:1px solid var(--line);display:grid;place-items:center}
.rj-previa-ctl{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:8px}
.rj-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
.rj-espelho{transform:scaleX(-1)}
.rj-av{border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;flex:none;width:52px;height:52px;font-size:18px}
.rj-av-g{width:clamp(52px,9vw,84px);height:clamp(52px,9vw,84px);font-size:clamp(18px,3vw,28px);position:relative;z-index:1}
.rj-av-p{width:28px;height:28px;font-size:11px}
.rj-input{background:var(--coal);border:1px solid var(--line);border-radius:8px;padding:12px;color:var(--bone);font:inherit;font-size:15px}
.rj-input:focus-visible,.rj button:focus-visible,.rj a:focus-visible{outline:2px solid var(--red);outline-offset:2px}
.rj-silenciar{position:absolute;top:8px;right:8px;z-index:3;display:inline-flex;align-items:center;gap:5px;font:600 11.5px/1 inherit;color:#fff;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:6px 10px;cursor:pointer;backdrop-filter:blur(6px)}
.rj-silenciar:hover{background:rgba(124,58,237,.85)}
.rj-consent{display:flex;gap:10px;font-size:13px;color:var(--bone2);background:var(--coal);border:1px solid var(--line);border-radius:8px;padding:10px 12px;cursor:pointer}
.rj-consent input{accent-color:var(--red);margin-top:3px}
.rj-btn{background:var(--red);color:#fff;border:0;border-radius:9px;padding:13px;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
.rj-btn:hover{background:var(--red2)}
.rj-btn:disabled{opacity:.5;cursor:default}
.rj-btn2{align-self:flex-start;background:transparent;color:var(--bone);border:1px solid var(--line);border-radius:9px;padding:10px 16px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none}
.rj-link{background:none;border:0;color:#fff;text-decoration:underline;font:inherit;cursor:pointer;margin-left:6px}
.rj-aviso{font-size:13px;color:var(--warn);background:rgba(242,181,68,.1);border-radius:8px;padding:8px 10px}
.rj-erro{font-size:13px;color:#ff8a94;background:rgba(124,58,237,.1);border-radius:8px;padding:8px 10px;line-height:1.45}
.rj-espera{display:flex;align-items:center;gap:12px}
.rj-dica{margin:0;font-size:12.5px;line-height:1.45;color:var(--ash)}
.rj-pontos{display:flex;gap:5px}
.rj-pontos i{width:7px;height:7px;border-radius:50%;background:var(--ash2);animation:rjp 1.2s infinite}
.rj-pontos i:nth-child(2){animation-delay:.2s}.rj-pontos i:nth-child(3){animation-delay:.4s}
@keyframes rjp{50%{background:var(--red)}}

.rj-sala{height:100dvh;overflow:hidden}
.rj-conta{color:var(--ash)}
.rj-ia{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1px solid var(--line);color:var(--ash);border-radius:8px;padding:6px 11px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.rj-ia i{width:8px;height:8px;border-radius:50%;background:var(--ash2)}
.rj-ia.on{border-color:rgba(87,194,138,.5);color:#8fe0b4;background:rgba(87,194,138,.1)}
.rj-ia.on i{background:#57c28a;box-shadow:0 0 0 3px rgba(87,194,138,.25);animation:rjp2 1.6s infinite}
@keyframes rjp2{50%{box-shadow:0 0 0 6px rgba(87,194,138,0)}}
.rj-lembrete{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:10px;background:rgba(23,19,32,.96);border:1px solid rgba(242,181,68,.5);border-radius:12px;padding:8px 8px 8px 12px;font-size:13px;color:var(--bone);box-shadow:0 10px 28px rgba(0,0,0,.5);max-width:calc(100% - 24px)}
.rj-pausada{font-size:12.5px;line-height:1.5;color:var(--bone2);background:rgba(242,181,68,.08);border:1px solid rgba(242,181,68,.35);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.rj-convidar{background:var(--red);color:#fff;border:0;border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.rj-convite{position:fixed;top:calc(64px + env(safe-area-inset-top));right:12px;z-index:30;width:min(400px,calc(100vw - 24px));background:rgba(23,19,32,.98);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 16px 40px rgba(0,0,0,.6)}
.rj-convite-h{display:flex;align-items:center;justify-content:space-between;font-size:14px}
.rj-convite code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px;color:var(--bone2);overflow-wrap:anywhere}
.rj-convite-b{display:flex;gap:8px;flex-wrap:wrap}
.rj-meio{flex:1;min-height:0;display:grid;grid-template-columns:1fr;gap:12px;padding:12px 12px 0}
.rj-meio.com-sug{grid-template-columns:1fr 320px}
.rj-palco{position:relative;min-height:0;display:flex;flex-direction:column}
.rj-grade{flex:1;min-height:0;display:grid;gap:10px;grid-auto-rows:1fr;grid-template-columns:1fr}
.rj-grade[data-n="2"]{grid-template-columns:1fr 1fr}
.rj-grade[data-n="3"],.rj-grade[data-n="4"]{grid-template-columns:1fr 1fr}
.rj-grade[data-n="5"],.rj-grade[data-n="6"],.rj-grade[data-n="7"],.rj-grade[data-n="8"],.rj-grade[data-n="9"]{grid-template-columns:1fr 1fr 1fr}
.rj-quadro{position:relative;min-height:0;border-radius:12px;overflow:hidden;background:linear-gradient(170deg,#262122,#111);border:1px solid #221e1f;display:grid;place-items:center;transition:box-shadow .25s}
.rj-quadro.falando{box-shadow:0 0 0 2px var(--c),0 0 26px -6px var(--c)}
.rj-quadro audio{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.rj-nome{position:absolute;left:10px;bottom:10px;z-index:2;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);border-radius:6px;padding:4px 9px;font-size:12.5px;font-weight:600}
.rj-nome small{font-weight:400;color:var(--ash)}
.rj-sozinho{position:absolute;left:50%;top:14px;transform:translateX(-50%);font-size:13px;color:var(--ash);background:rgba(23,19,32,.9);border:1px solid var(--line);border-radius:10px;padding:8px 12px;max-width:calc(100% - 24px);text-align:center;z-index:3}
.rj-batidas{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:5;display:flex;flex-direction:column;gap:8px;max-width:calc(100% - 16px)}
.rj-batida{display:flex;align-items:center;gap:10px;background:rgba(23,19,32,.96);backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:12px;padding:8px 8px 8px 10px;box-shadow:0 10px 28px rgba(0,0,0,.5);font-size:13.5px}
.rj-batida-t{flex:1;min-width:0}
.rj-mini{background:var(--slate);color:var(--bone);border:1px solid var(--line);border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.rj-mini-ok{background:var(--red);border-color:var(--red);color:#fff}
.rj-mini-fim{background:var(--red);border-color:var(--red);color:#fff}
.rj-lema{text-align:center;font-size:12px;letter-spacing:.28em;color:var(--bone2);opacity:.78;padding:12px 0 8px;font-weight:600;flex:none}
.rj-doca{display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 14px calc(14px + env(safe-area-inset-bottom));flex:none}
.rj-botoes{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap}
.rj-redondo-btn{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:var(--bone);cursor:pointer}
.rj-redondo-btn.g{width:48px;height:48px;background:#1f1b1c;border-color:#2e292a}
.rj-redondo-btn.off{background:#3a1519;border-color:#5a1f25;color:#ff8a94}
.rj-sair{background:var(--red);border:0;color:#fff;border-radius:24px;padding:0 22px;height:48px;font:inherit;font-weight:700;font-size:15px;cursor:pointer}
.rj-confirma{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;font-size:14px}
.rj-som{max-width:420px;width:100%}
.rj-so-cel{display:none!important}
.rj-redondo-btn.on{background:var(--red);border-color:var(--red);color:#fff}
.rj-redondo-btn.esperando{border-color:var(--warn);color:var(--warn)}
.rj-com-bolinha{position:relative}
.rj-bolinha{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:var(--red);color:#fff;font-size:11px;font-weight:700;font-style:normal;display:grid;place-items:center;padding:0 5px}
.rj-abas .rj-bolinha{position:static;display:inline-grid;margin-left:6px;vertical-align:1px}
.rj-abas{display:flex;gap:4px;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:3px}
.rj-abas button{background:transparent;border:0;color:var(--ash);font:inherit;font-size:13px;font-weight:600;padding:5px 11px;border-radius:6px;cursor:pointer}
.rj-abas button.on{background:var(--slate2);color:var(--bone)}
.rj-chat{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px}
.rj-chat-lista{flex:1;min-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px}
.rj-msg{align-self:flex-start;max-width:88%;background:var(--slate);border-radius:10px 10px 10px 3px;padding:7px 10px;display:flex;flex-direction:column;gap:2px}
.rj-msg.meu{align-self:flex-end;background:#2e1a5c;border-radius:10px 10px 3px 10px}
.rj-msg-nome{font-size:11.5px;font-weight:700;color:var(--ash)}
.rj-msg-txt{font-size:14px;line-height:1.4;overflow-wrap:anywhere;white-space:pre-wrap}
.rj-msg-txt a{color:#8cc8ff}
.rj-msg-hora{align-self:flex-end;font-size:10.5px;color:var(--ash2)}
.rj-chat-form{display:flex;gap:6px}
.rj-chat-form input{flex:1;min-width:0;background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--bone);font:inherit;font-size:14px}
.rj-chat-form .rj-mini:disabled{opacity:.5}
.rj-contain{object-fit:contain!important;background:#000}
.rj-grade.tela{grid-template-columns:repeat(5,minmax(0,1fr))!important;grid-template-rows:minmax(0,1fr) 110px;grid-auto-rows:110px}
.rj-grade.tela .rj-quadro.apresenta{grid-column:1/-1!important;order:-1}
.rj-grade.tela .rj-quadro:not(.apresenta) .rj-av-g{width:40px;height:40px;font-size:14px}

.rj-sug{background:var(--coal);border:1px solid #2a2526;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:14px;min-height:0;overflow-y:auto}
.rj-sug-h{display:flex;align-items:center;gap:8px}
.rj-sug-h b{font-size:14px}
.rj-so{font-size:11.5px;font-weight:600;color:#c4b5fd;background:rgba(124,58,237,.12);border-radius:99px;padding:3px 9px}
.rj-fechar{display:none;margin-left:auto;background:none;border:0;color:var(--ash);cursor:pointer}
.rj-rot{display:block;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ash2);margin-bottom:5px}
.rj-pauta{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rj-pauta li{display:grid;grid-template-columns:18px 1fr;gap:8px;font-size:13px;padding:5px 6px;border-radius:6px;color:var(--ash)}
.rj-pauta li i{width:14px;height:14px;border-radius:50%;border:1.5px solid var(--ash2);margin-top:2px;display:grid;place-items:center;font-style:normal;font-size:9px}
.rj-pauta li.feito{color:var(--ash2);text-decoration:line-through}
.rj-pauta li.feito i{background:var(--ash2);border-color:var(--ash2);color:var(--coal)}
.rj-pauta li.agora{background:var(--slate);color:var(--bone)}
.rj-pauta li.agora i{border-color:var(--red);background:var(--red)}
.rj-agora{border:1px solid var(--line);border-radius:10px;background:var(--ink);padding:12px;display:flex;flex-direction:column;gap:8px}
.rj-tag{align-self:flex-start;font-size:12px;font-weight:600;border-radius:99px;padding:3px 10px;background:rgba(87,194,138,.12);color:var(--ok)}
.rj-tag.obj{background:rgba(242,181,68,.12);color:var(--warn)}
.rj-agora q{font-style:italic;color:var(--bone2);font-size:13.5px}
.rj-quem{font-size:12px;color:var(--ash)}
.rj-diga{font-size:14px;border-left:2px solid var(--ok);padding-left:9px}
.rj-diga .rj-rot{color:var(--ok);margin-bottom:2px}
.rj-pergunte{font-size:13.5px;color:var(--bone2);border-left:2px solid #8c9eff;padding-left:9px}
.rj-pergunte .rj-rot{color:#8c9eff;margin-bottom:2px}
.rj-antes{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--ash)}

@media (max-width:980px){
  .rj-meio.com-sug{grid-template-columns:1fr}
  .rj-sug{display:none;position:fixed;left:8px;right:8px;bottom:calc(84px + env(safe-area-inset-bottom));max-height:62dvh;z-index:20;box-shadow:0 -10px 40px rgba(0,0,0,.6)}
  .rj-sug.aberta{display:flex}
  .rj-fechar{display:block}
  .rj-so-cel{display:grid!important}
}
@media (max-width:720px){
  .rj-barra{padding-left:12px;padding-right:12px}
  .rj-meio{padding:8px 8px 0}
  .rj-grade{gap:8px}
  .rj-grade[data-n="2"]{grid-template-columns:1fr}
  .rj-grade[data-n="3"]{grid-template-columns:1fr 1fr}
  .rj-grade[data-n="5"],.rj-grade[data-n="6"],.rj-grade[data-n="7"],.rj-grade[data-n="8"],.rj-grade[data-n="9"]{grid-template-columns:1fr 1fr}
  .rj-nome{left:8px;bottom:8px;font-size:11.5px;padding:3px 8px}
  .rj-lema{padding:9px 0 7px}
  .rj-longo{display:none}
  .rj-dir .rj-conta{display:none}
  .rj-ia{padding:5px 8px;font-size:11.5px}
  .rj-lembrete{flex-wrap:wrap;font-size:12.5px}
  .rj-grade.tela{grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-template-rows:minmax(0,1fr) 84px;grid-auto-rows:84px}
}
@media (max-height:500px) and (orientation:landscape){
  .rj-lema{display:none}
  .rj-sala .rj-meio,.rj-meio{padding-top:6px}
  .rj-botoes{margin-bottom:6px}
  .rj-barra{margin-top:6px!important;padding-top:5px!important;padding-bottom:5px!important}
}
@media (prefers-reduced-motion:reduce){.rj *{animation:none!important;transition:none!important}}

/* ─── V2 · VIDRO (30/09/2026, pedido do Nando: a sala no visual novo do sistema) ───────────────────
   Os mesmos ingredientes do painel: fundo quadriculado com manchas de luz da marca, superfícies de
   vidro (translúcidas, com desfoque, borda clara e o brilho na beirada de cima) e botões com degradê.
   O "vidro desligado" do sistema ([data-vidro="off"], máquina fraca) continua valendo aqui. */
.rj{--vidro:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.035));--vidro-bd:rgba(255,255,255,.14);--vidro-hi:rgba(255,255,255,.24);
  --vidro-sombra:0 18px 50px rgba(0,0,0,.55);--grad:linear-gradient(135deg,#7c3aed,#c026d3);--brilho:0 10px 30px rgba(124,58,237,.38);
  background:
    radial-gradient(42% 46% at 10% 0%,rgba(124,58,237,.30),transparent 70%),
    radial-gradient(34% 40% at 96% 100%,rgba(200,40,140,.24),transparent 70%),
    radial-gradient(28% 30% at 62% 46%,rgba(150,30,110,.12),transparent 70%),
    repeating-linear-gradient(90deg,rgba(255,255,255,.03) 0 1px,transparent 1px 44px),
    repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 44px),#0f0c17}
.rj .vd,.rj-barra,.rj-card,.rj-quadro,.rj-sug,.rj-batida,.rj-convite,.rj-lembrete,.rj-sozinho,.rj-botoes,.rj-previa{
  background:var(--vidro);border:1px solid var(--vidro-bd);box-shadow:inset 0 1px 0 var(--vidro-hi),var(--vidro-sombra);
  backdrop-filter:blur(22px) saturate(1.4);-webkit-backdrop-filter:blur(22px) saturate(1.4)}
/* a sala ocupa a tela toda (o fundo geral do sistema aparecia como uma faixa nas bordas) */
.rj{position:fixed;inset:0;overflow-y:auto;z-index:1}
.rj-sala{overflow:hidden}
/* a faixa do topo flutua */
.rj-barra{margin:calc(10px + env(safe-area-inset-top)) 12px 0;padding:10px 16px;border-radius:18px}
.rj-sala .rj-meio{padding-top:12px}
/* entrada, espera, saída: um cartão de vidro */
.rj-centro{background:none}
.rj-card{padding:28px;border-radius:22px;position:relative;overflow:hidden}
.rj-card:before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.08) 0%,transparent 40%);pointer-events:none}
.rj-card>*{position:relative}
.rj-h1{font-size:26px;letter-spacing:-.01em}
.rj-previa{border-radius:16px;background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(0,0,0,.35))}
.rj-input,.rj-chat-form input,.rj-convite code{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:12px}
.rj-input:focus,.rj-chat-form input:focus{outline:none;border-color:rgba(167,139,250,.6);box-shadow:0 0 0 3px rgba(124,58,237,.18)}
.rj-consent{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);border-radius:12px}
.rj-btn,.rj-sair,.rj-convidar,.rj-mini-ok,.rj-mini-fim{background:var(--grad)!important;border:0!important;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.35),var(--brilho)}
.rj-btn{border-radius:14px}
.rj-btn:hover,.rj-sair:hover{filter:brightness(1.08)}
.rj-btn2,.rj-mini{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
/* os quadros das pessoas */
.rj-quadro{border-radius:20px;background:linear-gradient(165deg,rgba(255,255,255,.08),rgba(0,0,0,.35))}
.rj-quadro.falando{box-shadow:0 0 0 2px var(--c),0 0 34px -4px var(--c),inset 0 1px 0 var(--vidro-hi)}
.rj-nome{background:rgba(10,10,14,.45);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:10px}
.rj-av{box-shadow:0 12px 30px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.35)}
/* a doca: os botões numa pílula de vidro flutuante */
.rj-botoes{padding:8px;border-radius:999px;gap:8px}
.rj-redondo-btn.g{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.rj-redondo-btn.g:hover{background:rgba(255,255,255,.14)}
.rj-redondo-btn.off{background:rgba(237,28,46,.18)!important;border-color:rgba(255,90,110,.45)!important;color:#ff8a94}
.rj-redondo-btn.on{background:var(--grad)!important;color:#fff;box-shadow:var(--brilho)}
.rj-sair{border-radius:999px}
.rj-confirma{padding:8px 8px 8px 14px;border-radius:999px;background:var(--vidro);border:1px solid var(--vidro-bd);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
/* painel de sugestões e chat */
.rj-sug{border-radius:20px}
.rj-abas{background:rgba(0,0,0,.25);border-color:rgba(255,255,255,.12);border-radius:12px}
.rj-abas button.on{background:rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.rj-agora{background:rgba(0,0,0,.28);border-color:rgba(255,255,255,.12);border-radius:14px}
.rj-pauta li.agora{background:rgba(255,255,255,.08)}
.rj-pauta li.agora i{background:var(--grad);border:0}
.rj-msg{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08)}
.rj-msg.meu{background:linear-gradient(135deg,rgba(124,58,237,.38),rgba(168,85,247,.28));border-color:rgba(167,139,250,.3)}
.rj-ia{border-radius:10px;background:rgba(255,255,255,.06)}
.rj-ia.on{background:rgba(87,194,138,.14)}
/* avisos flutuantes */
.rj-batida,.rj-convite,.rj-lembrete{border-radius:16px}
.rj-sozinho{border-radius:14px}
.rj-pausada{border-radius:14px}
@media (max-width:720px){.rj-barra{margin:calc(8px + env(safe-area-inset-top)) 8px 0;padding:8px 12px;border-radius:16px}.rj-card{padding:22px}}
[data-vidro="off"] .rj .vd,[data-vidro="off"] .rj-barra,[data-vidro="off"] .rj-card,[data-vidro="off"] .rj-quadro,[data-vidro="off"] .rj-sug,[data-vidro="off"] .rj-botoes{background:#17161b}
`
