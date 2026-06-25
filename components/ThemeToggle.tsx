'use client'

import { useEffect, useState } from 'react'

// Botão de tema claro/escuro. Troca o data-theme no <html> e salva no localStorage.
// O tema é aplicado antes de pintar pelo script no app/layout.tsx (sem flash).
export default function ThemeToggle({ compacto = false }: { compacto?: boolean }) {
  const [claro, setClaro] = useState(false)

  useEffect(() => {
    setClaro(document.documentElement.getAttribute('data-theme') === 'light')
  }, [])

  // TEMP: botão desligado enquanto o tema claro é ajustado (sistema fica no escuro).
  return null

  function alternar() {
    const novo = !claro
    setClaro(novo)
    document.documentElement.setAttribute('data-theme', novo ? 'light' : 'dark')
    try { localStorage.setItem('tema', novo ? 'claro' : 'escuro') } catch { /* ignore */ }
  }

  return (
    <button
      onClick={alternar}
      title={claro ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: compacto ? 40 : '100%', height: 40,
        background: 'var(--surface-2)', color: 'var(--text-2)',
        border: '1px solid var(--border)', borderRadius: 8,
        fontSize: 13, fontWeight: 500, cursor: 'pointer',
      }}
    >
      {claro ? '🌙' : '☀️'}{!compacto && <span>{claro ? 'Tema escuro' : 'Tema claro'}</span>}
    </button>
  )
}
