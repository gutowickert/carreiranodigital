'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchAuth } from '@/lib/api'

// Busca de lead pra ligar a uma entrega. Usada em dois lugares: ao criar o projeto e na ficha de um
// projeto que ficou sem lead.
//
// ⚠️ ELA NÃO ESCOLHE POR NINGUÉM. Mostra os candidatos com a ETAPA e a DATA de cada um, porque é
// comum o mesmo cliente ter mais de um lead (um em ganho, outro numa etapa antiga) e só quem está
// montando a entrega sabe qual é o certo. Nada é selecionado sozinho, nem quando só volta um.

export type LeadAchado = {
  id: string
  nome: string
  whatsapp: string | null
  etapa: string
  criado_em: string
  ja_em_projeto: string | null
}

const brData = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '')

export function BuscarLead({ onEscolher, autoFoco }: { onEscolher: (l: LeadAchado) => void; autoFoco?: boolean }) {
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<LeadAchado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [buscou, setBuscou] = useState(false)
  const pedido = useRef(0)

  useEffect(() => {
    const t = termo.trim()
    if (t.length < 3) { setAchados([]); setBuscou(false); return }
    // espera a pessoa parar de digitar: sem isto é uma busca por tecla
    const timer = setTimeout(async () => {
      const meu = ++pedido.current
      setBuscando(true)
      const j = await fetchAuth(`/api/projetos/leads?q=${encodeURIComponent(t)}`).then(r => r.json()).catch(() => null)
      // resposta de busca velha não sobrescreve a nova
      if (meu !== pedido.current) return
      setAchados(j?.ok ? (j.leads || []) : [])
      setBuscou(true)
      setBuscando(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [termo])

  const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 9px', fontSize: 13, color: 'var(--text)', width: '100%' }

  return (
    <div>
      <input
        autoFocus={autoFoco}
        style={inp}
        value={termo}
        onChange={e => setTermo(e.target.value)}
        placeholder="nome ou telefone do lead…" />

      {termo.trim().length >= 3 && (
        <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {buscando && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--text-faint)' }}>procurando…</div>}
          {!buscando && buscou && !achados.length && (
            <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--text-faint)' }}>
              Nenhum lead com esse nome ou telefone. Pode seguir sem vincular — o projeto funciona igual.
            </div>
          )}
          {!buscando && achados.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => { onEscolher(l); setTermo(''); setAchados([]); setBuscou(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', padding: '8px 10px', cursor: 'pointer', color: 'var(--text)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{l.nome}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
                {l.whatsapp || 'sem telefone'} · {l.etapa} · entrou {brData(l.criado_em)}
              </div>
              {l.ja_em_projeto && (
                <div style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 3 }}>
                  ⚠️ este lead já está na entrega de {l.ja_em_projeto}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// O lead já escolhido, com o botão de desfazer.
export function LeadEscolhido({ lead, onTirar }: { lead: { nome: string; etapa?: string; whatsapp?: string | null }; onTirar: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 9px' }}>
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{lead.nome}</span>
      {lead.etapa && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{lead.etapa}</span>}
      <button type="button" onClick={onTirar}
        style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-2)', fontSize: 12, padding: '2px 8px', cursor: 'pointer' }}>
        tirar
      </button>
    </div>
  )
}
