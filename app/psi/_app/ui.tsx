'use client'
// Peças de tela do consultório: tudo grande pro dedo, poucas palavras.
import { createContext, useContext, useEffect, useState } from 'react'
import { ChevronLeft, Search } from 'lucide-react'
import type { Local, Presenca } from '@/lib/psi/tipos'
import { ROTULO_PRESENCA } from '@/lib/psi/tipos'
import { voltar } from './rotas'

export function Logo({ tamanho = 34 }: { tamanho?: number }) {
  // o logo dela entra em public/psi/logo.png (ou .svg). Sem arquivo, some sem deixar buraco.
  const [src, setSrc] = useState('/psi/logo.png')
  const [some, setSome] = useState(false)
  if (some) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="psi-logo" style={{ height: tamanho }} src={src} alt=""
      onError={() => (src.endsWith('.png') ? setSrc('/psi/logo.svg') : setSome(true))} />
  )
}

export function Topo({ titulo, voltarPara, direita, logo }: { titulo: string; voltarPara?: string | true; direita?: React.ReactNode; logo?: boolean }) {
  return (
    <header className="psi-topo">
      {voltarPara && (
        <button className="psi-voltar" aria-label="Voltar" onClick={() => voltar(voltarPara === true ? undefined : voltarPara)}>
          <ChevronLeft size={24} />
        </button>
      )}
      {logo && <Logo />}
      <h1>{titulo}</h1>
      {direita}
    </header>
  )
}

export function Secao({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <div className="psi-secao"><h2>{titulo}</h2>{extra}</div>
      {children}
    </>
  )
}

export function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: React.ReactNode }) {
  return <label className="psi-campo"><span>{rotulo}</span>{children}{ajuda && <small>{ajuda}</small>}</label>
}

export function Chips<T extends string | number>({ opcoes, valor, mudar, rolar }: { opcoes: { valor: T; rotulo: React.ReactNode; cor?: string }[]; valor: T | null | undefined; mudar: (v: T) => void; rolar?: boolean }) {
  return (
    <div className={`psi-chips${rolar ? ' psi-chips-rolar' : ''}`}>
      {opcoes.map(o => (
        <button type="button" key={String(o.valor)} className="psi-chip" aria-pressed={valor === o.valor} onClick={() => mudar(o.valor)}>
          {o.cor && <span className="psi-ponto" style={{ background: o.cor }} />}
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

export const chipsLocais = (locais: Local[]) => locais.filter(l => l.ativo).map(l => ({ valor: l.id, rotulo: l.nome, cor: l.cor }))

export function Pill({ p }: { p: Presenca | 'previsto' | 'pendente' }) {
  const rot = p === 'previsto' ? 'Previsto' : p === 'pendente' ? 'Registrar' : ROTULO_PRESENCA[p]
  return <span className="psi-pill" data-p={p}>{rot}</span>
}

export function Busca({ valor, mudar, placeholder, autoFocus }: { valor: string; mudar: (s: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div className="psi-busca">
      <Search size={19} />
      <input className="psi-input" type="search" value={valor} onChange={e => mudar(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" enterKeyHint="search" />
    </div>
  )
}

export function Folha({ aberta, fechar, titulo, children }: { aberta: boolean; fechar: () => void; titulo: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!aberta) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberta, fechar])
  if (!aberta) return null
  return (
    <div className="psi-veu" onClick={fechar}>
      <div className="psi-folha" role="dialog" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <h3>{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

export const Vazio = ({ children }: { children: React.ReactNode }) => <div className="psi-vazio">{children}</div>
export const Carregando = () => <div className="psi-carregando">Carregando…</div>

export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()

// ------------------------------------------------------------------ aviso rápido (toast)
const AvisoCtx = createContext<(t: string) => void>(() => {})
export const useAviso = () => useContext(AvisoCtx)
export function AvisoProvider({ children }: { children: React.ReactNode }) {
  const [texto, setTexto] = useState<string | null>(null)
  useEffect(() => {
    if (!texto) return
    const t = setTimeout(() => setTexto(null), 2800)
    return () => clearTimeout(t)
  }, [texto])
  return (
    <AvisoCtx.Provider value={setTexto}>
      {children}
      {texto && <div className="psi-toast" role="status">{texto}</div>}
    </AvisoCtx.Provider>
  )
}
