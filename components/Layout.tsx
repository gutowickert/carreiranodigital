'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

type Item = { nome: string; href: string }
type Grupo = { titulo: string; itens: Item[] }

const grupos: Grupo[] = [
  {
    titulo: '',
    itens: [
      { nome: 'Painel', href: '/dashboard' },
    ],
  },
  {
    titulo: 'Operações',
    itens: [
      { nome: 'Turmas', href: '/dashboard/turmas' },
      { nome: 'Tarefas', href: '/dashboard/tarefas' },
      { nome: 'Salas', href: '/dashboard/salas' },
      { nome: 'Cidades', href: '/dashboard/cidades' },
      { nome: 'Minha Agenda', href: '/dashboard/agenda' },
      { nome: 'Agenda de Aulas', href: '/dashboard/agenda/aulas' },
    ],
  },
  {
    titulo: 'Comercial',
    itens: [
      { nome: 'CRM', href: '/dashboard/crm' },
      { nome: 'Resultados CRM', href: '/dashboard/crm/resultados' },
      { nome: 'Config CRM', href: '/dashboard/crm/config' },
      { nome: 'CRM Externo', href: '/dashboard/crm-externo' },
      { nome: 'Resultados Externo', href: '/dashboard/crm-externo/resultados' },
      { nome: 'Vendedores', href: '/dashboard/vendedores' },
      { nome: 'Comissões', href: '/dashboard/comissoes' },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { nome: 'Lançamentos', href: '/dashboard/financeiro' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { nome: 'Alunos', href: '/dashboard/alunos' },
      { nome: 'Professores', href: '/dashboard/professores' },
      { nome: 'Usuários', href: '/dashboard/usuarios' },
    ],
  },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [abertos, setAbertos] = useState<Record<string, boolean>>(
    grupos.reduce((acc, g) => ({ ...acc, [g.titulo]: false }), {})
  )

  function toggle(titulo: string) {
    setAbertos(prev => ({ ...prev, [titulo]: !prev[titulo] }))
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#1c1c1e' }}>
      <div style={{ flexShrink: 0, width: '220px' }}>
        <div style={{
          width: '220px',
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

          <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
            {grupos.map((grupo, idx) => (
              <div key={idx} style={{ marginBottom: grupo.titulo ? 8 : 4 }}>
                {grupo.titulo && (
                  <button onClick={() => toggle(grupo.titulo)} style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: idx > 1 ? 4 : 0,
                  }}>
                    <span>{grupo.titulo}</span>
                    <span style={{ fontSize: 9, transition: 'transform 0.2s', transform: abertos[grupo.titulo] ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                  </button>
                )}
                {(abertos[grupo.titulo] || !grupo.titulo) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {grupo.itens.map(m => {
                      const ativo = pathname === m.href
                      return (
                        <Link key={m.href} href={m.href} style={{
                          display: 'block',
                          padding: grupo.titulo ? '7px 10px 7px 18px' : '9px 14px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: ativo ? '600' : '400',
                          textDecoration: 'none',
                          backgroundColor: ativo ? '#7c3aed' : 'transparent',
                          color: ativo ? '#ffffff' : '#9ca3af',
                        }}>
                          {m.nome}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div style={{ padding: '12px 16px', borderTop: '1px solid #3a3a3c', flexShrink: 0 }}>
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