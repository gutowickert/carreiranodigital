'use client'

import { useEffect } from 'react'

// Avisa o sistema que a proposta foi aberta. Roda no navegador do cliente, uma vez por carregamento;
// a rota é que decide se conta (uma por hora por aparelho).
// Falhar aqui não pode atrapalhar a leitura: por isso o catch vazio.
export default function Abertura({ slug }: { slug: string }) {
  useEffect(() => {
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
