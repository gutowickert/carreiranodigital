'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Atendimento } from '@/lib/psi/tipos'
import { useBase } from './App'

/** os atendimentos de um período; `recarregar` depois de gravar */
export function useAtendimentos(de: string, ate: string) {
  const { repo } = useBase()
  const [lista, setLista] = useState<Atendimento[] | null>(null)
  const [erro, setErro] = useState('')
  const recarregar = useCallback(async () => {
    try { setLista(await repo.atendimentos({ de, ate })); setErro('') } catch (e) { setErro((e as Error).message); setLista([]) }
  }, [repo, de, ate])
  useEffect(() => { setLista(null); recarregar() }, [recarregar])
  return { lista, erro, recarregar }
}

/** a hora de agora (HH:MM, Brasília), que anda sozinha a cada minuto */
export function useAgora() {
  const calc = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
  const [h, setH] = useState(calc)
  useEffect(() => { const t = setInterval(() => setH(calc()), 60_000); return () => clearInterval(t) }, [])
  return h
}
