'use client'
// As telas trocam pelo # do endereço: #/agenda?d=2026-11-06. Assim o "voltar" do celular funciona
// e o app instalado abre sempre em /psi.
import { useEffect, useState } from 'react'

export interface Rota { caminho: string[]; q: URLSearchParams }

let navegou = false // já trocou de tela dentro do app? (então dá pra usar o "voltar" do navegador)

const ler = (): Rota => {
  const h = (typeof window === 'undefined' ? '' : window.location.hash).replace(/^#/, '') || '/'
  const [p, q = ''] = h.split('?')
  return { caminho: p.split('/').filter(Boolean), q: new URLSearchParams(q) }
}

export function useRota(): Rota {
  const [r, setR] = useState<Rota>({ caminho: ['carregando'], q: new URLSearchParams() })
  useEffect(() => {
    setR(ler())
    const mudou = () => { navegou = true; setR(ler()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', mudou)
    return () => window.removeEventListener('hashchange', mudou)
  }, [])
  return r
}

/** monta '#/registrar?pac=..' ignorando parâmetros vazios */
export function link(caminho: string, q?: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q || {})) if (v !== null && v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return `#${caminho}${s ? '?' + s : ''}`
}

export function ir(destino: string, substituir = false) {
  if (substituir) window.location.replace(destino)
  else window.location.hash = destino.replace(/^#/, '')
}

/** volta pra tela anterior; se abriu direto (sem histórico), vai pro destino dado ou pro início */
export function voltar(senao?: string) {
  if (navegou) window.history.back()
  else ir(senao || '#/', true)
}
