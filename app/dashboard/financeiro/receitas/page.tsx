'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// RELATÓRIO DE RECEITAS (02/10/2026, pedido do Rick) — o espelho do Relatório de Despesas, por PRODUTO.
// Só consulta. Cada linha aberta mostra os RECEBIMENTOS (lançamentos de receita), não a venda inteira:
// venda em 3 parcelas são 3 linhas, cada uma no mês em que vence — bate com Lançamentos e com o Fluxo.
//
// De onde vem o produto: lancamentos_empresa.turma_id → turmas.produto_id → produtos.nome.
// Receita sem turma (ou turma sem produto) cai em "Mensalidades de clientes" (categoria
// 'mensalidade_cliente', de lib/mensalidades.ts) ou em "Outras receitas".

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const primeiroDiaMes = () => hojeSP().slice(0, 8) + '01'
const nomeMes = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const dataBR = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

type Item = { descricao: string; valor: number; status: string; data: string }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text)', outline: 'none' }

// o banco devolve no máximo 1000 linhas por vez, sem avisar: vem em páginas
async function emPaginas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const tudo: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999)
    if (error) return null
    tudo.push(...(data || []))
    if (!data || data.length < 1000) return tudo
  }
}

export default function RelatorioReceitas() {
  const [desde, setDesde] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(hojeSP())
  const [status, setStatus] = useState<'realizado' | 'previsto' | 'todos'>('realizado')
  const [linhas, setLinhas] = useState<{ chave: string; nome: string; valor: number; qtd: number; itens: Item[] }[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  // produtos abertos (clicou na linha → mostra os recebimentos dele embaixo; clicou de novo → recolhe)
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})

  async function carregar() {
    setCarregando(true); setErro('')
    const lancs = await emPaginas<any>((de, a) => {
      let q = supabase.from('lancamentos_empresa').select('id, categoria, valor, status, descricao, data_vencimento, turma_id')
        .eq('tipo', 'receita').gte('data_vencimento', desde).lte('data_vencimento', ate)
      if (status !== 'todos') q = q.eq('status', status)
      return q.order('data_vencimento').order('id').range(de, a)
    })
    const turmas = await emPaginas<any>((de, a) => supabase.from('turmas').select('id, produto_id, produtos(nome)').order('id').range(de, a))
    // sem as turmas não dá pra saber o produto: melhor avisar do que mostrar tudo em "Outras receitas"
    if (!lancs || !turmas) { setErro('Não foi possível carregar as receitas. Avise o Guto.'); setLinhas([]); setTotal(0); setCarregando(false); return }

    const produtoDaTurma: Record<string, { chave: string; nome: string }> = {}
    for (const t of turmas) {
      const nome = (Array.isArray(t.produtos) ? t.produtos[0]?.nome : t.produtos?.nome) || ''
      if (t.produto_id && nome) produtoDaTurma[t.id] = { chave: 'p:' + t.produto_id, nome }
    }

    const g: Record<string, { nome: string; valor: number; qtd: number; itens: Item[] }> = {}
    let tot = 0
    for (const l of lancs) {
      const grupo = (l.turma_id && produtoDaTurma[l.turma_id])
        || (l.categoria === 'mensalidade_cliente' ? { chave: 'mensalidades', nome: 'Mensalidades de clientes' } : { chave: 'outras', nome: 'Outras receitas' })
      g[grupo.chave] = g[grupo.chave] || { nome: grupo.nome, valor: 0, qtd: 0, itens: [] }
      const v = Number(l.valor) || 0
      g[grupo.chave].valor += v; g[grupo.chave].qtd++; tot += v
      g[grupo.chave].itens.push({ descricao: l.descricao || '', valor: v, status: l.status || '', data: l.data_vencimento || '' })
    }
    const rows = Object.entries(g).map(([chave, v]) => ({
      chave, nome: v.nome, valor: v.valor, qtd: v.qtd,
      itens: v.itens.sort((a, b) => b.data.localeCompare(a.data)),
    })).sort((a, b) => b.valor - a.valor)
    setLinhas(rows); setTotal(tot); setCarregando(false)
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line

  const max = linhas[0]?.valor || 1
  const mesmoMes = desde === primeiroDiaMes()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>💰 Relatório de Receitas</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>Receitas por produto no período{mesmoMes ? ` — ${nomeMes(desde)}` : ''}.</p>

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
      <div style={{ ...card, padding: 20, marginBottom: 16, borderColor: 'var(--green)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total de receitas no período</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{brl(total)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{linhas.reduce((s, l) => s + l.qtd, 0)} lançamentos · {linhas.length} {linhas.length === 1 ? 'grupo' : 'grupos'}</div>
      </div>

      {/* tabela */}
      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div>
        : erro ? <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--red)' }}>{erro}</div>
        : linhas.length === 0 ? <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--text-faint)' }}>Nenhuma receita no período.</div>
          : (
            <div style={{ ...card, padding: 8 }}>
              {linhas.map(l => (
                <div key={l.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                <div onClick={() => setAbertas(a => ({ ...a, [l.chave]: !a[l.chave] }))} title={abertas[l.chave] ? 'Recolher' : 'Ver as receitas'} style={{ padding: '10px 12px', cursor: 'pointer' }}>
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
