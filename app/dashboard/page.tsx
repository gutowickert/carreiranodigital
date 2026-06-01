'use client'

import Link from 'next/link'

const modulos = [
  { nome: 'Turmas', desc: 'Abrir e gerenciar turmas', href: '/dashboard/turmas', icon: '🎓' },
  { nome: 'Tarefas', desc: 'Agenda de tarefas por setor', href: '/dashboard/tarefas', icon: '✅' },
  { nome: 'Financeiro', desc: 'Custos, receita e DRE', href: '/dashboard/financeiro', icon: '💰' },
  { nome: 'Leads', desc: 'Pipeline comercial e CRM', href: '/dashboard/leads', icon: '🎯' },
  { nome: 'Alunos', desc: 'CRM de alunos e pós-venda', href: '/dashboard/alunos', icon: '👥' },
  { nome: 'Professores', desc: 'Cadastrar professores', href: '/dashboard/professores', icon: '👤' },
  { nome: 'Salas', desc: 'Cadastrar salas', href: '/dashboard/salas', icon: '🏛' },
  { nome: 'Cidades', desc: 'Cadastrar cidades', href: '/dashboard/cidades', icon: '📍' },
]

export default function Dashboard() {
  return (
    <div style={{ padding: '32px', minHeight: '100vh' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Painel principal</h1>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Selecione um módulo para começar</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {modulos.map((m) => (
          <Link key={m.href} href={m.href} style={{
            backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c',
            borderRadius: '12px', padding: '20px', textDecoration: 'none',
            display: 'block',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>{m.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>{m.nome}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>{m.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}