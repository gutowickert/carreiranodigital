'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchAuth } from '@/lib/api'
import { Video, Copy, Check, ExternalLink, MessageCircle } from 'lucide-react'

// O BOTÃO "CHAMAR": cria uma chamada por voz/vídeo (app/call) pra um lead ou cliente e entrega o convite
// do jeito mais curto possível. Um toque abre o painel; o segundo toque cria a chamada, abre a tua tela
// numa aba nova e manda o link pro outro lado (pelo chat, quando a tela tem chat; senão pelo wa.me).
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

export const textoConvite = (nome: string | null | undefined, link: string) =>
  `Oi${nome ? ', ' + nome.trim().split(' ')[0] : ''}! Vamos conversar por aqui, é só abrir o link e clicar em Entrar na chamada: ${link}`

export default function BotaoChamada({ leadId, nome, telefone, enviarNoChat, compacto, style }: Props) {
  const [aberto, setAberto] = useState(false)
  const [video, setVideo] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [links, setLinks] = useState<{ lead: string; host: string; telefone: string | null; nome: string | null } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [mandado, setMandado] = useState('')
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  async function criar(): Promise<typeof links> {
    if (links) return links
    setCriando(true); setErro('')
    try {
      const j = await fetchAuth('/api/chamadas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId || undefined, lead_nome: nome || undefined, telefone: telefone || undefined, com_video: video }) }).then(r => r.json())
      if (!j.ok) { setErro(j.error || 'não consegui criar a chamada'); return null }
      const l = { lead: j.link_lead, host: j.link_host, telefone: j.telefone || telefone || null, nome: j.lead_nome || nome || null }
      setLinks(l); return l
    } catch (e: any) { setErro(e?.message || 'erro de rede'); return null }
    finally { setCriando(false) }
  }

  // a tua tela abre numa aba nova. A aba é aberta ANTES de esperar o servidor, senão o navegador barra o pop-up.
  async function entrar(l: NonNullable<typeof links>, janela: Window | null) {
    if (janela) janela.location.href = l.host; else window.open(l.host, '_blank')
  }

  async function mandar() {
    const janela = window.open('', '_blank')
    const l = await criar(); if (!l) { janela?.close(); return }
    const texto = textoConvite(l.nome, l.lead)
    if (enviarNoChat) {
      const ok = await enviarNoChat(texto)
      setMandado(ok ? 'Convite enviado na conversa.' : 'Não consegui mandar pelo chat: copia o link e manda à mão.')
    } else if (l.telefone) {
      window.open(`https://wa.me/${l.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`, '_blank')
      setMandado('WhatsApp aberto com o convite.')
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
