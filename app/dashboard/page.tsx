'use client'

import Link from 'next/link'

const modulos = [
  { nome: 'Turmas', desc: 'Abrir e gerenciar turmas', href: '/dashboard/turmas', cor: '#7c3aed' },
  { nome: 'Tarefas', desc: 'Agenda de tarefas por setor', href: '/dashboard/tarefas', cor: '#2563eb' },
  { nome: 'Financeiro', desc: 'Custos, receita e DRE', href: '/dashboard/financeiro', cor: '#059669' },
  { nome: 'Leads', desc: 'Pipeline comercial e CRM', href: '/dashboard/leads', cor: '#dc2626' },
  { nome: 'Alunos', desc: 'CRM de alunos e pós-venda', href: '/dashboard/alunos', cor: '#d97706' },
  { nome: 'Professores', desc: 'Cadastrar professores', href: '/dashboard/professores', cor: '#7c3aed' },
  { nome: 'Salas', desc: 'Cadastrar salas', href: '/dashboard/salas', cor: '#2563eb' },
  { nome: 'Cidades', desc: 'Cadastrar cidades', href: '/dashboard/cidades', cor: '#059669' },
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
              backgroundColor: '#2c2c2e',
              border: '1px solid #3a3a3c',
              borderRadius: '14px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderTop: `3px solid ${m.cor}`,
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                backgroundColor: m.cor + '22',
                marginBottom: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: m.cor }} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '6px' }}>{m.nome}</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.4' }}>{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}