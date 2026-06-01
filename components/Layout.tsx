'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const modulos = [
  { nome: 'Painel', href: '/dashboard', icon: '🏠' },
  { nome: 'Turmas', href: '/dashboard/turmas', icon: '📚' },
  { nome: 'Tarefas', href: '/dashboard/tarefas', icon: '✅' },
  { nome: 'Financeiro', href: '/dashboard/financeiro', icon: '💰' },
  { nome: 'Leads', href: '/dashboard/leads', icon: '🎯' },
  { nome: 'Alunos', href: '/dashboard/alunos', icon: '👥' },
  { nome: 'Professores', href: '/dashboard/professores', icon: '👤' },
  { nome: 'Salas', href: '/dashboard/salas', icon: '🏛' },
  { nome: 'Cidades', href: '/dashboard/cidades', icon: '📍' },
  { nome: 'Usuarios', href: '/dashboard/usuarios', icon: '🔑' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#1c1c1e' }}>
      <div style={{ flexShrink: 0, width: '224px' }}>
        <div style={{
          width: '224px',
          backgroundColor: '#2c2c2e',
          borderRight: '1px solid #3a3a3c',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          zIndex: 40,
        }}>
          <div style={{ padding: '20px 16px', borderBottom: '1px solid #3a3a3c', flexShrink: 0 }}>
            <Image src="/logo.png" alt="CarreiraNoDigital" width={160} height={48} style={{ objectFit: 'contain' }} />
          </div>

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

          <div style={{ padding: '16px', borderTop: '1px solid #3a3a3c', flexShrink: 0 }}>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              guto.wickert@gmail.com
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, backgroundColor: '#1c1c1e' }}>
        {children}
      </div>
    </div>
  )
}