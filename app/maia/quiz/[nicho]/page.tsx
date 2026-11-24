import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { QUIZZES, ehNicho } from '@/lib/maia/quiz/quiz'
import QuizMaia from './QuizMaia'

// /maia/quiz/oficina e /maia/quiz/otica (outros nomes dão 404)
export const dynamicParams = false
export const viewport = { themeColor: '#f6f5f2' }
export function generateStaticParams() { return [{ nicho: 'oficina' }, { nicho: 'otica' }] }

export async function generateMetadata({ params }: { params: Promise<{ nicho: string }> }): Promise<Metadata> {
  const { nicho } = await params
  if (!ehNicho(nicho)) return {}
  const q = QUIZZES[nicho]
  const titulo = `Diagnóstico da sua ${q.nome} · Maia`
  return {
    title: titulo, description: q.titulo,
    openGraph: { title: titulo, description: q.titulo, type: 'website', locale: 'pt_BR' },
    robots: { index: false, follow: false },
  }
}

export default async function Pagina({ params }: { params: Promise<{ nicho: string }> }) {
  const { nicho } = await params
  if (!ehNicho(nicho)) notFound()
  return <QuizMaia nicho={nicho} />
}
