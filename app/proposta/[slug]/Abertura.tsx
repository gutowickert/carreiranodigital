'use client'

import { useEffect } from 'react'

// Avisa o sistema que a proposta foi aberta. Roda no navegador do cliente, uma vez por carregamento;
// a rota é que decide se conta (uma por hora por aparelho).
// Falhar aqui não pode atrapalhar a leitura: por isso o catch vazio.
//
// ⚠️ ABERTURA DE DENTRO DE CASA NÃO CONTA. Os links do CRM levam `?eu=1`: quando o vendedor abre a
// proposta pra conferir antes de mandar, isso não pode virar "o cliente abriu" — nem no selo do
// card, nem no aviso no celular. Metade das aberturas registradas até 23/09/2026 era do próprio
// time, e o selo verde do card estava mentindo por causa disso.
export default function Abertura({ slug }: { slug: string }) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('eu') === '1') return
    const t = setTimeout(() => {
      fetch('/api/orcamentos/aberto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, de: document.referrer || '' }),
        keepalive: true,
      }).catch(() => { })
    }, 1500) // 1,5s: quem fechou na hora não abriu de verdade
    return () => clearTimeout(t)
  }, [slug])
  return null
}
