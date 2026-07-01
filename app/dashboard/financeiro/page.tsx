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
  conta_id: string | null
  recorrente: boolean
  grupo_recorrencia: string | null
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

type Conta = {
  id: string
  nome: string
  tipo: string
  unidade: string
  ativo: boolean
}

const unidadeNome: Record<string, string> = { lajeado: 'Lajeado', porto_alegre: 'Porto Alegre', ambas: 'Ambas', geral: 'Geral' }
const categoriaNome: Record<string, string> = { pessoal: 'Pessoal', estrutura: 'Estrutura', sistemas: 'Sistemas', marketing: 'Marketing', turma: 'Turma', imposto: 'Imposto', outro: 'Outro' }

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }
const cardHeader = { padding: '16px 24px', borderBottom: '1px solid var(--border)' }
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

function addMonths(yyyymm: string, months: number) {
  const [y, m] = yyyymm.split('-').map(Number)
  const d = new Date(y, m - 1 + months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function gerarUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function ultimoDiaDoMes(yyyymm: string) {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export default function Financeiro() {
  const [aba, setAba] = useState<'visao_geral' | 'turmas' | 'lancamentos' | 'dre'>('visao_geral')
  const [financeiros, setFinanceiros] = useState<FinanceiroTurma[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [naturezas, setNaturezas] = useState<{ chave: string; nome: string; ativo: boolean }[]>([])
  const [selecionado, setSelecionado] = useState<FinanceiroTurma | null>(null)
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7))
  const [carregando, setCarregando] = useState(true)
  const [novoLanc, setNovoLanc] = useState(false)
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [agrupamento, setAgrupamento] = useState<'mes' | 'dia'>('mes')
  const [filtroConta, setFiltroConta] = useState('')

  const [lancTipo, setLancTipo] = useState('custo')
  const [lancCategoria, setLancCategoria] = useState('outro')
  const [lancDescricao, setLancDescricao] = useState('')
  const [lancValor, setLancValor] = useState('')
  const [lancUnidade, setLancUnidade] = useState('geral')
  const [lancVencimento, setLancVencimento] = useState('')
  const [lancStatus, setLancStatus] = useState('previsto')
  const [lancRecorrente, setLancRecorrente] = useState(false)
  const [lancMeses, setLancMeses] = useState('12')
  const [lancContaId, setLancContaId] = useState('')

  const mesRef = mesSelecionado + '-01'

  useEffect(() => { carregarTudo() }, [mesSelecionado])

  async function carregarTudo() {
    setCarregando(true)
    await Promise.all([carregarFinanceiros(), carregarLancamentos(), carregarContas(), carregarNaturezas()])
    setCarregando(false)
  }

  async function carregarNaturezas() {
    const { data } = await supabase.from('naturezas_financeiras').select('chave, nome, ativo').order('ordem').order('nome')
    setNaturezas((data || []) as any)
  }
  // naturezas dinâmicas (tabela) com fallback pras fixas antigas
  const natMap: Record<string, string> = { ...categoriaNome, ...Object.fromEntries(naturezas.map(n => [n.chave, n.nome])) }
  const cats = naturezas.length ? naturezas.filter(n => n.ativo) : Object.entries(categoriaNome).map(([chave, nome]) => ({ chave, nome, ativo: true }))

  async function carregarFinanceiros() {
    const { data } = await supabase.from('financeiro_turma').select('*, turmas(data_inicio, preco_venda, meta_matriculas, produtos(nome), cidades(nome))').order('atualizado_em', { ascending: false })
    if (data) setFinanceiros(data)
  }

  async function carregarLancamentos() {
    const ultimoDia = ultimoDiaDoMes(mesSelecionado)
    const dataFim = `${mesSelecionado}-${String(ultimoDia).padStart(2, '0')}`
    const { data, error } = await supabase.from('lancamentos_empresa').select('*')
      .gte('data_vencimento', mesSelecionado + '-01').lte('data_vencimento', dataFim)
      .order('data_vencimento', { ascending: true })
    if (error) console.error('Erro lancamentos:', error)
    if (data) setLancamentos(data)
  }

  async function carregarContas() {
    const { data } = await supabase.from('contas_financeiras')
      .select('id, nome, tipo, unidade, ativo')
      .eq('ativo', true)
      .order('nome')
    if (data) setContas(data)
  }

  function limparForm() {
    setLancTipo('custo'); setLancCategoria('outro'); setLancDescricao('')
    setLancValor(''); setLancUnidade('geral'); setLancVencimento('')
    setLancStatus('previsto'); setLancRecorrente(false); setLancMeses('12')
    setLancContaId(''); setEditando(null); setMensagem('')
  }

  function abrirEdicao(l: Lancamento) {
    setEditando(l)
    setLancTipo(l.tipo); setLancCategoria(l.categoria); setLancDescricao(l.descricao)
    setLancValor(l.valor.toString()); setLancUnidade(l.unidade)
    setLancVencimento(l.data_vencimento); setLancStatus(l.status)
    setLancContaId(l.conta_id || '')
    setLancRecorrente(false); setNovoLanc(true)
  }

  async function salvarLancamento(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setMensagem('')

    if (!lancContaId) { setMensagem('Selecione a caixa.'); setSalvando(false); return }

    if (editando) {
      const payload: any = {
        descricao: lancDescricao,
        categoria: lancCategoria,
        valor: parseFloat(lancValor),
        data_vencimento: lancVencimento,
        status: lancStatus,
        conta_id: lancContaId,
      }
      if (lancStatus === 'realizado' && !editando.data_pagamento) {
        payload.data_pagamento = new Date().toISOString().split('T')[0]
      }

      if (editando.recorrente && editando.grupo_recorrencia) {
        const confirma = confirm('Este lançamento é recorrente. Aplicar a alteração também nos meses futuros do mesmo grupo?')
        if (confirma) {
          const { error } = await supabase.from('lancamentos_empresa').update({
            descricao: lancDescricao, categoria: lancCategoria, valor: parseFloat(lancValor), status: lancStatus, conta_id: lancContaId,
          }).eq('grupo_recorrencia', editando.grupo_recorrencia)
            .gte('data_vencimento', editando.data_vencimento)
          if (error) { setMensagem('Erro: ' + error.message); setSalvando(false); return }
          await supabase.from('lancamentos_empresa').update({ data_vencimento: lancVencimento }).eq('id', editando.id)
          setMensagem('Lançamentos atualizados!')
        } else {
          const { error } = await supabase.from('lancamentos_empresa').update(payload).eq('id', editando.id)
          if (error) { setMensagem('Erro: ' + error.message); setSalvando(false); return }
          setMensagem('Lançamento atualizado!')
        }
      } else {
        const { error } = await supabase.from('lancamentos_empresa').update(payload).eq('id', editando.id)
        if (error) { setMensagem('Erro: ' + error.message); setSalvando(false); return }
        setMensagem('Lançamento atualizado!')
      }

      limparForm(); setNovoLanc(false); carregarLancamentos()
      setSalvando(false); return
    }

    if (lancRecorrente) {
      const meses = parseInt(lancMeses) || 1
      const grupoId = gerarUuid()
      const vencDate = new Date(lancVencimento + 'T12:00:00')
      const dia = vencDate.getDate()

      const lancamentosParaInserir = []
      for (let i = 0; i < meses; i++) {
        const mesAlvo = addMonths(mesSelecionado, i)
        const [y, m] = mesAlvo.split('-').map(Number)
        const ultimoDia = new Date(y, m, 0).getDate()
        const diaFinal = Math.min(dia, ultimoDia)
        const dataVencimento = `${mesAlvo}-${String(diaFinal).padStart(2, '0')}`

        lancamentosParaInserir.push({
          tipo: lancTipo, categoria: lancCategoria, descricao: lancDescricao,
          valor: parseFloat(lancValor), unidade: lancUnidade,
          mes_referencia: mesAlvo + '-01',
          data_vencimento: dataVencimento,
          status: i === 0 ? lancStatus : 'previsto',
          recorrente: true, grupo_recorrencia: grupoId,
          conta_id: lancContaId,
        })
      }
      const { error } = await supabase.from('lancamentos_empresa').insert(lancamentosParaInserir)
      if (error) { setMensagem('Erro: ' + error.message); setSalvando(false); return }
      setMensagem(`${meses} lançamentos recorrentes criados!`)
    } else {
      const { error } = await supabase.from('lancamentos_empresa').insert({
        tipo: lancTipo, categoria: lancCategoria, descricao: lancDescricao,
        valor: parseFloat(lancValor), unidade: lancUnidade,
        mes_referencia: mesRef, data_vencimento: lancVencimento,
        status: lancStatus, recorrente: false,
        conta_id: lancContaId,
      })
      if (error) { setMensagem('Erro: ' + error.message); setSalvando(false); return }
      setMensagem('Lançamento criado!')
    }

    limparForm(); setNovoLanc(false); carregarLancamentos()
    setSalvando(false)
  }

  async function confirmarPagamento(id: string) {
    await supabase.from('lancamentos_empresa').update({
      status: 'realizado', data_pagamento: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    carregarLancamentos()
  }

  async function excluirLancamento(l: Lancamento) {
    if (l.recorrente && l.grupo_recorrencia) {
      const confirma = confirm('Lançamento recorrente. Excluir todos os meses futuros desse grupo?')
      if (!confirma) return
      await supabase.from('lancamentos_empresa').delete()
        .eq('grupo_recorrencia', l.grupo_recorrencia)
        .gte('data_vencimento', l.data_vencimento)
    } else {
      if (!confirm('Excluir este lançamento?')) return
      await supabase.from('lancamentos_empresa').delete().eq('id', l.id)
    }
    carregarLancamentos()
  }

  function nomeConta(id: string | null) {
    if (!id) return '—'
    return contas.find(c => c.id === id)?.nome || '—'
  }

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  const lancamentosFiltrados = filtroConta
    ? lancamentos.filter(l => l.conta_id === filtroConta)
    : lancamentos

  const receitasPrev = lancamentosFiltrados.filter(l => l.tipo === 'receita' && l.status === 'previsto').reduce((s, l) => s + l.valor, 0)
  const receitasReal = lancamentosFiltrados.filter(l => l.tipo === 'receita' && l.status === 'realizado').reduce((s, l) => s + l.valor, 0)
  const custosPrev = lancamentosFiltrados.filter(l => l.tipo === 'custo' && l.status === 'previsto').reduce((s, l) => s + l.valor, 0)
  const custosReal = lancamentosFiltrados.filter(l => l.tipo === 'custo' && l.status === 'realizado').reduce((s, l) => s + l.valor, 0)
  const custosFixosMes = lancamentosFiltrados.filter(l => l.tipo === 'custo' && l.recorrente).reduce((s, l) => s + l.valor, 0)
  const margemPrev = receitasPrev - custosPrev
  const margemReal = receitasReal - custosReal
  const resultadoPrev = receitasPrev - custosPrev
  const resultadoReal = receitasReal - custosReal

  function totalPorCategoria(cat: string, status: string) {
    return lancamentosFiltrados.filter(l => l.tipo === 'custo' && l.categoria === cat && l.status === status).reduce((s, l) => s + l.valor, 0)
  }
  function totalPorCategoriaRecorrente(cat: string) {
    return lancamentosFiltrados.filter(l => l.tipo === 'custo' && l.categoria === cat && l.recorrente).reduce((s, l) => s + l.valor, 0)
  }

  function agruparPorDia() {
    const grupos: Record<string, Lancamento[]> = {}
    lancamentosFiltrados.forEach(l => {
      const dia = l.data_vencimento
      if (!grupos[dia]) grupos[dia] = []
      grupos[dia].push(l)
    })
    return Object.keys(grupos).sort().map(dia => ({
      dia, lancamentos: grupos[dia],
      totalReceitas: grupos[dia].filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0),
      totalCustos: grupos[dia].filter(l => l.tipo === 'custo').reduce((s, l) => s + l.valor, 0),
    }))
  }

  const abas = [
    { id: 'visao_geral', label: 'Visão geral' },
    { id: 'turmas', label: 'Por turma' },
    { id: 'lancamentos', label: 'Lançamentos' },
    { id: 'dre', label: 'DRE' },
  ]

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)' }}>Financeiro</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={filtroConta} onChange={e => setFiltroConta(e.target.value)} style={{ ...select, width: 'auto' }}>
            <option value="">Todas as caixas</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input type="month" value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} style={{ ...select, width: 'auto' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)} style={{
            padding: '10px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
            border: 'none', borderBottom: aba === a.id ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent', color: aba === a.id ? 'var(--accent-soft)' : 'var(--text-muted)',
            marginBottom: '-1px',
          }}>{a.label}</button>
        ))}
      </div>

      {aba === 'visao_geral' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={card}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Receita</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Realizada</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--green)' }}>{fmt(receitasReal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Prevista</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{fmt(receitasPrev)}</span>
              </div>
            </div>
            <div style={card}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Custos variáveis</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Realizado</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--red)' }}>{fmt(custosReal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Previsto</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{fmt(custosPrev)}</span>
              </div>
            </div>
            <div style={card}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Custos fixos (recorrentes)</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--red)' }}>{fmt(custosFixosMes)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>{lancamentosFiltrados.filter(l => l.tipo === 'custo' && l.recorrente).length} lançamentos no mês</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Resultado</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Realizado</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: resultadoReal >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(resultadoReal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Previsto</span>
                <span style={{ fontSize: '13px', color: resultadoPrev >= 0 ? 'var(--text-muted)' : 'var(--red)' }}>{fmt(resultadoPrev)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {['lajeado', 'porto_alegre'].map(unidade => {
              const custosU = lancamentosFiltrados.filter(l => l.tipo === 'custo' && (l.unidade === unidade || l.unidade === 'ambas')).reduce((s, l) => s + l.valor, 0)
              const receitaU = lancamentosFiltrados.filter(l => l.tipo === 'receita' && (l.unidade === unidade || l.unidade === 'ambas')).reduce((s, l) => s + l.valor, 0)
              return (
                <div key={unidade} style={card}>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px' }}>{unidadeNome[unidade]}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Receita do mês</span>
                    <span style={{ color: 'var(--green)' }}>{fmt(receitaU)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Custos do mês</span>
                    <span style={{ color: 'var(--red)' }}>{fmt(custosU)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '600', paddingTop: '12px', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
                    <span style={{ color: 'var(--text)' }}>Resultado</span>
                    <span style={{ color: (receitaU - custosU) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(receitaU - custosU)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {aba === 'turmas' && (
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={cardHeader}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-2)' }}>Financeiro por turma</span>
              </div>
              {financeiros.length === 0 ? (
                <p style={{ padding: '24px', fontSize: '14px', color: 'var(--text-faint)' }}>Nenhuma turma com financeiro registrado.</p>
              ) : financeiros.map(f => (
                <div key={f.id} onClick={() => setSelecionado(f)}
                  style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', cursor: 'pointer', backgroundColor: selecionado?.id === f.id ? 'var(--surface-sel)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{f.turmas?.produtos?.nome}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>
                        {f.turmas?.cidades?.nome} · {f.turmas?.data_inicio ? new Date(f.turmas.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: (f.margem_prevista || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(f.margem_prevista)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>margem prevista</div>
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
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{selecionado.turmas?.produtos?.nome}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>{selecionado.turmas?.cidades?.nome}</div>
                </div>
                <div style={{ padding: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th></th>
                        <th style={{ textAlign: 'right', fontSize: '10px', color: 'var(--text-faint)', fontWeight: '500', padding: '0 0 8px 0' }}>Previsto</th>
                        <th style={{ textAlign: 'right', fontSize: '10px', color: 'var(--text-faint)', fontWeight: '500', padding: '0 0 8px 8px' }}>Realizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 0' }}>Receita</td>
                        <td style={{ fontSize: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(selecionado.receita_prevista)}</td>
                        <td style={{ fontSize: '12px', textAlign: 'right', color: 'var(--green)', fontWeight: '600', paddingLeft: '8px' }}>{fmt(selecionado.receita_realizada)}</td>
                      </tr>
                      <tr><td colSpan={3} style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}></td></tr>
                      {[
                        ['Professores', selecionado.custo_professores],
                        ['Tráfego', selecionado.custo_trafego_previsto],
                        ['Imposto', selecionado.imposto_previsto],
                        ['Deslocamento', selecionado.custo_deslocamento],
                      ].map(([label, val]) => (
                        <tr key={label as string}>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '3px 0' }}>(-) {label}</td>
                          <td style={{ fontSize: '12px', textAlign: 'right', color: 'var(--red)' }}>{fmt(val as number)}</td>
                          <td style={{ fontSize: '12px', textAlign: 'right', color: 'var(--text-faint)', paddingLeft: '8px' }}>—</td>
                        </tr>
                      ))}
                      <tr><td colSpan={3} style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}></td></tr>
                      <tr>
                        <td style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', padding: '6px 0' }}>Margem</td>
                        <td style={{ fontSize: '13px', textAlign: 'right', fontWeight: '700', color: (selecionado.margem_prevista || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(selecionado.margem_prevista)}</td>
                        <td style={{ fontSize: '13px', textAlign: 'right', fontWeight: '700', color: (selecionado.margem_realizada || 0) >= 0 ? 'var(--green)' : 'var(--red)', paddingLeft: '8px' }}>{fmt(selecionado.margem_realizada || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '12px' }}>Break-even: {selecionado.break_even_matriculas} matrículas</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {aba === 'lancamentos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{lancamentosFiltrados.length} lançamento(s) em {mesSelecionado.split('-').reverse().join('/')}</span>
              <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setAgrupamento('mes')}
                  style={{ padding: '6px 14px', background: agrupamento === 'mes' ? 'var(--accent)' : 'transparent', color: agrupamento === 'mes' ? 'var(--on-accent)' : 'var(--text-muted)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  Por mês
                </button>
                <button onClick={() => setAgrupamento('dia')}
                  style={{ padding: '6px 14px', background: agrupamento === 'dia' ? 'var(--accent)' : 'transparent', color: agrupamento === 'dia' ? 'var(--on-accent)' : 'var(--text-muted)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  Por dia
                </button>
              </div>
            </div>
            <button onClick={() => { if (novoLanc) { limparForm(); setNovoLanc(false) } else { limparForm(); setNovoLanc(true) } }} style={btnPrimary}>
              {novoLanc ? 'Fechar' : '+ Novo lançamento'}
            </button>
          </div>

          {novoLanc && (
            <div style={{ ...card, marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px' }}>
                {editando ? 'Editar lançamento' : 'Novo lançamento'}
              </div>
              <form onSubmit={salvarLancamento}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <select value={lancTipo} onChange={e => setLancTipo(e.target.value)} style={select} disabled={!!editando}>
                    <option value="custo">Custo</option>
                    <option value="receita">Receita</option>
                  </select>
                  <select value={lancCategoria} onChange={e => setLancCategoria(e.target.value)} style={select}>
                    {cats.map(n => <option key={n.chave} value={n.chave}>{n.nome}</option>)}
                  </select>
                  <select value={lancUnidade} onChange={e => setLancUnidade(e.target.value)} style={select} disabled={!!editando}>
                    <option value="geral">Geral</option>
                    <option value="lajeado">Lajeado</option>
                    <option value="porto_alegre">Porto Alegre</option>
                    <option value="ambas">Ambas</option>
                  </select>
                </div>
                <input value={lancDescricao} onChange={e => setLancDescricao(e.target.value)} placeholder="Descrição" required style={{ ...input, marginBottom: '12px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <input value={lancValor} onChange={e => setLancValor(e.target.value)} placeholder="Valor R$" type="number" step="0.01" required style={input} />
                  <input value={lancVencimento} onChange={e => setLancVencimento(e.target.value)} type="date" required style={input} />
                  <select value={lancStatus} onChange={e => setLancStatus(e.target.value)} style={select}>
                    <option value="previsto">Previsto</option>
                    <option value="realizado">Realizado</option>
                  </select>
                  <select value={lancContaId} onChange={e => setLancContaId(e.target.value)} style={select} required>
                    <option value="">Caixa *</option>
                    {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>

                {!editando && (
                  <div style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={lancRecorrente} onChange={e => setLancRecorrente(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                      <span style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: '500' }}>Lançamento recorrente</span>
                    </label>
                    {lancRecorrente && (
                      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Repetir por</span>
                        <input value={lancMeses} onChange={e => setLancMeses(e.target.value)} type="number" min="1" max="60"
                          style={{ ...input, width: '80px' }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>meses, sempre no mesmo dia</span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" onClick={() => { setNovoLanc(false); limparForm() }} style={btnSecondary}>Cancelar</button>
                  <button type="submit" disabled={salvando} style={btnPrimary}>
                    {salvando ? 'Salvando...' : (editando ? 'Atualizar' : 'Salvar')}
                  </button>
                </div>
                {mensagem && <p style={{ marginTop: '12px', fontSize: '13px', color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green)' }}>{mensagem}</p>}
              </form>
            </div>
          )}

          {agrupamento === 'mes' && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {lancamentosFiltrados.length === 0 ? (
                <p style={{ padding: '24px', fontSize: '14px', color: 'var(--text-faint)' }}>Nenhum lançamento neste mês.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Descrição', 'Categoria', 'Caixa', 'Vencimento', 'Valor', 'Status', ''].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: '12px', color: 'var(--text-faint)', fontWeight: '500' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosFiltrados.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text)' }}>
                          {l.descricao}
                          {l.recorrente && <span style={{ fontSize: '10px', marginLeft: '8px', padding: '2px 6px', borderRadius: '12px', backgroundColor: 'var(--accent-bg)', color: 'var(--accent-soft)' }}>↻ recorrente</span>}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>{natMap[l.categoria] || l.categoria}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: l.conta_id ? 'var(--text-muted)' : 'var(--red)' }}>{nomeConta(l.conta_id)}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>{l.data_vencimento ? new Date(l.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: l.tipo === 'receita' ? 'var(--green)' : 'var(--red)' }}>{l.tipo === 'receita' ? '+' : '-'}{fmt(l.valor)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', backgroundColor: l.status === 'realizado' ? 'var(--green-bg)' : 'var(--surface-2)', color: l.status === 'realizado' ? 'var(--green)' : 'var(--text-muted)' }}>
                            {l.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', display: 'flex', gap: '10px' }}>
                          <button onClick={() => abrirEdicao(l)} style={{ fontSize: '12px', color: 'var(--accent-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Editar</button>
                          {l.status === 'previsto' && (
                            <button onClick={() => confirmarPagamento(l.id)} style={{ fontSize: '12px', color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer' }}>
                              {l.tipo === 'receita' ? 'Recebido ✓' : 'Pago ✓'}
                            </button>
                          )}
                          <button onClick={() => excluirLancamento(l)} style={{ fontSize: '12px', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Excluir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {agrupamento === 'dia' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {lancamentosFiltrados.length === 0 ? (
                <div style={{ ...card, padding: '24px' }}>
                  <p style={{ fontSize: '14px', color: 'var(--text-faint)' }}>Nenhum lançamento neste mês.</p>
                </div>
              ) : agruparPorDia().map(({ dia, lancamentos: lancsDia, totalReceitas, totalCustos }) => {
                const saldoDia = totalReceitas - totalCustos
                return (
                  <div key={dia} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg)' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)' }}>
                          {new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>{lancsDia.length} lançamento(s)</div>
                      </div>
                      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        {totalReceitas > 0 && <span style={{ fontSize: '13px', color: 'var(--green)', fontWeight: '600' }}>+{fmt(totalReceitas)}</span>}
                        {totalCustos > 0 && <span style={{ fontSize: '13px', color: 'var(--red)', fontWeight: '600' }}>-{fmt(totalCustos)}</span>}
                        <span style={{ fontSize: '14px', fontWeight: '700', color: saldoDia >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(saldoDia)}</span>
                      </div>
                    </div>
                    {lancsDia.map(l => (
                      <div key={l.id} style={{ padding: '10px 20px', borderBottom: '1px solid var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                            {l.descricao}
                            {l.recorrente && <span style={{ fontSize: '10px', marginLeft: '8px', padding: '2px 6px', borderRadius: '12px', backgroundColor: 'var(--accent-bg)', color: 'var(--accent-soft)' }}>↻</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>{natMap[l.categoria] || l.categoria} · {unidadeNome[l.unidade]} · {nomeConta(l.conta_id)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: l.tipo === 'receita' ? 'var(--green)' : 'var(--red)' }}>
                            {l.tipo === 'receita' ? '+' : '-'}{fmt(l.valor)}
                          </span>
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', backgroundColor: l.status === 'realizado' ? 'var(--green-bg)' : 'var(--surface-2)', color: l.status === 'realizado' ? 'var(--green)' : 'var(--text-muted)' }}>
                            {l.status}
                          </span>
                          <button onClick={() => abrirEdicao(l)} style={{ fontSize: '11px', color: 'var(--accent-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Editar</button>
                          <button onClick={() => excluirLancamento(l)} style={{ fontSize: '11px', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {aba === 'dre' && (
        <div style={{ maxWidth: '720px' }}>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={cardHeader}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>
                DRE — {new Date(mesRef + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                {filtroConta && ` · ${nomeConta(filtroConta)}`}
              </span>
            </div>
            <div style={{ padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th></th>
                    <th style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500', padding: '0 16px 12px' }}>Previsto</th>
                    <th style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500', padding: '0 0 12px 0' }}>Realizado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '6px 0' }}>Receita</td>
                    <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--green)', padding: '6px 16px' }}>{fmt(receitasPrev)}</td>
                    <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--green)', fontWeight: '600', padding: '6px 0' }}>{fmt(receitasReal)}</td>
                  </tr>
                  <tr><td colSpan={3} style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}></td></tr>
                  <tr>
                    <td colSpan={3} style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0' }}>Custos variáveis</td>
                  </tr>
                  {[
                    ['Pessoal (professores)', 'pessoal'],
                    ['Marketing (tráfego)', 'marketing'],
                    ['Imposto', 'imposto'],
                    ['Outros (deslocamento etc.)', 'outro'],
                  ].map(([label, cat]) => (
                    <tr key={cat}>
                      <td style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '4px 0' }}>(-) {label}</td>
                      <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--red)', padding: '4px 16px' }}>{fmt(totalPorCategoria(cat, 'previsto'))}</td>
                      <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--red)', padding: '4px 0' }}>{fmt(totalPorCategoria(cat, 'realizado'))}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={3} style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}></td></tr>
                  <tr>
                    <td style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', padding: '8px 0' }}>= Margem bruta</td>
                    <td style={{ fontSize: '14px', fontWeight: '600', textAlign: 'right', color: margemPrev >= 0 ? 'var(--green)' : 'var(--red)', padding: '8px 16px' }}>{fmt(margemPrev)}</td>
                    <td style={{ fontSize: '14px', fontWeight: '600', textAlign: 'right', color: margemReal >= 0 ? 'var(--green)' : 'var(--red)', padding: '8px 0' }}>{fmt(margemReal)}</td>
                  </tr>
                  <tr><td colSpan={3} style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}></td></tr>
                  <tr>
                    <td colSpan={3} style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0' }}>Custos fixos (recorrentes)</td>
                  </tr>
                  {['estrutura', 'pessoal', 'sistemas', 'marketing', 'outro'].map(cat => {
                    const totalRec = totalPorCategoriaRecorrente(cat)
                    if (!totalRec) return null
                    return (
                      <tr key={cat}>
                        <td style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '4px 0' }}>(-) {categoriaNome[cat]}</td>
                        <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--red)', padding: '4px 16px' }}>{fmt(totalRec)}</td>
                        <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-faint)', padding: '4px 0' }}>—</td>
                      </tr>
                    )
                  })}
                  <tr><td colSpan={3} style={{ paddingTop: '16px', borderTop: '2px solid var(--border)' }}></td></tr>
                  <tr>
                    <td style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text)', padding: '12px 0' }}>= Resultado líquido</td>
                    <td style={{ fontSize: '16px', fontWeight: '800', textAlign: 'right', color: resultadoPrev >= 0 ? 'var(--green)' : 'var(--red)', padding: '12px 16px' }}>{fmt(resultadoPrev)}</td>
                    <td style={{ fontSize: '16px', fontWeight: '800', textAlign: 'right', color: resultadoReal >= 0 ? 'var(--green)' : 'var(--red)', padding: '12px 0' }}>{fmt(resultadoReal)}</td>
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