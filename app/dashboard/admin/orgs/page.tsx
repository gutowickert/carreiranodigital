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

function Marca({ o, onSalvar }: { o: any; onSalvar: (d: any) => Promise<void> }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(o.nome || '')
  const [cor, setCor] = useState(o.cor || '#7c3abe')
  const [logo, setLogo] = useState(o.logo_url || '')
  const [salvando, setSalvando] = useState(false)
  const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 9px', fontSize: 12, color: 'var(--text)', outline: 'none' }
  if (!aberto) return <button onClick={() => setAberto(true)} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>🎨 Marca</button>
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-2)', borderRadius: 8, padding: 8 }}>
      <input style={{ ...inp, width: 150 }} value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome exibido" />
      <input type="color" style={{ ...inp, width: 44, padding: 2, height: 32 }} value={cor} onChange={e => setCor(e.target.value)} title="Cor da marca" />
      <input style={{ ...inp, width: 200 }} value={logo} onChange={e => setLogo(e.target.value)} placeholder="URL do logo (opcional)" />
      <button disabled={salvando} onClick={async () => { setSalvando(true); await onSalvar({ nome, cor, logo_url: logo }); setSalvando(false); setAberto(false) }} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{salvando ? '…' : 'Salvar marca'}</button>
      <button onClick={() => setAberto(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer' }}>cancelar</button>
    </div>
  )
}

function Metrica({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: cor || 'var(--text)', marginTop: 2 }}>{valor}</div>
    </div>
  )
}

const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', width: '100%' }

export default function AdminOrgs() {
  const [orgs, setOrgs] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [semAcesso, setSemAcesso] = useState(false)
  const [busy, setBusy] = useState('')
  const [novaOpen, setNovaOpen] = useState(false)
  const [f, setF] = useState<any>({ nome: '', slug: '', plano: 'teste', adminNome: '', adminEmail: '', adminSenha: '' })
  const [criando, setCriando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  async function criarOrg() {
    if (!f.nome || !f.adminEmail || f.adminSenha.length < 6) { setResultado({ erro: 'preencha nome da org, email e senha (mín. 6)' }); return }
    setCriando(true); setResultado(null)
    const j = await fetchAuth('/api/admin/orgs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).then(r => r.json()).catch(() => ({ ok: false }))
    setCriando(false)
    if (j.ok) { setResultado({ email: j.email, senha: j.senha, nome: f.nome }); setF({ nome: '', slug: '', plano: 'teste', adminNome: '', adminEmail: '', adminSenha: '' }); carregar() }
    else setResultado({ erro: j.error || 'falha' })
  }

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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setNovaOpen(!novaOpen); setResultado(null) }} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{novaOpen ? '✕ Fechar' : '➕ Nova organização'}</button>
          <button onClick={carregar} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>↻ Atualizar</button>
        </div>
      </div>

      {novaOpen && (
        <div style={{ ...card, padding: 18, marginTop: 16, border: '1px solid var(--accent)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>Criar novo cliente (organização + login admin)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 11, color: 'var(--text-faint)' }}>Nome da organização *</label><input style={inp} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex: Escola do Fulano" /></div>
            <div><label style={{ fontSize: 11, color: 'var(--text-faint)' }}>Plano</label>
              <select style={inp} value={f.plano} onChange={e => setF({ ...f, plano: e.target.value })}>{PLANOS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div><label style={{ fontSize: 11, color: 'var(--text-faint)' }}>Nome do admin</label><input style={inp} value={f.adminNome} onChange={e => setF({ ...f, adminNome: e.target.value })} placeholder="Fulano de Tal" /></div>
            <div><label style={{ fontSize: 11, color: 'var(--text-faint)' }}>Slug (opcional)</label><input style={inp} value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} placeholder="escola-fulano" /></div>
            <div><label style={{ fontSize: 11, color: 'var(--text-faint)' }}>Email do admin *</label><input style={inp} value={f.adminEmail} onChange={e => setF({ ...f, adminEmail: e.target.value })} placeholder="admin@cliente.com" /></div>
            <div><label style={{ fontSize: 11, color: 'var(--text-faint)' }}>Senha inicial * (mín. 6)</label><input style={inp} value={f.adminSenha} onChange={e => setF({ ...f, adminSenha: e.target.value })} placeholder="senha123" /></div>
          </div>
          <button onClick={criarOrg} disabled={criando} style={{ marginTop: 14, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: criando ? .6 : 1 }}>{criando ? 'Criando…' : 'Criar cliente'}</button>
          {resultado?.erro && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--red)' }}>⚠️ {resultado.erro}</div>}
          {resultado?.email && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--green-strong)', background: 'var(--green-bg)', borderRadius: 8, padding: 10 }}>✅ <b>{resultado.nome}</b> criada! Login: <b>{resultado.email}</b> · senha: <b>{resultado.senha}</b> — passa isso pro cliente (ele troca a senha depois).</div>}
        </div>
      )}

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
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <Marca o={o} onSalvar={(d) => acao(o.id, 'branding', d)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
