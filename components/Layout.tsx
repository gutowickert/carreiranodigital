'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

type Item = { nome: string; href: string }
type Grupo = { titulo: string; itens: Item[] }
type Perfil = { id: string; nome: string; email: string; papel: string; crm_interno: boolean; crm_externo: boolean; leads_escopo: string }

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
      { nome: 'Tarefas de Leads', href: '/dashboard/tarefas/leads' },
      { nome: 'Matrículas Órfãs', href: '/dashboard/matriculas-orfas' },
    ],
  },
  {
    titulo: 'Dashboards',
    itens: [
      { nome: 'Desempenho', href: '/dashboard/desempenho' },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { nome: 'Lançamentos', href: '/dashboard/financeiro' },
      { nome: 'Fluxo de Caixa', href: '/dashboard/financeiro/fluxo' },
      { nome: 'Caixas', href: '/dashboard/financeiro/caixas' },
      { nome: 'Recalcular Tráfego', href: '/dashboard/financeiro/recalcular-trafego' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { nome: 'Alunos', href: '/dashboard/alunos' },
      { nome: 'Professores', href: '/dashboard/professores' },
      { nome: 'Módulos', href: '/dashboard/modulos' },
      { nome: 'Usuários', href: '/dashboard/usuarios' },
      { nome: 'Configurações', href: '/dashboard/configuracoes' },
      { nome: 'Templates de Tarefas', href: '/dashboard/tarefas/templates' },
      { nome: 'Motivos de Perda', href: '/dashboard/motivos-perda' },
      { nome: 'Webhook Logs', href: '/dashboard/webhook-logs' },
    ],
  },
]

// Itens que o VENDEDOR pode ver (admin ve tudo). Por href.
function itemPermitido(href: string, p: Perfil): boolean {
  if (p.papel === 'admin') return true
  // base do vendedor
  const baseVendedor = ['/dashboard', '/dashboard/turmas', '/dashboard/comissoes', '/dashboard/tarefas/leads', '/dashboard/agenda', '/dashboard/alunos']
  if (baseVendedor.includes(href)) return true
  // CRM interno
  if (p.crm_interno && (href === '/dashboard/crm' || href === '/dashboard/crm/resultados')) return true
  // CRM externo
  if (p.crm_externo && (href === '/dashboard/crm-externo' || href === '/dashboard/crm-externo/resultados')) return true
  return false
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [abertos, setAbertos] = useState<Record<string, boolean>>(
    grupos.reduce((acc, g) => ({ ...acc, [g.titulo]: false }), {})
  )
  const [menuMobileAberto, setMenuMobileAberto]