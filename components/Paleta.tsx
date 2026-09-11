'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CornerDownLeft, User, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// A BUSCA ⌘K — acha tela pelo nome e lead pelo nome, sem passar pelo menu.
//
// Telas: a lista que o menu já filtrou por permissão (vem pronta do Layout — quem não vê a tela no
// menu também não acha aqui). Leads: consulta direta com a chave pública, então vale a regra de
// linha do banco (o vendedor só acha os que ele enxerga). Sobe/desce com as setas, Enter abre,
// Esc fecha. Modal de vidro: fica parado por cima de tudo.

export type Tela = { nome: string; href: string; grupo: string; icone?: LucideIcon }
type Lead = { id: string; nome: string; whatsapp: string | null; etapa: string | null }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Paleta({ telas, onFechar }: { telas: Tela[]; onFechar: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])

  const telasAchadas = useMemo(() => {
    const t = norm(q.trim())
    if (!t) return telas.slice(0, 8)
    return telas.filter(x => norm(x.nome).includes(t) || norm(x.grupo).includes(t)).slice(0, 8)
  }, [q, telas])

  // leads: só a partir de 2 letras, e com um respiro pra não consultar a cada tecla
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setLeads([]); return }
    const id = setTimeout(async () => {
      const { data } = await supabase.from('leads').select('id, nome, whatsapp, etapa')
        .or(`nome.ilike.%${t.replace(/[%,]/g, '')}%,whatsapp.ilike.%${t.replace(/\D/g, '') || '§'}%`)
        .order('atualizado_em', { ascending: false }).limit(6)
      setLeads((data as Lead[]) || [])
    }, 180)
    return () => clearTimeout(id)
  }, [q])

  const opcoes = useMemo(() => [
    ...telasAchadas.map(t => ({ tipo: 'tela' as const, chave: 'tela:' + t.href, nome: t.nome, sub: t.grupo || 'Início', href: t.href, icone: t.icone })),
    ...leads.map(l => ({ tipo: 'lead' as const, chave: 'lead:' + l.id, nome: l.nome, sub: [l.whatsapp, l.etapa?.replace(/_/g, ' ')].filter(Boolean).join(' · ') || 'lead', href: `/dashboard/crm?lead=${l.id}`, icone: User as LucideIcon })),
  ], [telasAchadas, leads])

  useEffect(() => { setSel(0) }, [q, opcoes.length])

  function abrir(href: string) { onFechar(); router.push(href) }
  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, opcoes.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = opcoes[sel]; if (o) abrir(o.href) }
    else if (e.key === 'Escape') { e.preventDefault(); onFechar() }
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,4,20,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px 16px' }}>
      <div onClick={e => e.stopPropagation()} className="vidro" style={{ width: 'min(560px, 100%)', background: 'var(--surface)', overflow: 'hidden', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--glass-border)' }}>
          <Search size={17} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={tecla}
            placeholder="Buscar tela ou lead…" aria-label="Buscar"
            style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 15, color: 'var(--text)', padding: '4px 0' }} />
          <kbd style={{ fontFamily: 'inherit', fontSize: 11, color: 'var(--text-faint)', border: '1px solid var(--glass-border)', borderRadius: 5, padding: '1px 6px' }}>esc</kbd>
        </div>
        <div role="listbox" style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6, position: 'relative', zIndex: 1 }}>
          {opcoes.length === 0 && (
            <div style={{ padding: '22px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>Nada com "{q}". Tenta o nome da tela ou do lead.</div>
          )}
          {opcoes.map((o, i) => {
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
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.tipo === 'lead' ? 'Lead · ' : ''}{o.sub}</span>
                </span>
                {ativo && <CornerDownLeft size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
