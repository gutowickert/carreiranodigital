'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CornerDownLeft, User, MessageCircle, GraduationCap, Briefcase, CalendarRange, Package, UserCog, type LucideIcon } from 'lucide-react'
import { fetchAuth } from '@/lib/api'

// A BUSCA ⌘K — acha tela pelo nome e, no sistema todo, gente e cadastro: lead, conversa do WhatsApp,
// aluno, prospecção, turma, produto e usuário.
//
// Telas: a lista que o menu já filtrou por permissão (vem pronta do Layout — quem não vê a tela no
// menu também não acha aqui). O resto vem de /api/busca, no servidor, que aplica a regra de quem
// enxerga quem e o mesmo corte do menu. (Antes a consulta de lead saía do navegador: a regra de linha
// escondia lead sem dono até do administrador, e conversa do WhatsApp nem entrava — ver a rota.)
// Sobe/desce com as setas, Enter abre, Esc fecha. Modal de vidro: fica parado por cima de tudo.

export type Tela = { nome: string; href: string; grupo: string; icone?: LucideIcon }
type Item = { chave: string; nome: string; sub: string; href: string }
type Grupo = { tipo: string; rotulo: string; itens: Item[] }

const ICONE_GRUPO: Record<string, LucideIcon> = {
  leads: User, conversas: MessageCircle, alunos: GraduationCap, prospeccoes: Briefcase,
  turmas: CalendarRange, produtos: Package, usuarios: UserCog,
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Paleta({ telas, onFechar }: { telas: Tela[]; onFechar: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [buscando, setBuscando] = useState(false)
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const pedido = useRef(0)

  useEffect(() => { input.current?.focus() }, [])

  const telasAchadas = useMemo(() => {
    const t = norm(q.trim())
    if (!t) return telas.slice(0, 8)
    // buscando, as telas cedem espaço pro que veio do banco
    return telas.filter(x => norm(x.nome).includes(t) || norm(x.grupo).includes(t)).slice(0, 4)
  }, [q, telas])

  // o sistema todo: só a partir de 2 letras, com um respiro pra não consultar a cada tecla. `pedido`
  // descarta resposta atrasada (quem digita rápido não vê o resultado de "ja" por cima de "jair").
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setGrupos([]); setBuscando(false); return }
    setBuscando(true)
    const n = ++pedido.current
    const id = setTimeout(async () => {
      try {
        const j = await fetchAuth(`/api/busca?q=${encodeURIComponent(t)}`).then(r => r.json())
        if (n === pedido.current) setGrupos(j?.ok ? (j.grupos || []) : [])
      } catch {
        if (n === pedido.current) setGrupos([])
      } finally {
        if (n === pedido.current) setBuscando(false)
      }
    }, 220)
    return () => clearTimeout(id)
  }, [q])

  // seções na ordem da tela; a lista achatada é o que as setas percorrem
  const secoes = useMemo(() => {
    const s: { rotulo: string; itens: (Item & { icone?: LucideIcon })[] }[] = []
    if (telasAchadas.length) s.push({ rotulo: q.trim() ? 'Telas' : '', itens: telasAchadas.map(t => ({ chave: 'tela:' + t.href, nome: t.nome, sub: t.grupo || 'Início', href: t.href, icone: t.icone })) })
    for (const g of grupos) s.push({ rotulo: g.rotulo, itens: g.itens.map(i => ({ ...i, icone: ICONE_GRUPO[g.tipo] })) })
    return s
  }, [telasAchadas, grupos, q])
  const opcoes = useMemo(() => secoes.flatMap(s => s.itens), [secoes])

  useEffect(() => { setSel(0) }, [q, opcoes.length])

  function abrir(href: string) { onFechar(); router.push(href) }
  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, opcoes.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = opcoes[sel]; if (o) abrir(o.href) }
    else if (e.key === 'Escape') { e.preventDefault(); onFechar() }
  }

  let indice = -1
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,4,20,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px 16px' }}>
      <div onClick={e => e.stopPropagation()} className="vidro" style={{ width: 'min(600px, 100%)', background: 'var(--surface)', overflow: 'hidden', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--glass-border)' }}>
          <Search size={17} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={tecla}
            placeholder="Buscar tela, lead, conversa, aluno, turma…" aria-label="Buscar"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', fontSize: 15, color: 'var(--text)', padding: '4px 0' }} />
          {buscando && <span style={{ fontSize: 11.5, color: 'var(--text-faint)', flexShrink: 0 }}>buscando…</span>}
          <kbd style={{ fontFamily: 'inherit', fontSize: 11, color: 'var(--text-faint)', border: '1px solid var(--glass-border)', borderRadius: 5, padding: '1px 6px' }}>esc</kbd>
        </div>
        <div role="listbox" style={{ maxHeight: '56vh', overflowY: 'auto', padding: 6, position: 'relative', zIndex: 1 }}>
          {opcoes.length === 0 && (
            <div style={{ padding: '22px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
              {buscando ? 'Buscando…' : `Nada com "${q}". Tenta o nome, o telefone ou o e-mail.`}
            </div>
          )}
          {secoes.map(s => (
            <div key={s.rotulo || 'inicio'}>
              {s.rotulo && <div style={{ padding: '10px 10px 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{s.rotulo}</div>}
              {s.itens.map(o => {
                indice++
                const i = indice
                const Icone = o.icone
                const ativo = i === sel
                return (
                  <button key={o.chave} role="option" aria-selected={ativo} onMouseEnter={() => setSel(i)} onClick={() => abrir(o.href)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', border: 0, textAlign: 'left', font: 'inherit',
                      borderRadius: 'var(--r)', background: ativo ? 'var(--accent-bg)' : 'transparent', color: ativo ? 'var(--accent-soft)' : 'var(--text)', cursor: 'pointer',
                    }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: ativo ? 'transparent' : 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0, color: ativo ? 'var(--accent-soft)' : 'var(--text-muted)' }}>
                      {Icone ? <Icone size={16} strokeWidth={1.9} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.nome}</span>
                      {o.sub && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sub}</span>}
                    </span>
                    {ativo && <CornerDownLeft size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
