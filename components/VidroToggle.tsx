'use client'

import { useEffect, useState } from 'react'
import { Layers, Square } from 'lucide-react'

// Liga/desliga os EFEITOS DE VIDRO nesta máquina (pedido do Nando, 11/09: "deixa a opção do vidro
// pra se travar em alguma máquina"). Guarda no localStorage — é por navegador, não por usuário: a
// máquina fraca é que engasga, não a pessoa. Desligado, todo desfoque some e as superfícies viram
// sólidas (globals.css, [data-vidro="off"]). Aplicado antes de pintar pelo script do app/layout.tsx.
export default function VidroToggle({ compacto = false }: { compacto?: boolean }) {
  const [ligado, setLigado] = useState(true)

  useEffect(() => {
    setLigado(document.documentElement.getAttribute('data-vidro') !== 'off')
  }, [])

  function alternar() {
    const agora = document.documentElement.getAttribute('data-vidro') !== 'off'
    const novo = !agora
    if (novo) document.documentElement.removeAttribute('data-vidro')
    else document.documentElement.setAttribute('data-vidro', 'off')
    setLigado(novo)
    try { localStorage.setItem('vidro', novo ? 'on' : 'off') } catch { /* ignore */ }
  }

  const titulo = ligado ? 'Efeitos de vidro ligados — clique se o sistema engasgar nesta máquina' : 'Efeitos de vidro desligados nesta máquina — clique pra ligar'
  return (
    <button onClick={alternar} title={titulo} aria-label={titulo}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: compacto ? 34 : '100%', height: 34, flexShrink: 0,
        background: 'var(--glass-field)', color: ligado ? 'var(--text-2)' : 'var(--text-faint)',
        border: '1px solid var(--glass-border)', borderRadius: compacto ? '50%' : 'var(--r)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>
      {ligado ? <Layers size={15} /> : <Square size={15} />}
      {!compacto && <span>{ligado ? 'Vidro ligado' : 'Vidro desligado'}</span>}
    </button>
  )
}
