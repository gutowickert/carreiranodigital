'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setCarregando(false)
    if (error) { setErro('E-mail ou senha inválidos.'); return }
    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c1c1e', padding: 20 }}>
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 380, background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ textAlign: 'center', marginBottom: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Image src="/logo.png" alt="CarreiraNoDigital" width={220} height={66} style={{ objectFit: 'contain' }} priority />
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Entrar no sistema</p>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 4 }}>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
            style={{ width: '100%', background: '#3a3a3c', border: '1px solid #48484a', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#fff', outline: 'none' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Senha</label>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
            style={{ width: '100%', background: '#3a3a3c', border: '1px solid #48484a', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#fff', outline: 'none' }} />
        </div>
        {erro && <div style={{ fontSize: 13, color: '#f87171' }}>{erro}</div>}
        <button type="submit" disabled={carregando || !email || !senha}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, cursor: (carregando || !email || !senha) ? 'default' : 'pointer', opacity: (carregando || !email || !senha) ? 0.6 : 1, marginTop: 4 }}>
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}