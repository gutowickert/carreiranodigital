'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const modulos = [
  { nome: 'Painel', href: '/dashboard', icon: '⊞' },
  { nome: 'Turmas', href: '/dashboard/turmas', icon: '🎓' },
  { nome: 'Tarefas', href: '/dashboard/tarefas', icon: '✓' },
  { nome: 'Financeiro', href: '/dashboard/financeiro', icon: '₢' },
  { nome: 'Leads', href: '/dashboard/leads', icon: '◎' },
  { nome: 'Alunos', href: '/dashboard/alunos', icon: '👥' },
  { nome: 'Professores', href: '/dashboard/professores', icon: '👤' },
  { nome: 'Salas', href: '/dashboard/salas', icon: '🏛' },
  { nome: 'Cidades', href: '/dashboard/cidades', icon: '📍' },
  { nome: 'Usuários', href: '/dashboard/usuarios', icon: '🔑' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<any>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/')
      else setUsuario(data.user)
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!usuario) return null

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '##1c1c1e' }}>
      {/* Menu lateral */}
      <div className="flex-shrink-0" style={{ width: '224px' }}>
        <div style={{
          width: '224px',
          backgroundColor: '#2c2c2e',
          borderRight: '1px solid #2a2b35',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          zIndex: 40,
        }}>
          {/* Logo */}
          <div style={{ padding: '20px 16px', borderBottom: '1px solid #2a2b35', flexShrink: 0 }}>
            <Image src="/logo.png" alt="CarreiraNoDigital" width={160} height={48} style={{ objectFit: 'contain' }} />
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {modulos.map((m) => {
              const ativo = pathname === m.href || (m.href !== '/dashboard' && pathname.startsWith(m.href))
              return (
                <Link key={m.href} href={m.href} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: '500', textDecoration: 'none',
                  backgroundColor: ativo ? '#7c3aed' : 'transparent',
                  color: ativo ? '#ffffff' : '#9ca3af',
                }}>
                  <span>{m.icon}</span>
                  {m.nome}
                </Link>
              )
            })}
          </nav>

          {/* Usuário */}
          <div style={{ padding: '16px', borderTop: '1px solid #2a2b35', flexShrink: 0 }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {usuario.email}
            </div>
            <button onClick={handleLogout} style={{ fontSize: '12px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Sair →
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, minWidth: 0, backgroundColor: '#1c1c1e' }}>
        {children}
      </div>
    </div>
  )
}