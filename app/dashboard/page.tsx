'use client'

import Link from 'next/link'

const modulos = [
  { nome: 'Turmas', desc: 'Abrir e gerenciar turmas', href: '/dashboard/turmas', cor: '#7c3aed', borda: '#7c3aed' },
  { nome: 'Tarefas', desc: 'Agenda de tarefas por setor', href: '/dashboard/tarefas', cor: '#2563eb', borda: '#2563eb' },
  { nome: 'Financeiro', desc: 'Custos, receita e DRE', href: '/dashboard/financeiro', cor: '#059669', borda: '#059669' },
  { nome: 'Leads', desc: 'Pipeline comercial e CRM', href: '/dashboard/leads', cor: '#dc2626', borda: '#dc2626' },
  { nome: 'Alunos', desc: 'CRM de alunos e pós-venda', href: '/dashboard/alunos', cor: '#d97706', borda: '#d97706' },
  { nome: 'Professores', desc: 'Cadastrar professores', href: '/dashboard/professores', cor: '#0891b2', borda: '#0891b2' },
  { nome: 'Salas', desc: 'Cadastrar salas', href: '/dashboard/salas', cor: '#65a30d', borda: '#65a30d' },
  { nome: 'Cidades', desc: 'Cadastrar cidades', href: '/dashboard/cidades', cor: '#c2410c', borda: '#c2410c' },
]

export default function Dashboard() {
  return (
    <div style={{ padding: '40px', minHeight: '100vh', backgroundColor: '#1c1c1e' }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#ffffff', margin: 0 }}>Painel principal</h1>
        <p style={{ fontSize: '15px', color: '#6b7280', marginTop: '6px' }}>Selecione um módulo para começar</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {modulos.map((m) => (
          <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
            <div style={{
              backgroundColor: m.cor + '18',
              border: `1px solid ${m.borda}44`,
              borderLeft: `4px solid ${m.borda}`,
              borderRadius: '14px',
              padding: '24px',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: '17px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>{m.nome}</div>
              <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.4' }}>{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}