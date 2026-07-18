'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const PLANOS = ['interno', 'teste', 'basico', 'pro', 'premium']

const brl = (n: number) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const usd = (n: number) => 'US$ ' + (n || 0).toFixed(2)
function haQuanto(iso: string | null) {
  if (!iso) return 'sem atividade'
  const min = Math.round((Date.now() - +new Date(iso)) / 60000)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60); if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function Metrica({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: cor || 'var(--text)', marginTop: 2 }}>{valor}</div>
    </div>
  )
}

export default function AdminOrgs() {
  const [orgs, setOrgs] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [semAcesso, setSemAcesso] = useState(false)
  const [busy, setBusy] = useState('')

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/admin/orgs').then(r => r.json()).catch(() => null)
    if (j?.ok) setOrgs(j.orgs)
    else if (j?.error === 'sem acesso') setSemAcesso(true)
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function acao(orgId: string, ac: string, extra: any = {}) {
    setBusy(orgId + ac)
    await fetchAuth('/api/admin/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, acao: ac, ...extra }) }).then(r => r.json()).catch(() => ({}))
    setBusy('')
    carregar()
  }

  if (semAcesso) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>🔒 Painel restrito ao administrador da Carreira no Digital.</div>

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🏢 Organizações</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Painel do SaaS: uso, custo de IA e controle de cada cliente. Números do mês atual.</p>
        </div>
        <button onClick={carregar} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>↻ Atualizar</button>
      </div>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 40 }}>Carregando…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
          {orgs.map(o => (
            <div key={o.id} style={{ ...card, padding: 18, opacity: o.ativo ? 1 : .6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{o.nome}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: o.ativo ? 'var(--green-bg)' : 'var(--red-bg)', color: o.ativo ? 'var(--green-strong)' : 'var(--red)' }}>{o.ativo ? 'ativo' : 'suspenso'}</span>
                <select value={o.plano || ''} onChange={e => acao(o.id, 'plano', { plano: e.target.value })} style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                  {[...new Set([o.plano, ...PLANOS])].filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>desde {(o.criado_em || '').slice(0, 10)} · {haQuanto(o.ultimaAtividade)}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {o.ativo
                    ? <button disabled={!!busy} onClick={() => { if (confirm(`Suspender ${o.nome}? Os usuários perdem acesso.`)) acao(o.id, 'suspender') }} style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Suspender</button>
                    : <button disabled={!!busy} onClick={() => acao(o.id, 'reativar')} style={{ background: 'var(--green-bg)', color: 'var(--green-strong)', border: '1px solid var(--green)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Reativar</button>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                <Metrica label="Leads" valor={String(o.leads)} />
                <Metrica label="Vendas" valor={String(o.ganhos)} cor="var(--green-strong)" />
                <Metrica label="Receita" valor={brl(o.receita)} />
                <Metrica label="Usuários" valor={String(o.usuarios)} />
                <Metrica label="Msgs (mês)" valor={String(o.msgsMes)} />
                <Metrica label="Custo IA (mês)" valor={usd(o.custoIA)} cor={o.custoIA > 0 ? 'var(--amber)' : 'var(--text-faint)'} />
                <Metrica label="Chamadas IA" valor={String(o.chamadasIA)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
