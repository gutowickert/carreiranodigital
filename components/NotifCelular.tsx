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
  const [endereco, setEndereco] = useState('')      // o endereço DESTE aparelho, pro teste
  const [teste, setTeste] = useState('')

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
      setEndereco(sub.endpoint)
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
      setEndereco(sub.endpoint)
      setEstado(await registrar(sub) ? 'ok' : 'erro')
    } catch { setEstado('erro') }
  }

  // ⚠️ O TESTE É O QUE FALTAVA. "Notificações ativas" sem nada pra clicar deixa quem não recebe
  // sem saída: não dá pra saber se o problema é o cadastro, o envio ou o aparelho, e não dá nem
  // pra tentar. Com o botão, a resposta vem em cinco segundos e o aparelho se recadastra sozinho
  // se o cadastro estiver vencido.
  async function testar() {
    setTeste('mandando…')
    const j = await fetchAuth('/api/push/testar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: endereco }),
    }).then(r => r.json()).catch(() => null)
    if (j?.ok) { setTeste('mandei — se não chegar em alguns segundos, o bloqueio é do aparelho'); return }
    setTeste(j?.error || 'não consegui mandar')
    if (j?.recadastrar) setEstado('inicial')
  }

  // ⚠️ DESLIGA NO NAVEGADOR PRIMEIRO, no servidor depois. A tela se reapresenta ao servidor a cada
  // carga: apagar só a linha faria a inscrição voltar sozinha no próximo F5. Um botão de desligar
  // que não desliga é pior que não ter botão.
  async function desativar() {
    setTeste('desligando…')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub && !(await sub.unsubscribe())) { setTeste('o navegador não deixou desligar'); return }
      await fetchAuth('/api/push/desinscrever', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endereco || sub?.endpoint }),
      }).catch(() => null)
      setEndereco(''); setTeste(''); setEstado('inicial')
    } catch { setTeste('não consegui desligar') }
  }

  if (estado === 'indisponivel') return null
  if (estado === 'ok') return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--green)' }}>🔔 Notificações ativas neste aparelho</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 5 }}>
        <button onClick={desativar} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '5px', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
          Desativar
        </button>
        {/* O teste fica, pequeno: foi ele que achou em 5 segundos o que custou semanas de palpite. */}
        <button onClick={testar} title="Manda um aviso de teste só pra este aparelho"
          style={{ background: 'none', border: 'none', padding: '5px 2px', fontSize: 10.5, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}>
          testar
        </button>
      </div>
      {teste && <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 5, lineHeight: 1.4 }}>{teste}</div>}
    </div>
  )
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
