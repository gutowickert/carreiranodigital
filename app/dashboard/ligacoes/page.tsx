'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }

function horaBR(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}
function haQuanto(min: number | null) {
  if (min == null) return ''
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function Linha({ nome, telefone, sub, cor, leadId }: { nome: string; telefone: string; sub: string; cor: string; leadId: string }) {
  const [ligando, setLigando] = useState(false)
  const [res, setRes] = useState('')
  async function ligar() {
    setLigando(true); setRes('')
    const r = await fetchAuth('/api/ligacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId }) }).then(r => r.json()).catch(() => ({ ok: false }))
    setLigando(false)
    setRes(r.ok ? '📞 chamando…' : (r.error || 'falha'))
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{nome || '(sem nome)'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{telefone} · <span style={{ color: cor }}>{sub}</span></div>
      </div>
      {res ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{res}</span> : null}
      <button onClick={ligar} disabled={ligando} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: ligando ? .6 : 1 }}>{ligando ? '…' : '📞 Ligar'}</button>
    </div>
  )
}

export default function FilaLigacoes() {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/ligacoes/fila').then(r => r.json()).catch(() => null)
    if (j?.ok) setD(j)
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  const agendadas = d?.agendadas || []
  const novos = d?.novosLeads || []
  // separa as agendadas que já estão na hora (agora/atrasadas) das futuras
  const agora = agendadas.filter((a: any) => a.minutosPara == null || a.minutosPara <= 15)
  const futuras = agendadas.filter((a: any) => a.minutosPara != null && a.minutosPara > 15)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📞 Fila de Ligações</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Agendadas na hora vêm primeiro. Sem agendada, priorize velocidade nos novos leads.</p>
        </div>
        <button onClick={carregar} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>↻ Atualizar</button>
      </div>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 40 }}>Carregando…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 20 }}>
          {/* 1) AGENDADAS NA HORA */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', fontSize: 13, fontWeight: 800, color: 'var(--text)', background: 'var(--surface-2)' }}>🕐 Ligações agendadas — AGORA <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({agora.length})</span></div>
            {agora.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma ligação agendada pra agora. Vá pros novos leads abaixo. 👇</div>
              : agora.map((a: any) => <Linha key={a.leadId} leadId={a.leadId} nome={a.nome} telefone={a.telefone} sub={a.atrasada ? `⚠️ atrasada · ${horaBR(a.quando)}` : `agendada ${horaBR(a.quando)}`} cor={a.atrasada ? 'var(--red)' : 'var(--amber)'} />)}
          </div>

          {/* 2) NOVOS LEADS (velocidade) */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', fontSize: 13, fontWeight: 800, color: 'var(--text)', background: 'var(--surface-2)' }}>⚡ Novos leads — ligar rápido <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({novos.length})</span></div>
            {novos.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)' }}>Nenhum lead novo esperando ligação. 🎉</div>
              : novos.map((n: any) => <Linha key={n.leadId} leadId={n.leadId} nome={n.nome} telefone={n.telefone} sub={`chegou ${haQuanto(n.chegouMin)}`} cor={n.chegouMin != null && n.chegouMin < 30 ? 'var(--green)' : 'var(--text-muted)'} />)}
          </div>

          {/* agendadas futuras (contexto) */}
          {futuras.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: 'hidden', opacity: .8 }}>
              <div style={{ padding: '12px 14px', fontSize: 13, fontWeight: 800, color: 'var(--text)', background: 'var(--surface-2)' }}>📅 Agendadas mais tarde <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({futuras.length})</span></div>
              {futuras.map((a: any) => <Linha key={a.leadId} leadId={a.leadId} nome={a.nome} telefone={a.telefone} sub={`agendada ${horaBR(a.quando)}`} cor={'var(--text-muted)'} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
