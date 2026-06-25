'use client'

import { useEffect, useState } from 'react'

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlB64ToUint8(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const b64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export default function NotifCelular() {
  const [estado, setEstado] = useState<'inicial' | 'ok' | 'erro' | 'indisponivel'>('inicial')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !PUB) { setEstado('indisponivel'); return }
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      if (sub) setEstado('ok')
    }).catch(() => {})
  }, [])

  async function ativar() {
    try {
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setEstado('erro'); return }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(PUB) })
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) })
      setEstado('ok')
    } catch { setEstado('erro') }
  }

  if (estado === 'indisponivel') return null
  if (estado === 'ok') return <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 8 }}>🔔 Notificações ativas neste aparelho</div>
  return (
    <button onClick={ativar} style={{ marginTop: 8, width: '100%', background: '#25D366', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, color: '#063', fontWeight: 600, cursor: 'pointer' }}>
      🔔 Ativar notificações no celular
    </button>
  )
}
