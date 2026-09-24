'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Avisa o sistema que a proposta foi aberta. Roda no navegador do cliente, uma vez por carregamento;
// a rota é que decide se conta (uma por hora por aparelho).
// Falhar aqui não pode atrapalhar a leitura: por isso o catch vazio.
//
// ⚠️ ABERTURA DE DENTRO DE CASA NÃO CONTA. Os links do CRM levam `?eu=1`: quando o vendedor abre a
// proposta pra conferir antes de mandar, isso não pode virar "o cliente abriu" — nem no selo do
// card, nem no aviso no celular. Metade das aberturas registradas até 23/09/2026 era do próprio
// time, e o selo verde do card estava mentindo por causa disso.
//
// ⚠️ MAS `?eu=1` SÓ PROTEGE QUEM CLICA NO CRM. O caminho que o time usa de verdade é outro: publica,
// o sistema COPIA O LINK pra mandar no WhatsApp, e o time cola esse link no navegador pra conferir.
// Esse link é o do cliente, sem marca nenhuma e sem referência de origem — contava como leitura, e
// o vendedor recebia aviso de uma abertura que nunca existiu.
//
// A terceira trava fecha pelo lado certo: quem está LOGADO NO CRM não é o cliente. O cliente não
// tem conta, não tem sessão, e nunca vai ter.
export default function Abertura({ slug }: { slug: string }) {
  const [deCasa, setDeCasa] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('eu') === '1') return
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session) { if (vivo) setDeCasa(true); return }
      } catch { /* sem sessão legível: segue e conta, que é o caso do cliente */ }
      if (!vivo) return
      fetch('/api/orcamentos/aberto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, de: document.referrer || '' }),
        keepalive: true,
      }).catch(() => { })
    }, 1500) // 1,5s: quem fechou na hora não abriu de verdade
    return () => { vivo = false; clearTimeout(t) }
  }, [slug])

  // ⚠️ CORRIGIR CALADO ENSINA ERRADO. Sem este aviso, quem cola o link do cliente no navegador
  // continua achando que está tudo bem — e no dia em que abrir de um aparelho sem login, volta a
  // disparar aviso falso. O aviso diz o que aconteceu e mostra o caminho certo, que é o botão de
  // prévia dentro do CRM.
  if (!deCasa) return null
  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 50, maxWidth: 560, margin: '0 auto',
      background: '#17132a', color: '#f4f1fb', borderRadius: 12, padding: '12px 15px',
      fontFamily: "'Manrope',system-ui,sans-serif", fontSize: 13, lineHeight: 1.5,
      boxShadow: '0 10px 30px rgba(0,0,0,.35)',
    }}>
      <b>Tu está lendo o link do cliente.</b> Esta abertura <b>não foi contada</b> e ninguém recebeu
      aviso de leitura. Pra conferir a proposta, usa <b>“Ver como ficou”</b> na tela do orçamento —
      lá dá pra abrir antes de publicar.
    </div>
  )
}
