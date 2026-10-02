'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const primeiroDiaMes = () => hojeSP().slice(0, 8) + '01'
const nomeMes = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const dataBR = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

type Item = { descricao: string; valor: number; status: string; data: string }

const CAT_PADRAO: Record<string, string> = { pessoal: 'Pessoal', estrutura: 'Estrutura', sistemas: 'Sistemas', marketing: 'Marketing', turma: 'Turma', imposto: 'Imposto', salarios: 'Salários', aluguel: 'Aluguel', taxa_financeira: 'Taxa financeira', deslocamentos: 'Deslocamentos', telefone_internet: 'Telefone/Internet', outro: 'Outro' }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text)', outline: 'none' }

export default function RelatorioCustos() {
  const [desde, setDesde] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(hojeSP())
  const [status, setStatus] = useState<'realizado' | 'previsto' | 'todos'>('realizado')
  const [linhas, setLinhas] = useState<{ chave: string; nome: string; valor: number; qtd: number; itens: Item[] }[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  // naturezas abertas (clicou na linha → mostra os custos dela embaixo; clicou de novo → recolhe)
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})

  async function carregar() {
    setCarregando(true)
    const { data: nats } = await supabase.from('naturezas_financeiras').select('chave, nome')
    const natMap: Record<string, string> = { ...CAT_PADRAO, ...Object.fromEntries((nats || []).map((n: any) => [n.chave, n.nome])) }
    let q = supabase.from('lancamentos_empresa').select('categoria, valor, status, descricao, data_vencimento').eq('tipo', 'custo').gte('data_vencimento', desde).lte('data_vencimento', ate)
    if (status !== 'todos') q = q.eq('status', status)
    const { data } = await q
    const g: Record<string, { valor: number; qtd: number; itens: Item[] }> = {}
    let tot = 0
    for (const l of (data || [])) {
      const k = (l as any).categoria || 'outro'
      g[k] = g[k] || { valor: 0, qtd: 0, itens: [] }
      const v = Number((l as any).valor) || 0
      g[k].valor += v; g[k].qtd++; tot += v
      g[k].itens.push({ descricao: (l as any).descricao || '', valor: v, status: (l as any).status || '', data: (l as any).data_vencimento || '' })
    }
    const rows = Object.entries(g).map(([chave, v]) => ({
      chave, nome: natMap[chave] || chave, valor: v.valor, qtd: v.qtd,
      itens: v.itens.sort((a, b) => b.data.localeCompare(a.data)),
    })).sort((a, b) => b.valor - a.valor)
    setLinhas(rows); setTotal(tot); setCarregando(false)
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line

  const max = linhas[0]?.valor || 1
  const mesmoMes = desde === primeiroDiaMes()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>💸 Relatório de Custos</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>Custos por natureza no período{mesmoMes ? ` — ${nomeMes(desde)}` : ''}.</p>

      {/* filtros */}
      <div style={{ ...card, padding: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>De<br /><input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Até<br /><input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Situação<br />
          <select value={status} onChange={e => setStatus(e.target.value as any)} style={{ ...inp, marginTop: 4 }}>
            <option value="realizado">Realizado</option>
            <option value="previsto">Previsto</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <button onClick={carregar} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Aplicar</button>
        <button onClick={() => { setDesde(primeiroDiaMes()); setAte(hojeSP()); }} style={{ ...inp, cursor: 'pointer', color: 'var(--text-2)' }}>Mês atual</button>
      </div>

      {/* total */}
      <div style={{ ...card, padding: 20, marginBottom: 16, borderColor: 'var(--red)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total de custos no período</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{brl(total)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{linhas.reduce((s, l) => s + l.qtd, 0)} lançamentos · {linhas.length} naturezas</div>
      </div>

      {/* tabela */}
      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div>
        : linhas.length === 0 ? <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--text-faint)' }}>Nenhum custo no período.</div>
          : (
            <div style={{ ...card, padding: 8 }}>
              {linhas.map(l => (
                <div key={l.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                <div onClick={() => setAbertas(a => ({ ...a, [l.chave]: !a[l.chave] }))} title={abertas[l.chave] ? 'Recolher' : 'Ver os custos'} style={{ padding: '10px 12px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}><span style={{ display: 'inline-block', width: 16, color: 'var(--text-faint)' }}>{abertas[l.chave] ? '▾' : '▸'}</span>{l.nome} <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>({l.qtd})</span></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{brl(l.valor)} <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>· {total ? Math.round(l.valor / total * 100) : 0}%</span></span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(2, l.valor / max * 100)}%`, background: 'var(--accent)', borderRadius: 4 }} />
                  </div>
                </div>
                {abertas[l.chave] && (
                  <div style={{ padding: '2px 12px 10px 28px' }}>
                    {l.itens.map((it, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-faint)', width: 78, flexShrink: 0 }}>{dataBR(it.data)}</span>
                        <span style={{ color: 'var(--text-2)', flex: 1, minWidth: 0 }}>{it.descricao || 'Sem descrição'}</span>
                        <span style={{ color: 'var(--text-faint)', fontSize: 11, flexShrink: 0 }}>{it.status === 'realizado' ? 'Realizado' : it.status === 'previsto' ? 'Previsto' : it.status}</span>
                        <span style={{ color: 'var(--text)', fontWeight: 600, width: 100, textAlign: 'right', flexShrink: 0 }}>{brl(it.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              ))}
            </div>
          )}
    </div>
  )
}
