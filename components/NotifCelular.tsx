'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlB64ToUint8(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const b64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/**
 * O AVISO NO CELULAR.
 *
 * ⚠️ "ATIVAS" NÃO PODE SIGNIFICAR "O NAVEGADOR TEM UMA INSCRIÇÃO". Significava, e é o que deixou o
 * Rick meses sem receber nada achando que estava tudo certo: a tela olhava só
 * `pushManager.getSubscription()`, via que existia e escrevia "Notificações ativas neste aparelho".
 *
 * O problema é que o SERVIDOR pode não ter aquela inscrição. Ele apaga endereço morto sozinho
 * (lib/push.ts, erro 410 da Apple/Google), e o cadastro também pode ter falhado uma única vez lá
 * atrás. Quando isso acontece, o navegador continua inscrito, a tela continua dizendo "ativas", o
 * botão de ativar SOME — e não existe nenhum caminho de volta. A pessoa não tem o que clicar.
 *
 * Agora o aparelho se REAPRESENTA ao servidor a cada carga da tela. O cadastro é idempotente
 * (upsert pelo endereço), então reapresentar não cria nada novo — só conserta o que faltava. E
 * "ativas" só aparece depois que o servidor confirma; se ele não confirmar, volta o botão.
 */
export default function NotifCelular() {
  const [estado, setEstado] = useState<'inicial' | 'ok' | 'erro' | 'indisponivel'>('inicial')

  // ⚠️ VAI COM O LOGIN. Sem ele o servidor não sabe de QUEM é o aparelho — as três inscrições que
  // existiam estavam todas com o dono em branco, e não havia como responder "o Rick está inscrito?".
  async function registrar(sub: PushSubscription): Promise<boolean> {
    try {
      const r = await fetchAuth('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      }).then(r => r.json())
      return !!r?.ok
    } catch { return false }
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !PUB) { setEstado('indisponivel'); return }
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      if (!sub) return                      // nunca ativou: fica o botão
      setEstado(await registrar(sub) ? 'ok' : 'inicial')
    }).catch(() => { })
  }, [])

  async function ativar() {
    try {
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setEstado('erro'); return }
      // pode já existir (permissão dada, cadastro perdido): reaproveita em vez de criar outra
      const sub = (await reg.pushManager.getSubscription())
        || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(PUB) }))
      setEstado(await registrar(sub) ? 'ok' : 'erro')
    } catch { setEstado('erro') }
  }

  if (estado === 'indisponivel') return null
  if (estado === 'ok') return <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 8 }}>🔔 Notificações ativas neste aparelho</div>
  return (
    <>
      <button onClick={ativar} style={{ marginTop: 8, width: '100%', background: '#25D366', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, color: '#063', fontWeight: 600, cursor: 'pointer' }}>
        🔔 Ativar notificações no celular
      </button>
      {estado === 'erro' && (
        <div style={{ fontSize: 10.5, color: 'var(--amber)', marginTop: 5, lineHeight: 1.4 }}>
          Não consegui ativar. Confere se as notificações deste site estão bloqueadas no navegador.
        </div>
      )}
    </>
  )
}
