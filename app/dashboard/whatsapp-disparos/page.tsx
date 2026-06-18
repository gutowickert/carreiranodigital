'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { iniciarGravacaoOpus, type GravadorOpus } from '@/lib/audio'

// Caixa de entrada do NÚMERO DE DISPAROS (Cloud API / API oficial). Recebe as
// respostas dos disparos (canal 'oficial'). Responder = mensagem de sessão (24h).
type Conversa = {
  id: string; telefone: string; nome: string | null
  lead_id: string | null; aluno_id: string | null
  ultima_msg: string | null; ultima_msg_em: string | null; nao_lidas: number
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function CaixaDisparos() {
  const [autorizado, setAutorizado] = useState<boolean | null>(null)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [ativa, setAtiva] = useState<Conversa | null>(null)
  const [busca, setBusca] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const f = () => setIsMobile(window.innerWidth < 768)
    f(); window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])

  useEffect(() => {
    async function checar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setAutorizado(false); return }
      const { data: p } = await supabase.from('usuarios_perfil').select('papel, wa_caixa').eq('id', session.user.id).single()
      const ok = p?.papel === 'admin' || p?.wa_caixa === true
      setAutorizado(ok)
      if (ok) carregarConversas()
    }
    checar()
  }, [])

  async function carregarConversas() {
    const { data } = await supabase.from('wa_conversas')
      .select('*').eq('canal', 'oficial')
      .order('ultima_msg_em', { ascending: false, nullsFirst: false })
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
  const mostrarLista = !isMobile || !ativa
  const mostrarChat = !isMobile || !!ativa

  return (
    <Layout>
      <div style={{ padding: isMobile ? '10px' : '24px 32px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {(!isMobile || !ativa) && (
          <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: '#fff', margin: isMobile ? '0 0 10px' : '0 0 16px' }}>
            WhatsApp Disparos <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>· respostas do número de disparo</span>
          </h1>
        )}
        <div style={{ flex: 1, display: 'flex', gap: isMobile ? 0 : 16, minHeight: 0 }}>
          {mostrarLista && (
            <div style={{ ...card, width: isMobile ? '100%' : 320, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: 12, borderBottom: '1px solid #3a3a3c' }}>
                <input style={inp} placeholder="Buscar nome ou telefone..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {conversasFiltradas.length === 0 && <p style={{ padding: 16, fontSize: 13, color: '#6b7280' }}>Nenhuma resposta ainda.</p>}
                {conversasFiltradas.map(c => {
                  const sel = ativa?.id === c.id
                  return (
                    <div key={c.id} onClick={() => abrir(c)}
                      style={{ padding: '12px 14px', borderBottom: '1px solid #3a3a3c', cursor: 'pointer', background: sel ? '#1c1c1e' : 'transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{c.nome || c.telefone}</span>
                        {c.nao_lidas > 0 && <span style={{ fontSize: 11, background: '#25D366', color: '#063', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>{c.nao_lidas}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 4 }}>{c.ultima_msg || '—'}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {mostrarChat && (
            <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {ativa ? (
                <>
                  {isMobile && (
                    <button onClick={() => setAtiva(null)} style={{ textAlign: 'left', background: '#1c1c1e', border: 'none', borderBottom: '1px solid #3a3a3c', color: '#a78bfa', fontSize: 14, fontWeight: 600, padding: '10px 14px', cursor: 'pointer' }}>← Voltar</button>
                  )}
                  <ChatDisparo conversa={ativa} onEnviou={carregarConversas} onConversaChange={setAtiva} />
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14 }}>Selecione uma conversa</div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

function ChatDisparo({ conversa, onEnviou, onConversaChange }: { conversa: Conversa; onEnviou: () => void; onConversaChange: (c: Conversa) => void }) {
  const [mensagens, setMensagens] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [criandoLead, setCriandoLead] = useState(false)
  const [gravando, setGravando] = useState(false)
  const fimRef = useRef<HTMLDivElement | null>(null)
  const gravadorRef = useRef<GravadorOpus | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  const erroEnvio = (json: any) => json.foraJanela ? 'Fora da janela de 24h — só dá pra reabrir com um template aprovado.' : (json.error || 'falha ao enviar')

  async function enviarAnexo(file: File) {
    setEnviando(true); setErro('')
    const ehImagem = file.type.startsWith('image/')
    const reader = new FileReader()
    reader.onloadend = async () => {
      try {
        const res = await fetch('/api/wa-oficial/responder', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversaId: conversa.id, telefone: conversa.telefone, anexoBase64: reader.result, anexoNome: file.name, anexoTipo: ehImagem ? 'imagem' : 'documento' }),
        })
        const json = await res.json()
        if (json.ok) { carregar(); onEnviou() } else setErro(erroEnvio(json))
      } catch { setErro('erro de rede') } finally { setEnviando(false) }
    }
    reader.readAsDataURL(file)
  }

  async function iniciarGravacao() {
    setErro('')
    try { gravadorRef.current = await iniciarGravacaoOpus(); setGravando(true) } catch { setErro('Sem acesso ao microfone') }
  }
  async function pararGravacao() {
    const g = gravadorRef.current; gravadorRef.current = null; setGravando(false)
    if (!g) return
    setEnviando(true)
    try {
      const audioBase64 = await g.parar()
      const res = await fetch('/api/wa-oficial/responder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaId: conversa.id, telefone: conversa.telefone, audioBase64 }),
      })
      const json = await res.json()
      if (json.ok) { carregar(); onEnviou() } else setErro(erroEnvio(json))
    } catch { setErro('erro ao processar áudio') } finally { setEnviando(false) }
  }

  function renderMidia(m: any) {
    if (m.tipo === 'imagem' && m.midia_url) return <img src={m.midia_url} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4 }} />
    if (m.tipo === 'audio' && m.midia_url) return <audio controls src={m.midia_url} style={{ width: '100%', marginTop: 4, height: 34 }} />
    if (m.tipo === 'video' && m.midia_url) return <video controls src={m.midia_url} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4 }} />
    if (m.tipo === 'documento' && m.midia_url) return <a href={m.midia_url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontSize: 12 }}>📎 {m.texto || 'documento'}</a>
    if (m.tipo === 'audio') return <span style={{ fontSize: 12, opacity: 0.8 }}>🎤 Áudio</span>
    if (m.tipo === 'imagem') return <span style={{ fontSize: 12, opacity: 0.8 }}>📷 Imagem</span>
    return null
  }

  async function carregar() {
    const { data } = await supabase.from('wa_mensagens').select('*').eq('conversa_id', conversa.id).order('criado_em', { ascending: true })
    setMensagens(data || [])
  }
  useEffect(() => { carregar(); const t = setInterval(carregar, 5000); return () => clearInterval(t) }, [conversa.id])
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens.length])

  // janela de 24h: dá pra responder com texto livre só se a última msg recebida foi < 24h
  const ultimaRecebida = [...mensagens].reverse().find(m => m.direcao === 'recebida')
  const dentroJanela = ultimaRecebida ? (Date.now() - new Date(ultimaRecebida.criado_em).getTime()) < 24 * 3600 * 1000 : false

  async function enviarTexto() {
    if (!texto.trim()) return
    setEnviando(true); setErro('')
    try {
      const res = await fetch('/api/wa-oficial/responder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaId: conversa.id, telefone: conversa.telefone, texto }),
      })
      const json = await res.json()
      if (json.ok) { setTexto(''); carregar(); onEnviou() }
      else setErro(json.foraJanela ? 'Fora da janela de 24h — só dá pra reabrir com um template aprovado.' : (json.error || 'falha ao enviar'))
    } catch (e: any) { setErro((e && e.message) || 'erro de rede') }
    finally { setEnviando(false) }
  }

  async function criarLead() {
    setCriandoLead(true); setErro('')
    try {
      const { data: novo, error } = await supabase.from('leads').insert({
        nome: conversa.nome || conversa.telefone, whatsapp: conversa.telefone,
        etapa: 'aguardando_atendimento', origem: 'whatsapp',
      }).select('id').single()
      if (error || !novo) { setErro('Erro ao criar lead'); return }
      await supabase.from('wa_conversas').update({ lead_id: novo.id }).eq('id', conversa.id)
      onConversaChange({ ...conversa, lead_id: novo.id }); onEnviou()
      router.push(`/dashboard/crm?lead=${novo.id}`)
    } catch (e: any) { setErro((e && e.message) || 'erro ao criar lead') }
    finally { setCriandoLead(false) }
  }

  return (
    <>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #3a3a3c', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          {conversa.lead_id ? (
            <a href={`/dashboard/crm?lead=${conversa.lead_id}`} style={{ fontSize: 15, fontWeight: 600, color: '#a78bfa', textDecoration: 'none' }}>{conversa.nome || conversa.telefone} ↗</a>
          ) : (
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{conversa.nome || conversa.telefone}</div>
          )}
          <div style={{ fontSize: 11, color: '#6b7280' }}>{conversa.telefone}</div>
        </div>
        {conversa.lead_id ? (
          <a href={`/dashboard/crm?lead=${conversa.lead_id}`} style={{ background: '#2e1065', color: '#a78bfa', border: '1px solid #a78bfa40', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>Abrir card</a>
        ) : (
          <button onClick={criarLead} disabled={criandoLead} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: criandoLead ? 0.6 : 1 }}>{criandoLead ? '...' : '+ Criar lead'}</button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6, background: '#1c1c1e' }}>
        {mensagens.map(m => {
          const eu = m.direcao === 'enviada'
          return (
            <div key={m.id} style={{ alignSelf: eu ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
              <div style={{ background: eu ? '#075E54' : '#2c2c2e', border: eu ? 'none' : '1px solid #3a3a3c', borderRadius: 10, padding: '8px 10px' }}>
                {m.tipo === 'texto'
                  ? <div style={{ fontSize: 13, color: '#fff', whiteSpace: 'pre-wrap' }}>{m.texto}</div>
                  : <>{renderMidia(m)}{m.texto && m.tipo !== 'documento' && <div style={{ fontSize: 12, color: '#d1d1d1', marginTop: 4 }}>{m.texto}</div>}</>}
                <div style={{ fontSize: 9, color: eu ? '#a7f3d0' : '#6b7280', marginTop: 4, textAlign: 'right' }}>
                  {new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>
      {!dentroJanela && (
        <div style={{ fontSize: 11, color: '#fbbf24', padding: '8px 12px', background: '#27200a', borderTop: '1px solid #3a3a3c' }}>
          ⚠️ Fora da janela de 24h (ou sem resposta ainda) — texto livre pode não entregar; nesse caso só com template aprovado.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #3a3a3c', alignItems: 'center' }}>
        <input ref={fileRef} type="file" style={{ display: 'none' }}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={e => { const f = e.target.files?.[0]; if (f) enviarAnexo(f); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={enviando || gravando} title="Anexar arquivo"
          style={{ ...btnPrimary, background: '#3a3a3c', minWidth: 44, padding: '8px' }}>📎</button>
        <input style={inp} placeholder="Resposta..." value={texto} disabled={gravando}
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
