'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '1272702527991878'
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID || ''

export default function WhatsAppConectar() {
  const [pronto, setPronto] = useState(false)
  const [status, setStatus] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [contas, setContas] = useState<any[]>([])
  const sessao = useRef<{ phone_number_id?: string; waba_id?: string }>({})

  async function carregarContas() {
    const j = await fetchAuth('/api/wa-oficial/conectar').then(r => r.json()).catch(() => null)
    if (j?.ok) setContas(j.contas || [])
  }

  useEffect(() => {
    carregarContas()
    // captura phone_number_id/waba_id que o Embedded Signup manda por postMessage
    const onMsg = (event: MessageEvent) => {
      if (!/facebook\.com$/.test(new URL(event.origin).hostname)) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.data) {
          sessao.current = { phone_number_id: data.data.phone_number_id, waba_id: data.data.waba_id }
        }
      } catch { /* ignora mensagens que não são JSON */ }
    }
    window.addEventListener('message', onMsg)

    // carrega o SDK do Facebook
    ;(window as any).fbAsyncInit = function () {
      ;(window as any).FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v25.0' })
      setPronto(true)
    }
    if (!document.getElementById('fb-sdk')) {
      const s = document.createElement('script')
      s.id = 'fb-sdk'; s.async = true; s.defer = true; s.crossOrigin = 'anonymous'
      s.src = 'https://connect.facebook.net/en_US/sdk.js'
      document.body.appendChild(s)
    } else if ((window as any).FB) setPronto(true)

    return () => window.removeEventListener('message', onMsg)
  }, [])

  function conectar() {
    const FB = (window as any).FB
    if (!FB) { setStatus('SDK do Facebook ainda carregando, tenta de novo em 1s.'); return }
    if (!CONFIG_ID) { setStatus('Falta NEXT_PUBLIC_META_CONFIG_ID (o ID da configuração de Embedded Signup do Meta).'); return }
    sessao.current = {}
    setOcupado(true); setStatus('Abrindo o login do WhatsApp…')
    FB.login(async (response: any) => {
      const code = response?.authResponse?.code
      if (!code) { setOcupado(false); setStatus('Login cancelado ou sem permissão.'); return }
      setStatus('Conectando o número ao sistema…')
      const r = await fetchAuth('/api/wa-oficial/conectar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, phoneNumberId: sessao.current.phone_number_id, wabaId: sessao.current.waba_id, rotulo: 'Coexistência (atendimento)' }),
      }).then(r => r.json()).catch(() => null)
      setOcupado(false)
      if (r?.ok) { setStatus(`✅ Conectado! Número ${r.phoneNumberId || ''} pronto. ${r.inscrito ? 'Webhook inscrito.' : ''}`); carregarContas() }
      else setStatus('Falha: ' + (r?.error || '?'))
    }, {
      config_id: CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    })
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🔗 Conectar WhatsApp (Coexistência)</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Conecta o número que já está no app WhatsApp Business à API oficial, SEM tirar ele do celular. Depois o follow-up frio vai por template e a conversa segue livre quando o lead responde.</p>

      <div style={{ ...card, padding: 16, marginTop: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Antes de conectar, no Meta:</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
          <li>O número tem que estar no app <b>WhatsApp Business</b> (verde) — ✓ já está.</li>
          <li>No app Meta (developers), adicionar <b>“Login do Facebook para Empresas”</b> e criar uma <b>configuração de Embedded Signup com Coexistência</b> — isso gera um <code>config_id</code>.</li>
          <li>Setar na Vercel: <code>NEXT_PUBLIC_META_CONFIG_ID</code> (o config_id), <code>META_APP_SECRET</code> (segredo do app) e <code>NEXT_PUBLIC_META_APP_ID</code> (se for outro app).</li>
        </ol>
      </div>

      <button onClick={conectar} disabled={!pronto || ocupado} style={{ marginTop: 16, background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 22px', fontSize: 15, fontWeight: 800, cursor: (pronto && !ocupado) ? 'pointer' : 'default', opacity: (pronto && !ocupado) ? 1 : 0.6 }}>
        {ocupado ? 'Conectando…' : pronto ? '🟢 Conectar meu WhatsApp' : 'Carregando…'}
      </button>
      {status && <div style={{ marginTop: 12, fontSize: 13, color: status.startsWith('✅') ? 'var(--green)' : status.startsWith('Falha') || status.startsWith('Falta') ? 'var(--red)' : 'var(--text-2)' }}>{status}</div>}

      {contas.length > 0 && (
        <div style={{ ...card, padding: 14, marginTop: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Números conectados</div>
          {contas.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text)' }}>{c.rotulo} <span style={{ color: 'var(--text-faint)', fontFamily: 'monospace' }}>· {c.phone_number_id}</span></span>
              <span style={{ color: c.ativo ? 'var(--green)' : 'var(--text-faint)' }}>{c.ativo ? 'ativo' : 'inativo'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
