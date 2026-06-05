'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Lancamento = {
  id: string
  tipo: string
  categoria: string
  descricao: string
  valor: number
  unidade: string
  mes_referencia: string
  data_vencimento: string
  data_pagamento: string
  status: string
  turma_id: string | null
}

type CustoFixo = {
  id: string
  nome: string
  categoria: string
  unidade: string
  valor_padrao: number
  ativo: boolean
}

type FinanceiroTurma = {
  id: string
  turma_id: string
  receita_prevista: number
  receita_realizada: number
  custo_professores: number
  custo_trafego_previsto: number
  imposto_previsto: number
  custo_deslocamento: number
  margem_prevista: number
  margem_realizada: number
  break_even_matriculas: number
  turmas: {
    data_inicio: string
    preco_venda: number
    meta_matriculas: number
    produtos: { nome: string }
    cidades: { nome: string }
  }
}

const unidadeNome: Record<string, string> = { lajeado: 'Lajeado', porto_alegre: 'Porto Alegre', ambas: 'Ambas', geral: 'Geral' }
const categoriaNome: Record<string, string> = { pessoal: 'Pessoal', estrutura: 'Estrutura', sistemas: 'Sistemas', marketing: 'Marketing', turma: 'Turma', imposto: 'Imposto', outro: 'Outro' }

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px', padding: '20px' }
const cardHeader = { padding: '16px 24px', borderBottom: '1px solid #3a3a3c' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Financeiro() {
  const [aba, setAba] = useState<'visao_geral' | 'turmas' | 'custos_fixos' | 'lancamentos' | 'dre'>('visao_geral')
  const [financeiros, setFinanceiros] = useState<FinanceiroTurma[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [custosFixos, setCustosFixos] = useState<CustoFixo[]>([])
  const [selecionado, setSelecionado] = useState<FinanceiroTurma | null>(null)
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7))
  const [carregando, setCarregando] = useState(true)
  const [novoLanc, setNovoLanc] = useState(false)
  const [novoCustoFixo, setNovoCustoFixo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const [lancTipo, setLancTipo] = useState('custo')
  const [lancCategoria, setLancCategoria] = useState('outro')
  const [lancDescricao, setLancDescricao] = useState('')
  const [lancValor, setLancValor] = useState('')
  const [lancUnidade, setLancUnidade] = useState('geral')
  const [lancVencimento, setLancVencimento] = useState('')
  const [lancStatus, setLancStatus] = useState('previsto')
  const [cfNome, setCfNome] = useState('')
  const [cfCategoria, setCfCategoria] = useState('estrutura')
  const [cfUnidade, setCfUnidade] = useState('geral')
  const [cfValor, setCfValor] = useState('')

  const mesRef = mesSelecionado + '-01'

  useEffect(() => { carregarTudo() }, [mesSelecionado])

  async function carregarTudo() {
    setCarregando(true)
    await Promise.all([carregarFinanceiros(), carregarLancamentos(), carregarCustosFixos()])
    setCarregando(false)
  }

  async function carregarFinanceiros() {
    const { data } = await supabase.from('financeiro_turma').select('*, turmas(data_inicio, preco_venda, meta_matriculas, produtos(nome), cidades(nome))').order('atualizado_em', { ascending: false })
    if (data) setFinanceiros(data)
  }

  async function carregarLancamentos() {
    const { data } = await supabase.from('lancamentos_empresa').select('*')
      .gte('data_vencimento', mesSelecionado + '-01').lte('data_vencimento', mesSelecionado + '-31')
      .order('data_vencimento', { ascending: true })
    if (data) setLancamentos(data)
  }

  async function carregarCustosFixos() {
    const { data } = await supabase.from('custos_fixos').select('*').eq('ativo', true).order('categoria')
    if (data) setCustosFixos(data)
  }

  async function salvarLancamento(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true)
    const { error } = await supabase.from('lancamentos_empresa').insert({
      tipo: lancTipo, categoria: lancCategoria, descricao: lancDescricao,
      valor: parseFloat(lancValor), unidade: lancUnidade, mes_referencia: mesRef,
      data_vencimento: lancVencimento, status: lancStatus,
    })
    if (!error) { setLancDescricao(''); setLancValor(''); setLancVencimento(''); setNovoLanc(false); carregarLancamentos() }
    setSalvando(false)
  }

  async function salvarCustoFixo(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true)
    const { error } = await supabase.from('custos_fixos').insert({
      nome: cfNome, categoria: cfCategoria, unidade: cfUnidade, valor_padrao: parseFloat(cfValor),
    })
    if (!error) { setCfNome(''); setCfValor(''); setNovoCustoFixo(false); carregarCustosFixos() }
    setSalvando(false)
  }

  async function confirmarPagamento(id: string) {
    await supabase.from('lancamentos_empresa').update({
      status: 'realizado', data_pagamento: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    carregarLancamentos()
  }

  async function gerarCustosFixosMes() {
    if (!custosFixos.length) return
    await supabase.from('lancamentos_empresa').insert(custosFixos.map(cf => ({
      tipo: 'custo', categoria: cf.categoria, descricao: cf.nome,
      valor: cf.valor_padrao, unidade: cf.unidade, mes_referencia: mesRef,
      data_vencimento: mesSelecionado + '-10', status: 'previsto',
    })))
    setMensagem('Custos fixos gerados!'); carregarLancamentos()
  }

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  // ===== CÁLCULOS PREVISTO VS REALIZADO =====
  const receitasPrev = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'previsto').reduce((s, l) => s + l.valor, 0)
  const receitasReal = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'realizado').reduce((s, l) => s + l.valor, 0)
  const custosPrev = lancamentos.filter(l => l.tipo === 'custo' && l.status === 'previsto').reduce((s, l) => s + l.valor, 0)
  const custosReal = lancamentos.filter(l => l.tipo === 'custo' && l.status === 'realizado').reduce((s, l) => s + l.valor, 0)
  const custosFixosMes = custosFixos.reduce((s, c) => s + (c.valor_padrao || 0), 0)
  const margemPrev = receitasPrev - custosPrev
  const margemReal = receitasReal - custosReal
  const resultadoPrev = receitasPrev - custosPrev - custosFixosMes
  const resultadoReal = receitasReal - custosReal - custosFixosMes

  // Por categoria de custo (para o DRE)
  function totalPorCategoria(cat: string, status: string) {
    return lancamentos.filter(l => l.tipo === 'custo' && l.categoria === cat && l.status === status).reduce((s, l) => s + l.valor, 0)
  }

  const abas = [
    { id: 'visao_geral', label: 'Visão geral' },
    { id: 'turmas', label: 'Por turma' },
    { id: 'lancamentos', label: 'Lançamentos' },
    { id: 'custos_fixos', label: 'Custos fixos' },
    { id: 'dre', label: 'DRE' },
  ]

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Financeiro</h1>
        <input type="month" value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} style={{ ...select, width: 'auto' }} />
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #3a3a3c' }}>
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)} style={{
            padding: '10px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
            border: 'none', borderBottom: aba === a.id ? '2px solid #7c3aed' : '2px solid transparent',
            backgroundColor: 'transparent', color: aba === a.id ? '#a78bfa' : '#9ca3af',
            marginBottom: '-1px',
          }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* VISÃO GERAL */}
      {aba === 'visao_geral' && (
        <div>
          {/* KPIs principais com previsto vs realizado */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={card}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Receita</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Realizada</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#34d399' }}>{fmt(receitasReal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Prevista</span>
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>{fmt(receitasPrev)}</span>
              </div>
            </div>

            <div style={card}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Custos variáveis</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Realizado</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#f87171' }}>{fmt(custosReal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Previsto</span>
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>{fmt(custosPrev)}</span>
              </div>
            </div>

            <div style={card}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Custos fixos</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#f87171' }}>{fmt(custosFixosMes)}</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{custosFixos.length} itens cadastrados</div>
            </div>

            <div style={card}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Resultado</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Realizado</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: resultadoReal >= 0 ? '#34d399' : '#f87171' }}>{fmt(resultadoReal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Previsto</span>
                <span style={{ fontSize: '13px', color: resultadoPrev >= 0 ? '#9ca3af' : '#f87171' }}>{fmt(resultadoPrev)}</span>
              </div>
            </div>
          </div>

          {/* Resumo por unidade */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {['lajeado', 'porto_alegre'].map(unidade => {
              const custosU = custosFixos.filter(c => c.unidade === unidade || c.unidade === 'ambas').reduce((s, c) => s + c.valor_padrao, 0)
              const lancU = lancamentos.filter(l => (l.unidade === unidade || l.unidade === 'ambas') && l.tipo === 'custo').reduce((s, l) => s + l.valor, 0)
              return (
                <div key={unidade} style={card}>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>{unidadeNome[unidade]}</div>
                  {[['Custos fixos', custosU], ['Lançamentos do mês', lancU]].map(([label, val]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                      <span style={{ color: '#9ca3af' }}>{label}</span>
                      <span style={{ color: '#f87171' }}>{fmt(val as number)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '600', paddingTop: '12px', borderTop: '1px solid #3a3a3c', marginTop: '8px' }}>
                    <span style={{ color: '#ffffff' }}>Total</span>
                    <span style={{ color: '#f87171' }}>{fmt(custosU + lancU)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* POR TURMA */}
      {aba === 'turmas' && (
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={cardHeader}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#d1d1d1' }}>Financeiro por turma</span>
              </div>
              {financeiros.length === 0 ? (
                <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhuma turma com financeiro registrado.</p>
              ) : financeiros.map(f => (
                <div key={f.id} onClick={() => setSelecionado(f)}
                  style={{ padding: '16px 24px', borderBottom: '1px solid #3a3a3c', cursor: 'pointer', backgroundColor: selecionado?.id === f.id ? '#3a2f5e' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>{f.turmas?.produtos?.nome}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {f.turmas?.cidades?.nome} · {f.turmas?.data_inicio ? new Date(f.turmas.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: (f.margem_prevista || 0) >= 0 ? '#34d399' : '#f87171' }}>{fmt(f.margem_prevista)}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>margem prevista</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selecionado && (
            <div style={{ width: '340px', flexShrink: 0 }}>
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={cardHeader}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>{selecionado.turmas?.produtos?.nome}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{selecionado.turmas?.cidades?.nome}</div>
                </div>
                <div style={{ padding: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th></th>
                        <th style={{ textAlign: 'right', fontSize: '10px', color: '#6b7280', fontWeight: '500', padding: '0 0 8px 0' }}>Previsto</th>
                        <th style={{ textAlign: 'right', fontSize: '10px', color: '#6b7280', fontWeight: '500', padding: '0 0 8px 8px' }}>Realizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontSize: '12px', color: '#9ca3af', padding: '4px 0' }}>Receita</td>
                        <td style={{ fontSize: '12px', textAlign: 'right', color: '#9ca3af' }}>{fmt(selecionado.receita_prevista)}</td>
                        <td style={{ fontSize: '12px', textAlign: 'right', color: '#34d399', fontWeight: '600', paddingLeft: '8px' }}>{fmt(selecionado.receita_realizada)}</td>
                      </tr>
                      <tr><td colSpan={3} style={{ paddingTop: '8px', borderTop: '1px solid #3a3a3c' }}></td></tr>
                      {[
                        ['Professores', selecionado.custo_professores],
                        ['Tráfego', selecionado.custo_trafego_previsto],
                        ['Imposto', selecionado.imposto_previsto],
                        ['Deslocamento', selecionado.custo_deslocamento],
                      ].map(([label, val]) => (
                        <tr key={label as string}>
                          <td style={{ fontSize: '12px', color: '#9ca3af', padding: '3px 0' }}>(-) {label}</td>
                          <td style={{ fontSize: '12px', textAlign: 'right', color: '#f87171' }}>{fmt(val as number)}</td>
                          <td style={{ fontSize: '12px', textAlign: 'right', color: '#6b7280', paddingLeft: '8px' }}>—</td>
                        </tr>
                      ))}
                      <tr><td colSpan={3} style={{ paddingTop: '8px', borderTop: '1px solid #3a3a3c' }}></td></tr>
                      <tr>
                        <td style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff', padding: '6px 0' }}>Margem</td>
                        <td style={{ fontSize: '13px', textAlign: 'right', fontWeight: '700', color: (selecionado.margem_prevista || 0) >= 0 ? '#34d399' : '#f87171' }}>{fmt(selecionado.margem_prevista)}</td>
                        <td style={{ fontSize: '13px', textAlign: 'right', fontWeight: '700', color: (selecionado.margem_realizada || 0) >= 0 ? '#34d399' : '#f87171', paddingLeft: '8px' }}>{fmt(selecionado.margem_realizada || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px' }}>Break-even: {selecionado.break_even_matriculas} matrículas</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LANÇAMENTOS */}
      {aba === 'lancamentos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', color: '#9ca3af' }}>{lancamentos.length} lançamento{lancamentos.length !== 1 ? 's' : ''}</span>
            <button onClick={() => setNovoLanc(!novoLanc)} style={btnPrimary}>+ Novo lançamento</button>
          </div>

          {novoLanc && (
            <div style={{ ...card, marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Novo lançamento</div>
              <form onSubmit={salvarLancamento}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <select value={lancTipo} onChange={e => setLancTipo(e.target.value)} style={select}>
                    <option value="custo">Custo</option>
                    <option value="receita">Receita</option>
                  </select>
                  <select value={lancCategoria} onChange={e => setLancCategoria(e.target.value)} style={select}>
                    <option value="pessoal">Pessoal</option>
                    <option value="estrutura">Estrutura</option>
                    <option value="sistemas">Sistemas</option>
                    <option value="marketing">Marketing</option>
                    <option value="imposto">Imposto</option>
                    <option value="outro">Outro</option>
                  </select>
                  <select value={lancUnidade} onChange={e => setLancUnidade(e.target.value)} style={select}>
                    <option value="geral">Geral</option>
                    <option value="lajeado">Lajeado</option>
                    <option value="porto_alegre">Porto Alegre</option>
                    <option value="ambas">Ambas</option>
                  </select>
                </div>
                <input value={lancDescricao} onChange={e => setLancDescricao(e.target.value)} placeholder="Descrição" required style={{ ...input, marginBottom: '12px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <input value={lancValor} onChange={e => setLancValor(e.target.value)} placeholder="Valor R$" type="number" required style={input} />
                  <input value={lancVencimento} onChange={e => setLancVencimento(e.target.value)} type="date" style={input} />
                  <select value={lancStatus} onChange={e => setLancStatus(e.target.value)} style={select}>
                    <option value="previsto">Previsto</option>
                    <option value="realizado">Realizado</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" onClick={() => setNovoLanc(false)} style={btnSecondary}>Cancelar</button>
                  <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Salvando...' : 'Salvar'}</button>
                </div>
              </form>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {lancamentos.length === 0 ? (
              <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhum lançamento neste mês.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                    {['Descrição', 'Categoria', 'Unidade', 'Vencimento', 'Valor', 'Status', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                      <td style={{ padding: '14px 20px', fontSize: '14px', color: '#ffffff' }}>{l.descricao}</td>
                      <td style={{ padding: '14px 20px', fontSize: '14px', color: '#9ca3af' }}>{categoriaNome[l.categoria]}</td>
                      <td style={{ padding: '14px 20px', fontSize: '14px', color: '#9ca3af' }}>{unidadeNome[l.unidade]}</td>
                      <td style={{ padding: '14px 20px', fontSize: '14px', color: '#9ca3af' }}>{l.data_vencimento ? new Date(l.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: '600', color: l.tipo === 'receita' ? '#34d399' : '#f87171' }}>{l.tipo === 'receita' ? '+' : '-'}{fmt(l.valor)}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '20px', backgroundColor: l.status === 'realizado' ? '#052e16' : '#1c1917', color: l.status === 'realizado' ? '#34d399' : '#9ca3af' }}>
                          {l.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        {l.status === 'previsto' && (
                          <button onClick={() => confirmarPagamento(l.id)} style={{ fontSize: '12px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>
                            {l.tipo === 'receita' ? 'Recebido ✓' : 'Pago ✓'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* CUSTOS FIXOS */}
      {aba === 'custos_fixos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', color: '#9ca3af' }}>{custosFixos.length} custo{custosFixos.length !== 1 ? 's' : ''} fixo{custosFixos.length !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={gerarCustosFixosMes} style={btnSecondary}>Gerar para {mesSelecionado.split('-').reverse().join('/')}</button>
              <button onClick={() => setNovoCustoFixo(!novoCustoFixo)} style={btnPrimary}>+ Cadastrar</button>
            </div>
          </div>

          {novoCustoFixo && (
            <div style={{ ...card, marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Novo custo fixo</div>
              <form onSubmit={salvarCustoFixo}>
                <input value={cfNome} onChange={e => setCfNome(e.target.value)} placeholder="Nome (ex: Aluguel Lajeado)" required style={{ ...input, marginBottom: '12px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: '12px', marginBottom: '16px' }}>
                  <select value={cfCategoria} onChange={e => setCfCategoria(e.target.value)} style={select}>
                    <option value="estrutura">Estrutura</option>
                    <option value="pessoal">Pessoal</option>
                    <option value="sistemas">Sistemas</option>
                    <option value="marketing">Marketing</option>
                    <option value="outro">Outro</option>
                  </select>
                  <select value={cfUnidade} onChange={e => setCfUnidade(e.target.value)} style={select}>
                    <option value="lajeado">Lajeado</option>
                    <option value="porto_alegre">Porto Alegre</option>
                    <option value="ambas">Ambas</option>
                    <option value="geral">Geral</option>
                  </select>
                  <input value={cfValor} onChange={e => setCfValor(e.target.value)} placeholder="Valor R$" type="number" required style={input} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" onClick={() => setNovoCustoFixo(false)} style={btnSecondary}>Cancelar</button>
                  <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Salvando...' : 'Salvar'}</button>
                </div>
              </form>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {custosFixos.length === 0 ? (
              <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhum custo fixo cadastrado. Adicione aluguel, salários, sistemas...</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                    {['Nome', 'Categoria', 'Unidade', 'Valor mensal'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 20px', fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {custosFixos.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                      <td style={{ padding: '14px 20px', fontSize: '14px', color: '#ffffff' }}>{c.nome}</td>
                      <td style={{ padding: '14px 20px', fontSize: '14px', color: '#9ca3af' }}>{categoriaNome[c.categoria]}</td>
                      <td style={{ padding: '14px 20px', fontSize: '14px', color: '#9ca3af' }}>{unidadeNome[c.unidade]}</td>
                      <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: '600', color: '#f87171' }}>{fmt(c.valor_padrao)}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#2c2c2e' }}>
                    <td colSpan={3} style={{ padding: '14px 20px', fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>Total mensal</td>
                    <td style={{ padding: '14px 20px', fontSize: '16px', fontWeight: '700', color: '#f87171' }}>{fmt(custosFixosMes)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
          {mensagem && <p style={{ marginTop: '12px', fontSize: '14px', color: '#34d399' }}>{mensagem}</p>}
        </div>
      )}

      {/* DRE com 2 colunas */}
      {aba === 'dre' && (
        <div style={{ maxWidth: '720px' }}>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={cardHeader}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>
                DRE — {new Date(mesRef + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div style={{ padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th></th>
                    <th style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280', fontWeight: '500', padding: '0 16px 12px' }}>Previsto</th>
                    <th style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280', fontWeight: '500', padding: '0 0 12px 0' }}>Realizado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontSize: '13px', color: '#9ca3af', padding: '6px 0' }}>Receita</td>
                    <td style={{ fontSize: '13px', textAlign: 'right', color: '#34d399', padding: '6px 16px' }}>{fmt(receitasPrev)}</td>
                    <td style={{ fontSize: '13px', textAlign: 'right', color: '#34d399', fontWeight: '600', padding: '6px 0' }}>{fmt(receitasReal)}</td>
                  </tr>

                  <tr><td colSpan={3} style={{ paddingTop: '12px', borderTop: '1px solid #3a3a3c' }}></td></tr>
                  <tr>
                    <td colSpan={3} style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0' }}>Custos variáveis</td>
                  </tr>
                  {[
                    ['Pessoal (professores)', 'pessoal'],
                    ['Marketing (tráfego)', 'marketing'],
                    ['Imposto', 'imposto'],
                    ['Outros (deslocamento etc.)', 'outro'],
                  ].map(([label, cat]) => (
                    <tr key={cat}>
                      <td style={{ fontSize: '13px', color: '#9ca3af', padding: '4px 0' }}>(-) {label}</td>
                      <td style={{ fontSize: '13px', textAlign: 'right', color: '#f87171', padding: '4px 16px' }}>{fmt(totalPorCategoria(cat, 'previsto'))}</td>
                      <td style={{ fontSize: '13px', textAlign: 'right', color: '#f87171', padding: '4px 0' }}>{fmt(totalPorCategoria(cat, 'realizado'))}</td>
                    </tr>
                  ))}

                  <tr><td colSpan={3} style={{ paddingTop: '12px', borderTop: '1px solid #3a3a3c' }}></td></tr>
                  <tr>
                    <td style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', padding: '8px 0' }}>= Margem bruta</td>
                    <td style={{ fontSize: '14px', fontWeight: '600', textAlign: 'right', color: margemPrev >= 0 ? '#34d399' : '#f87171', padding: '8px 16px' }}>{fmt(margemPrev)}</td>
                    <td style={{ fontSize: '14px', fontWeight: '600', textAlign: 'right', color: margemReal >= 0 ? '#34d399' : '#f87171', padding: '8px 0' }}>{fmt(margemReal)}</td>
                  </tr>

                  <tr><td colSpan={3} style={{ paddingTop: '12px', borderTop: '1px solid #3a3a3c' }}></td></tr>
                  <tr>
                    <td colSpan={3} style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0' }}>Custos fixos</td>
                  </tr>
                  {['estrutura', 'pessoal', 'sistemas', 'marketing', 'outro'].map(cat => {
                    const total = custosFixos.filter(c => c.categoria === cat).reduce((s, c) => s + c.valor_padrao, 0)
                    if (!total) return null
                    return (
                      <tr key={cat}>
                        <td style={{ fontSize: '13px', color: '#9ca3af', padding: '4px 0' }}>(-) {categoriaNome[cat]}</td>
                        <td style={{ fontSize: '13px', textAlign: 'right', color: '#f87171', padding: '4px 16px' }}>{fmt(total)}</td>
                        <td style={{ fontSize: '13px', textAlign: 'right', color: '#6b7280', padding: '4px 0' }}>—</td>
                      </tr>
                    )
                  })}

                  <tr><td colSpan={3} style={{ paddingTop: '16px', borderTop: '2px solid #3a3a3c' }}></td></tr>
                  <tr>
                    <td style={{ fontSize: '16px', fontWeight: '800', color: '#ffffff', padding: '12px 0' }}>= Resultado líquido</td>
                    <td style={{ fontSize: '16px', fontWeight: '800', textAlign: 'right', color: resultadoPrev >= 0 ? '#34d399' : '#f87171', padding: '12px 16px' }}>{fmt(resultadoPrev)}</td>
                    <td style={{ fontSize: '16px', fontWeight: '800', textAlign: 'right', color: resultadoReal >= 0 ? '#34d399' : '#f87171', padding: '12px 0' }}>{fmt(resultadoReal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}