'use client'

import { useEffect, useState, useRef } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { blobParaMp3DataUri } from '@/lib/audio'

type Conversa = {
  id: string; telefone: string; nome: string | null
  lead_id: string | null; aluno_id: string | null
  ultima_msg: string | null; ultima_msg_em: string | null; nao_lidas: number
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function CaixaWhatsApp() {
  const [autorizado, setAutorizado] = useState<boolean | null>(null)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [ativa, setAtiva] = useState<Conversa | null>(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    async function checar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setAutorizado(false); return }
      const { data: p } = await supabase.from('usuarios_perfil')
        .select('papel, wa_caixa').eq('id', session.user.id).single()
      const ok = p?.papel === 'admin' || p?.wa_caixa === true
      setAutorizado(ok)
      if (ok) carregarConversas()
    }
    checar()
  }, [])

  async function carregarConversas() {
    const { data } = await supabase.from('wa_conversas')
      .select('*').order('ultima_msg_em', { ascending: false, nullsFirst: false })
    setConversas(data || [])
  }

  useEffect(() => {
    if (autorizado !== true) return
    const t = setInterval(carregarConversas, 8000)
    return () => clearInterval(t)
  }, [autorizado])

  async function abrir(c: Conversa) {
    setAtiva(c)
    if (c.nao_lidas > 0) {
      await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', c.id)
      carregarConversas()
    }
  }

  if (autorizado === null) return <Layout><div style={{ padding: 40, color: '#6b7280' }}>Carregando...</div></Layout>
  if (!autorizado) return <Layout><div style={{ padding: 40, color: '#f87171' }}>Sem acesso à caixa de entrada.</div></Layout>

  const conversasFiltradas = conversas.filter(c =>
    !busca || (c.nome || '').toLowerCase().includes(busca.toLowerCase()) || (c.telefone || '').includes(busca)
  )

  function tag(c: Conversa) {
    if (c.lead_id) return { txt: 'Lead', cor: '#a78bfa', bg: '#2e1065' }
    if (c.aluno_id) return { txt: 'Aluno', cor: '#4ade80', bg: '#052e16' }
    return { txt: 'Contato', cor: '#9ca3af', bg: '#1f2937' }
  }

  return (
    <Layout>
      <div style={{ padding: '24px 32px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>WhatsApp</h1>
        <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
          {/* Lista */}
          <div style={{ ...card, width: 320, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #3a3a3c' }}>
              <input style={inp} placeholder="Buscar nome ou telefone..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {conversasFiltradas.length === 0 && <p style={{ padding: 16, fontSize: 13, color: '#6b7280' }}>Nenhuma conversa.</p>}
              {conversasFiltradas.map(c => {
                const t = tag(c)
                const sel = ativa?.id === c.id
                return (
                  <div key={c.id} onClick={() => abrir(c)}
                    style={{ padding: '12px 14px', borderBottom: '1px solid #3a3a3c', cursor: 'pointer', background: sel ? '#1c1c1e' : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{c.nome || c.telefone}</span>
                      {c.nao_lidas > 0 && <span style={{ fontSize: 11, background: '#25D366', color: '#063', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>{c.nao_lidas}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{c.ultima_msg || '—'}</span>
                      <span style={{ fontSize: 9, color: t.cor, background: t.bg, borderRadius: 4, padding: '1px 6px' }}>{t.txt}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Chat */}
          <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {ativa ? <ChatConversa conversa={ativa} onEnviou={carregarConversas} /> : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14 }}>
                Selecione uma conversa
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
function ChatConversa({ conversa, onEnviou }: { conversa: Conversa; onEnviou: () => void }) {
  const [mensagens, setMensagens] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [gravando, setGravando] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fimRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function carregar() {
    const { data } = await supabase.from('wa_mensagens')
      .select('*').eq('conversa_id', conversa.id).order('criado_em', { ascending: true })
    setMensagens(data || [])
  }

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 5000)
    return () => clearInterval(t)
  }, [conversa.id])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens.length])

  async function enviarTexto() {
    if (!texto.trim()) return
    setEnviando(true); setErro('')
    try {
      const res = await fetch('/api/wa/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: conversa.telefone, leadId: conversa.lead_id, texto }),
      })
      const json = await res.json()
      if (json.ok) { setTexto(''); carregar(); onEnviou() }
      else setErro(json.error || 'falha ao enviar')
    } catch (e: any) { setErro((e && e.message) || 'erro de rede') }
    finally { setEnviando(false) }
  }

  async function iniciarGravacao() {
    setErro('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Grava num formato que o navegador realmente suporta e ETIQUETA com o mime real
      // (antes forçava 'audio/ogg' em bytes webm → o Z-API não convertia e o áudio ia vazio).
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || mime || 'audio/webm' })
        setEnviando(true)
        try {
          // converte pra MP3 (o Z-API não aceita webm/opus -> ia vazio)
          const audioBase64 = await blobParaMp3DataUri(blob)
          const res = await fetch('/api/wa/enviar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone: conversa.telefone, leadId: conversa.lead_id, audioBase64 }),
          })
          const json = await res.json()
          if (json.ok) { carregar(); onEnviou() } else setErro(json.error || 'falha ao enviar audio')
        } catch (e: any) { setErro((e && e.message) || 'erro ao processar áudio') }
        finally { setEnviando(false) }
      }
      mr.start(); mediaRef.current = mr; setGravando(true)
    } catch { setErro('Sem acesso ao microfone') }
  }

  function pararGravacao() { mediaRef.current?.stop(); setGravando(false) }

  async function enviarAnexo(file: File) {
    setEnviando(true); setErro('')
    try {
      const ehImagem = file.type.startsWith('image/')
      const ext = (file.name.split('.').pop() || (ehImagem ? 'jpg' : 'pdf')).toLowerCase()
      const reader = new FileReader()
      reader.onloadend = async () => {
        try {
          const res = await fetch('/api/wa/enviar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              telefone: conversa.telefone, leadId: conversa.lead_id,
              anexoBase64: reader.result, anexoNome: file.name,
              anexoTipo: ehImagem ? 'imagem' : 'documento', anexoExt: ext,
            }),
          })
          const json = await res.json()
          if (json.ok) { carregar(); onEnviou() }
          else setErro(json.error || 'falha ao enviar anexo')
        } catch (e: any) { setErro((e && e.message) || 'erro de rede') }
        finally { setEnviando(false) }
      }
      reader.readAsDataURL(file)
    } catch { setErro('falha ao ler arquivo'); setEnviando(false) }
  }

  function renderMidia(m: any) {
    if (m.tipo === 'imagem' && m.midia_url) return <img src={m.midia_url} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4 }} />
    if (m.tipo === 'audio' && m.midia_url) return <audio controls src={m.midia_url} style={{ width: '100%', marginTop: 4, height: 34 }} />
    if (m.tipo === 'video' && m.midia_url) return <video controls src={m.midia_url} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4 }} />
    if (m.tipo === 'documento' && m.midia_url) return <a href={m.midia_url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontSize: 12 }}>📎 {m.texto || 'documento'}</a>
    if (m.tipo === 'audio' && !m.midia_url) return <span style={{ fontSize: 12, opacity: 0.8 }}>🎤 Áudio</span>
    return null
  }

  return (
    <>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #3a3a3c' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{conversa.nome || conversa.telefone}</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{conversa.telefone}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6, background: '#1c1c1e' }}>
        {mensagens.map(m => {
          const eu = m.direcao === 'enviada'
          return (
            <div key={m.id} style={{ alignSelf: eu ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
              <div style={{ background: eu ? '#075E54' : '#2c2c2e', border: eu ? 'none' : '1px solid #3a3a3c', borderRadius: 10, padding: '8px 10px' }}>
                {m.texto && m.tipo === 'texto' && <div style={{ fontSize: 13, color: '#fff', whiteSpace: 'pre-wrap' }}>{m.texto}</div>}
                {m.tipo !== 'texto' && <>{renderMidia(m)}{m.texto && m.tipo !== 'documento' && <div style={{ fontSize: 12, color: '#d1d1d1', marginTop: 4 }}>{m.texto}</div>}</>}
                <div style={{ fontSize: 9, color: eu ? '#a7f3d0' : '#6b7280', marginTop: 4, textAlign: 'right' }}>
                  {new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #3a3a3c', alignItems: 'center' }}>
        <input ref={fileRef} type="file" style={{ display: 'none' }}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={e => { const f = e.target.files?.[0]; if (f) enviarAnexo(f); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={enviando || gravando} title="Anexar arquivo"
          style={{ ...btnPrimary, background: '#3a3a3c', minWidth: 44, padding: '8px' }}>📎</button>
        <input style={inp} placeholder="Mensagem..." value={texto} disabled={gravando}
          onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviarTexto() }} />
        {texto.trim() ? (
          <button onClick={enviarTexto} disabled={enviando} style={{ ...btnPrimary, background: '#25D366', minWidth: 70 }}>{enviando ? '...' : 'Enviar'}</button>
        ) : gravando ? (
          <button onClick={pararGravacao} style={{ ...btnPrimary, background: '#dc2626', minWidth: 70 }}>⏹ Parar</button>
        ) : (
          <button onClick={iniciarGravacao} disabled={enviando} style={{ ...btnPrimary, background: '#3a3a3c', minWidth: 70 }}>🎤</button>
        )}
      </div>
      {gravando && <div style={{ fontSize: 11, color: '#f87171', padding: '0 12px 8px' }}>● Gravando... clica em Parar pra enviar</div>}
      {erro && <div style={{ fontSize: 11, color: '#f87171', padding: '0 12px 8px' }}>{erro}</div>}
    </>
  )
}