'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
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
  { nome: 'Salas', href: '/dashboard/salas', icon: '�