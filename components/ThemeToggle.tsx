'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

// Botão de tema claro/escuro. Troca o data-theme no <html> e salva no localStorage.
// O tema é aplicado antes de pintar pelo script no app/layout.tsx (sem flash).
export default function ThemeToggle({ compacto = false }: { compacto?: boolean }) {
  const [claro, setClaro] = useState(false)

  useEffect(() => {
    setClaro(document.documentElement.getAttribute('data-theme') === 'light')
  }, [])

  function alternar() {
    // Lê o estado REAL do DOM (mais confiável que o state do React).
    const estaClaro = document.documentElement.getAttribute('data-theme') === 'light'
    const novo = !estaClaro
    document.documentElement.setAttribute('data-theme', novo ? 'light' : 'dark')
    setClaro(novo)
    try { localStorage.setItem('tema', novo ? 'claro' : 'escuro') } catch { /* ignore */ }
  }

  return (
    <button
      onClick={alternar}
      title={claro ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
      aria-label={claro ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: compacto ? 34 : '100%', height: 34, flexShrink: 0,
        background: 'var(--glass-field)', color: 'var(--text-2)',
        border: '1px solid var(--glass-border)', borderRadius: compacto ? '50%' : 'var(--r)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {claro ? <Moon size={15} /> : <Sun size={15} />}
      {!compacto && <span>{claro ? 'Tema escuro' : 'Tema claro'}</span>}
    </button>
  )
}
