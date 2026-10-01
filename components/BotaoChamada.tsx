'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchAuth } from '@/lib/api'
import { Video, Copy, Check, ExternalLink, MessageCircle } from 'lucide-react'

// O BOTÃO "CHAMAR": cria uma chamada por voz/vídeo (app/call) pra um lead ou cliente e entrega o convite
// do jeito mais curto possível. Um toque abre o painel; o segundo toque cria a chamada, abre a tua tela
// numa aba nova e manda o link pro outro lado, SEMPRE pelo WhatsApp oficial (nunca o wa.me do celular).
// Usado no card do lead, na conversa do WhatsApp, na Fila de Ligações, no Atender agora e nas entregas.
type Props = {
  leadId?: string | null
  nome?: string | null
  telefone?: string | null
  // quando a tela já é uma conversa do WhatsApp: manda o convite como mensagem, sem sair da tela
  enviarNoChat?: (texto: string) => Promise<boolean>
  compacto?: boolean
  style?: React.CSSProperties
}

// MANDA O CONVITE PELO WHATSAPP OFICIAL, nunca pelo WhatsApp de quem clicou (01/10/2026, igual à Dani).
// Fora da tela do WhatsApp o botão abria o wa.me e nada saía sozinho: o Rick criou a chamada da Sabrina
// pelo card e colou o link puro à mão. Fora da janela de 24h o WhatsApp só aceita modelo: aí volta
// `foraJanela`, e quem chamou é avisado e fica com o link copiado.
export async function enviarPeloOficial(telefone: string | null | undefined, leadId: string | null | undefined, texto: string): Promise<{ ok: boolean; foraJanela?: boolean; error?: string }> {
  try {
    const j = await fetchAuth('/api/wa/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone: telefone || undefined, leadId: leadId || undefined, texto, preview: true, conviteFoto: true }) }).then(r => r.json())
    return { ok: !!j?.ok, foraJanela: !!j?.foraJanela, error: j?.error }
  } catch (e: any) { return { ok: false, error: e?.message || 'erro de rede' } }
}
export const AVISO_24H = 'Essa pessoa não falou com a gente nas últimas 24h, e o WhatsApp só deixa mandar modelo. Copiei o link: reabre a conversa dela com um modelo e manda o link, ou liga pra ela.'

// quem chama e de onde vem logo na primeira linha: um link de gente desconhecida parece vírus
export const textoConvite = (nome: string | null | undefined, link: string, quem?: string | null, empresa?: string | null) =>
  `Oi${nome ? ', ' + nome.trim().split(' ')[0] : ''}!${quem ? ` Aqui é ${quem.trim().split(' ')[0]}${empresa ? `, da ${empresa}` : ''}.` : ''} Nossa conversa vai ser por uma chamada aqui mesmo no navegador, sem precisar instalar nada. É só tocar no link abaixo e depois em Entrar:\n\n${link}`

export default function BotaoChamada({ leadId, nome, telefone, enviarNoChat, compacto, style }: Props) {
  const [aberto, setAberto] = useState(false)
  const [video, setVideo] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [links, setLinks] = useState<{ lead: string; host: string; telefone: string | null; nome: string | null; quem?: string | null; empresa?: string | null } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [mandado, setMandado] = useState('')
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  // ao ABRIR: se a chamada guardada já começou ou acabou, esquece dela — senão a caixinha "Com vídeo"
  // continuava escondida (ela só aparece antes de criar) e o botão oferecia "Entrar de novo" numa
  // chamada encerrada (29/09/2026)
  useEffect(() => {
    if (!aberto || !links) return
    const codigo = (links.lead.split('/').pop() || '').split('?')[0]
    fetch(`/api/chamadas/${codigo}`).then(r => r.json()).then(st => { if (st?.status !== 'aguardando') { setLinks(null); setMandado(''); setCopiado(false) } }).catch(() => null)
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  async function criar(): Promise<typeof links> {
    // A CHAMADA GUARDADA SÓ SERVE SE AINDA ESTÁ ESPERANDO (29/09/2026): o botão reaproveitava a última
    // chamada criada nesta tela, mesmo já encerrada — o Rick mandou 3 vezes o link de uma chamada que
    // tinha acabado, e quem abria caía direto em "encerrada". Começou ou acabou: cria outra.
    if (links) {
      try {
        const codigo = (links.lead.split('/').pop() || '').split('?')[0]
        const st = await fetch(`/api/chamadas/${codigo}`).then(r => r.json())
        if (st?.status === 'aguardando') return links
      } catch { /* sem resposta: cria outra, que é o seguro */ }
      setLinks(null)
    }
    setCriando(true); setErro('')
    try {
      const j = await fetchAuth('/api/chamadas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId || undefined, lead_nome: nome || undefined, telefone: telefone || undefined, com_video: video }) }).then(r => r.json())
      if (!j.ok) { setErro(j.error || 'não consegui criar a chamada'); return null }
      const l = { lead: j.link_lead, host: j.link_host, telefone: j.telefone || telefone || null, nome: j.lead_nome || nome || null, quem: j.quem || null, empresa: j.empresa || null }
      setLinks(l); return l
    } catch (e: any) { setErro(e?.message || 'erro de rede'); return null }
    finally { setCriando(false) }
  }

  // a tua tela abre numa aba nova. A aba é aberta ANTES de esperar o servidor, senão o navegador barra o pop-up.
  async function entrar(l: NonNullable<typeof links>, janela: Window | null) {
    if (janela) janela.location.href = l.host; else window.open(l.host, '_blank')
  }

  async function mandar() {
    setMandado(''); setErro('')
    const janela = window.open('', '_blank')
    const l = await criar(); if (!l) { janela?.close(); return }
    const texto = textoConvite(l.nome, l.lead, l.quem, l.empresa)
    if (enviarNoChat) {
      const ok = await enviarNoChat(texto)
      setMandado(ok ? 'Convite enviado na conversa.' : 'Não consegui mandar pelo chat: copia o link e manda à mão.')
    } else if (l.telefone || leadId) {
      const r = await enviarPeloOficial(l.telefone, leadId, texto)
      if (r.ok) setMandado('Convite enviado pelo WhatsApp oficial.')
      else {
        try { await navigator.clipboard.writeText(l.lead) } catch { /* sem clipboard */ }
        if (r.foraJanela) setErro(AVISO_24H)
        else setErro(`Não consegui mandar pelo WhatsApp oficial (${r.error || 'erro'}). Copiei o link pra mandar à mão.`)
      }
    } else {
      try { await navigator.clipboard.writeText(l.lead) } catch { /* sem clipboard */ }
      setMandado('Sem telefone: link copiado.')
    }
    entrar(l, janela)
  }

  async function copiar() {
    const janela = window.open('', '_blank')
    const l = await criar(); if (!l) { janela?.close(); return }
    try { await navigator.clipboard.writeText(l.lead); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem clipboard */ }
    entrar(l, janela)
  }

  const pad = compacto ? '7px 11px' : '8px 14px'
  return (
    <div ref={caixa} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button onClick={() => setAberto(v => !v)} title="Chamada por voz ou vídeo pelo navegador, gravada e transcrita"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: pad, borderRadius: 'var(--r, 10px)', border: '1px solid var(--accent-soft, #b39bff)', background: aberto ? 'var(--accent, #8b5cf6)' : 'var(--accent-bg, #2a1b4d)', color: aberto ? '#fff' : 'var(--accent-soft, #b39bff)', fontSize: compacto ? 12 : 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', font: 'inherit' }}>
        <Video size={compacto ? 13 : 14} /> Chamar
      </button>
      {aberto && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 80, width: 300, maxWidth: 'calc(100vw - 24px)', padding: 12, borderRadius: 14, background: 'var(--surface, #171320)', border: '1px solid var(--border-strong, #372e4c)', boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,.46))', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>Chamada pelo navegador{nome ? ` com ${nome.trim().split(' ')[0]}` : ''}. Fica gravada e transcrita no histórico.</div>
          {!links && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={video} onChange={e => setVideo(e.target.checked)} /> Com vídeo
            </label>
          )}
          <button onClick={mandar} disabled={criando} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#25D366', color: '#063', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', font: 'inherit', opacity: criando ? .6 : 1 }}>
            <MessageCircle size={15} /> {criando ? 'Criando…' : enviarNoChat ? 'Mandar o convite nesta conversa' : telefone ? 'Mandar o convite no WhatsApp' : 'Criar e copiar o link'}
          </button>
          <button onClick={copiar} disabled={criando} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', font: 'inherit', opacity: criando ? .6 : 1 }}>
            {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? 'Link copiado' : 'Copiar o link do convite e entrar'}
          </button>
          {links && (
            <a href={links.host} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--accent-soft)', background: 'transparent', color: 'var(--accent-soft)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              <ExternalLink size={15} /> Entrar na chamada de novo
            </a>
          )}
          {mandado && <div style={{ fontSize: 12, color: 'var(--green)' }}>{mandado}</div>}
          {erro && <div style={{ fontSize: 12, color: 'var(--red)' }}>{erro}</div>}
        </div>
      )}
    </div>
  )
}
