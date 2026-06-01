'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro('')

    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 20))

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    console.log('data:', data)
    console.log('error:', error)

    if (error) {
      setErro('Erro: ' + error.message)
      setCarregando(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#1c1c1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
          <Image src="/logo.png" alt="CarreiraNoDigital" width={200} height={60} style={{ objectFit: 'contain' }} />
        </div>

        <div style={{ backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '16px', padding: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>Acesso ao sistema</h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>Entre com suas credenciais</p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                style={{ width: '100%', backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Senha</label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: '100%', backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {erro && (
              <div style={{ backgroundColor: '#450a0a', border: '1px solid #f87171', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: '#f87171', margin: 0 }}>{erro}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              style={{ width: '100%', backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              {carregando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#48484a', marginTop: '24px' }}>
          Sistema interno CarreiraNoDigital
        </p>
      </div>
    </div>
  )
}