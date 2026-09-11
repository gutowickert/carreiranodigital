'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 9px', fontSize: 13, color: 'var(--text)', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 3 }

const PRODUTOS: [string, string][] = [['deu_venda', 'Deu Venda'], ['crm', 'CRM'], ['combo', 'Deu Venda + CRM + Tráfego']]
const FINS: [string, string][] = [['encerra', 'Encerra ao fim'], ['renegocia', 'Renegocia ao fim'], ['manutencao', 'Vira manutenção']]

const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const hora = (d?: string | null) => {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

// o estado do compromisso é o que o time precisa ler de longe
function selo(situacao: string, estado: string) {
  if (situacao === 'atrasado') return { t: 'ATRASADO', bg: 'var(--red-bg)', c: 'var(--red)' }
  if (situacao === 'a_remarcar') return { t: 'A REMARCAR', bg: 'var(--amber-bg)', c: 'var(--amber)' }
  if (situacao === 'confirmar') return { t: 'CONFIRMAR', bg: 'var(--amber-bg)', c: 'var(--amber)' }
  if (estado === 'confirmado') return { t: 'CONFIRMADO', bg: 'var(--green-bg)', c: 'var(--green)' }
  if (estado === 'combinado') return { t: 'COMBINADO', bg: 'var(--blue-bg)', c: 'var(--blue)' }
  return { t: 'PREVISTO', bg: 'var(--surface-2)', c: 'var(--text-faint)' }
}

export default function Entregas() {
  const [lista, setLista] = useState<any[]>([])
  const [resumo, setResumo] = useState<any>({ atrasados: 0, a_confirmar: 0, sem_proximo: 0, vencendo: 0 })
  const [carregando, setCarregando] = useState(true)
  const [novo, setNovo] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [msg, setMsg] = useState('')
  const [f, setF] = useState<any>({ cliente: '', whatsapp: '', produto: 'deu_venda', data_inicio: '', prazo_meses: '', fim_tipo: '', aviso_fim_dias: '', mensalidade_dia: '', mensalidade_valor: '' })

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/projetos').then(r => r.json()).catch(() => null)
    if (j?.ok) { setLista(j.projetos || []); setResumo(j.resumo || {}) }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function criar() {
    if (!f.cliente || !f.data_inicio) { setMsg('⚠️ cliente e data de início são obrigatórios'); return }
    const j = await fetchAuth('/api/projetos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).then(r => r.json()).catch(() => null)
    if (j?.ok) {
      setMsg(`✅ Projeto criado com ${j.marcos} marcos no roteiro.`)
      setNovo(false); setF({ cliente: '', whatsapp: '', produto: 'deu_venda', data_inicio: '', prazo_meses: '', fim_tipo: '', aviso_fim_dias: '', mensalidade_dia: '', mensalidade_valor: '' })
      carregar()
    } else setMsg('⚠️ ' + (j?.error || 'falha'))
    setTimeout(() => setMsg(''), 4000)
  }

  const busca = (p: any) => !filtro || String(p.cliente).toLowerCase().includes(filtro.toLowerCase())
  const emEntrega = lista.filter(p => p.status === 'ativo' && busca(p))
  const emManutencao = lista.filter(p => p.status === 'manutencao' && busca(p))
  const concluidos = lista.filter(p => p.status === 'concluido' && busca(p))

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📦 Entregas</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Os clientes que já compraram e estão sendo entregues. O CRM termina no ganho — aqui começa o depois.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/entregas/trafego" style={{ ...card, padding: '8px 14px', fontSize: 13, color: 'var(--text-2)', textDecoration: 'none' }}>📈 Tráfego</Link>
          <Link href="/dashboard/entregas/agenda" style={{ ...card, padding: '8px 14px', fontSize: 13, color: 'var(--text-2)', textDecoration: 'none' }}>📅 Agenda</Link>
          <button onClick={() => setNovo(v => !v)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Novo projeto</button>
        </div>
      </div>

      {msg && <div style={{ ...card, padding: '9px 12px', marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>{msg}</div>}

      {/* ───────── precisa de ti */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 16 }}>
        {[
          { n: resumo.atrasados || 0, l: 'atrasados', c: 'var(--red)', bg: 'var(--red-bg)' },
          { n: resumo.a_confirmar || 0, l: 'a confirmar', c: 'var(--amber)', bg: 'var(--amber-bg)' },
          { n: resumo.sem_proximo || 0, l: 'sem próximo passo', c: 'var(--text-muted)', bg: 'var(--surface-2)' },
          { n: resumo.vencendo || 0, l: 'contratos vencendo', c: 'var(--blue)', bg: 'var(--blue-bg)' },
        ].map((x, i) => (
          <div key={i} style={{ ...card, padding: '12px 14px', background: x.n ? x.bg : 'var(--surface)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: x.n ? x.c : 'var(--text-faint)', lineHeight: 1 }}>{x.n}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{x.l}</div>
          </div>
        ))}
      </div>

      {/* ───────── novo projeto */}
      {novo && (
        <div style={{ ...card, padding: 16, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
            <div><label style={lbl}>Cliente *</label><input style={inp} value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} /></div>
            <div><label style={lbl}>WhatsApp</label><input style={inp} value={f.whatsapp} onChange={e => setF({ ...f, whatsapp: e.target.value })} placeholder="5551..." /></div>
            <div><label style={lbl}>Produto *</label><select style={inp} value={f.produto} onChange={e => setF({ ...f, produto: e.target.value })}>{PRODUTOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label style={lbl}>Data de início *</label><input type="date" style={inp} value={f.data_inicio} onChange={e => setF({ ...f, data_inicio: e.target.value })} /></div>
            <div><label style={lbl}>Prazo (meses)</label><input style={inp} value={f.prazo_meses} onChange={e => setF({ ...f, prazo_meses: e.target.value })} placeholder="padrão do produto" /></div>
            <div><label style={lbl}>No fim do contrato</label><select style={inp} value={f.fim_tipo} onChange={e => setF({ ...f, fim_tipo: e.target.value })}><option value="">padrão do produto</option>{FINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label style={lbl}>Avisar do fim (dias antes)</label><input style={inp} value={f.aviso_fim_dias} onChange={e => setF({ ...f, aviso_fim_dias: e.target.value })} placeholder="padrão" /></div>
            <div><label style={lbl}>Mensalidade — dia</label><input style={inp} value={f.mensalidade_dia} onChange={e => setF({ ...f, mensalidade_dia: e.target.value })} placeholder="ex: 10" /></div>
            <div><label style={lbl}>Mensalidade — valor</label><input style={inp} value={f.mensalidade_valor} onChange={e => setF({ ...f, mensalidade_valor: e.target.value })} placeholder="1500" /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button onClick={criar} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Criar e gerar o roteiro</button>
            <button onClick={() => setNovo(false)} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Os marcos são calculados a partir da data de início.</span>
          </div>
        </div>
      )}

      <input style={{ ...inp, marginTop: 14, maxWidth: 320 }} placeholder="🔎 buscar cliente…" value={filtro} onChange={e => setFiltro(e.target.value)} />

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 24 }}>Carregando…</div> : (
        <>
          <Bloco titulo="Em entrega" itens={emEntrega} vazio="Nenhum projeto em entrega. Criando um, o roteiro do produto se calcula sozinho." />
          {!!emManutencao.length && <Bloco titulo="Em manutenção" itens={emManutencao} discreto />}
          {!!concluidos.length && <Bloco titulo="Concluídos" itens={concluidos} discreto />}
        </>
      )}
    </div>
  )
}

function Bloco({ titulo, itens, vazio, discreto }: { titulo: string; itens: any[]; vazio?: string; discreto?: boolean }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>{titulo} · {itens.length}</div>
      {!itens.length ? <div style={{ ...card, padding: 18, fontSize: 13, color: 'var(--text-faint)' }}>{vazio || '—'}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {itens.map(p => {
            const s = p.proximo ? selo(p.proximo.situacao, p.proximo.estado) : null
            const pct = p.total_marcos ? Math.round((p.concluidos / p.total_marcos) * 100) : 0
            return (
              <Link key={p.id} href={`/dashboard/entregas/${p.id}`} style={{ ...card, padding: 14, textDecoration: 'none', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) auto', gap: 14, alignItems: 'center', opacity: discreto ? .78 : 1 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.cor, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>
                    {p.roteiro} · desde {br(p.data_inicio)}{p.data_fim ? ` · fim ${br(p.data_fim)}` : ''}{p.mensalidade_dia ? ` · mensalidade dia ${p.mensalidade_dia}` : ''}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  {p.proximo ? (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.proximo.titulo}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
                        {p.proximo.estado === 'previsto' ? '~' : ''}{br(p.proximo.data)} {hora(p.proximo.data)}
                      </div>
                    </>
                  ) : <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>sem próximo passo</div>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.concluidos}/{p.total_marcos}</div>
                    <div style={{ width: 54, height: 4, background: 'var(--surface-2)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: p.cor }} />
                    </div>
                  </div>
                  {s && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', padding: '4px 7px', borderRadius: 4, background: s.bg, color: s.c, whiteSpace: 'nowrap' }}>{s.t}</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
