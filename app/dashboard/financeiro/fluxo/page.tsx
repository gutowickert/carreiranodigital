'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'

type Conta = { id: string; nome: string; tipo: string; unidade: string; saldo_inicial: number; ativo: boolean }
type Lanc = { id: string; tipo: string; categoria: string; descricao: string; valor: number; status: string; data_vencimento: string; data_pagamento: string | null; conta_id: string | null }
type Transf = { id: string; conta_origem_id: string; conta_destino_id: string; valor: number; data_transferencia: string; descricao: string | null }

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

const categoriaNome: Record<string, string> = { pessoal: 'Pessoal', estrutura: 'Estrutura', sistemas: 'Sistemas', marketing: 'Marketing', imposto: 'Imposto', outro: 'Outro' }

function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function ultimoDiaDoMes(yyyymm: string) {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export default function FluxoCaixa() {
  const [contas, setContas] = useState<Conta[]>([])
  const [lancamentos, setLancamentos] = useState<Lanc[]>([])
  const [transferencias, setTransferencias] = useState<Transf[]>([])
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [filtroConta, setFiltroConta] = useState('')
  const [naturezas, setNaturezas] = useState<{ chave: string; nome: string; ativo: boolean }[]>([])
  const [carregando, setCarregando] = useState(true)

  const [novo, setNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [fTipo, setFTipo] = useState<'receita' | 'custo'>('receita')
  const [fDesc, setFDesc] = useState('')
  const [fValor, setFValor] = useState('')
  const [fData, setFData] = useState(new Date().toISOString().split('T')[0])
  const [fConta, setFConta] = useState('')
  const [fCategoria, setFCategoria] = useState('outro')
  const [fStatus, setFStatus] = useState<'realizado' | 'previsto'>('realizado')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const [{ data: c }, { data: l }, { data: t }, { data: n }] = await Promise.all([
      supabase.from('contas_financeiras').select('id, nome, tipo, unidade, saldo_inicial, ativo').eq('ativo', true).order('nome'),
      supabase.from('lancamentos_empresa').select('id, tipo, categoria, descricao, valor, status, data_vencimento, data_pagamento, conta_id'),
      supabase.from('transferencias_caixa').select('id, conta_origem_id, conta_destino_id, valor, data_transferencia, descricao'),
      supabase.from('naturezas_financeiras').select('chave, nome, ativo').order('ordem').order('nome'),
    ])
    setContas(c || [])
    setLancamentos((l || []) as Lanc[])
    setTransferencias((t || []) as Transf[])
    setNaturezas((n || []) as any)
    setCarregando(false)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setMsg('')
    if (!fConta) { setMsg('Selecione a caixa.'); setSalvando(false); return }
    const { error } = await supabase.from('lancamentos_empresa').insert({
      tipo: fTipo, categoria: fCategoria, descricao: fDesc,
      valor: parseFloat(fValor), unidade: 'geral',
      mes_referencia: fData.substring(0, 7) + '-01',
      data_vencimento: fData,
      data_pagamento: fStatus === 'realizado' ? fData : null,
      status: fStatus, recorrente: false, conta_id: fConta,
    })
    if (error) { setMsg('Erro: ' + error.message); setSalvando(false); return }
    setFDesc(''); setFValor(''); setMsg('Lançado!')
    setNovo(false); setSalvando(false)
    carregar()
  }

  const inicioMes = mes + '-01'
  const fimMes = `${mes}-${String(ultimoDiaDoMes(mes)).padStart(2, '0')}`
  const dataEf = (l: Lanc) => l.data_pagamento || l.data_vencimento
  const somaTipo = (arr: Lanc[], tipo: string) => arr.filter(l => l.tipo === tipo).reduce((s, l) => s + (l.valor || 0), 0)

  function calcCaixa(contaId: string, saldoInicialConta: number) {
    const reais = lancamentos.filter(l => l.status === 'realizado' && l.conta_id === contaId)
    const antes = reais.filter(l => dataEf(l) < inicioMes)
    const noMes = reais.filter(l => { const d = dataEf(l); return d >= inicioMes && d <= fimMes })

    const trAntesIn = transferencias.filter(t => t.conta_destino_id === contaId && t.data_transferencia < inicioMes).reduce((s, t) => s + t.valor, 0)
    const trAntesOut = transferencias.filter(t => t.conta_origem_id === contaId && t.data_transferencia < inicioMes).reduce((s, t) => s + t.valor, 0)
    const trMesIn = transferencias.filter(t => t.conta_destino_id === contaId && t.data_transferencia >= inicioMes && t.data_transferencia <= fimMes).reduce((s, t) => s + t.valor, 0)
    const trMesOut = transferencias.filter(t => t.conta_origem_id === contaId && t.data_transferencia >= inicioMes && t.data_transferencia <= fimMes).reduce((s, t) => s + t.valor, 0)

    const saldoInicial = (saldoInicialConta || 0) + somaTipo(antes, 'receita') - somaTipo(antes, 'custo') + trAntesIn - trAntesOut
    const entradas = somaTipo(noMes, 'receita')
    const saidas = somaTipo(noMes, 'custo')
    const transf = trMesIn - trMesOut
    const saldoFinal = saldoInicial + entradas - saidas + transf
    return { saldoInicial, entradas, saidas, transf, saldoFinal }
  }

  // Consolidado (todas as caixas; transferências internas se anulam)
  const reaisTodos = lancamentos.filter(l => l.status === 'realizado')
  const antesTodos = reaisTodos.filter(l => dataEf(l) < inicioMes)
  const noMesTodos = reaisTodos.filter(l => { const d = dataEf(l); return d >= inicioMes && d <= fimMes })
  const saldoInicialTotal = contas.reduce((s, c) => s + (c.saldo_inicial || 0), 0) + somaTipo(antesTodos, 'receita') - somaTipo(antesTodos, 'custo')
  const entradasTotal = somaTipo(noMesTodos, 'receita')
  const saidasTotal = somaTipo(noMesTodos, 'custo')
  const saldoFinalTotal = saldoInicialTotal + entradasTotal - saidasTotal

  // Projeção: previstos do mês por vencimento (inclui os sem caixa, ex: turmas)
  const previstosMes = lancamentos.filter(l => l.status === 'previsto' && l.data_vencimento >= inicioMes && l.data_vencimento <= fimMes)
  const entradasPrev = somaTipo(previstosMes, 'receita')
  const saidasPrev = somaTipo(previstosMes, 'custo')
  const saldoProjetado = saldoFinalTotal + entradasPrev - saidasPrev

  // ---- série dos últimos 12 meses (entradas, saídas, saldo acumulado) ----
  const saldoIniContas = contas.reduce((s, c) => s + (c.saldo_inicial || 0), 0)
  const [yBase, mBase] = mes.split('-').map(Number)
  const serie12 = Array.from({ length: 12 }, (_, idx) => {
    const i = 11 - idx
    const d = new Date(yBase, mBase - 1 - i, 1)
    const mm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const ini = mm + '-01', fim = `${mm}-${String(ultimoDiaDoMes(mm)).padStart(2, '0')}`
    const noMes = reaisTodos.filter(l => { const x = dataEf(l); return x >= ini && x <= fim })
    const ate = reaisTodos.filter(l => dataEf(l) <= fim)
    return {
      mes: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`,
      entradas: Math.round(somaTipo(noMes, 'receita')),
      saidas: Math.round(somaTipo(noMes, 'custo')),
      saldo: Math.round(saldoIniContas + somaTipo(ate, 'receita') - somaTipo(ate, 'custo')),
    }
  })
  const tipProps = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }, itemStyle: { color: 'var(--text)' }, labelStyle: { color: 'var(--text-faint)' } }
  const kfmt = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`

  // Resumo exibido (consolidado ou caixa filtrada)
  const contaSel = filtroConta ? contas.find(c => c.id === filtroConta) : null
  const resumo = contaSel ? calcCaixa(contaSel.id, contaSel.saldo_inicial) : { saldoInicial: saldoInicialTotal, entradas: entradasTotal, saidas: saidasTotal, transf: 0, saldoFinal: saldoFinalTotal }

  // Extrato do mês (realizados) com saldo correndo
  const movimentos = lancamentos
    .filter(l => l.status === 'realizado' && (!filtroConta || l.conta_id === filtroConta))
    .filter(l => { const d = dataEf(l); return d >= inicioMes && d <= fimMes })
    .sort((a, b) => dataEf(a).localeCompare(dataEf(b)))
  let saldoCorrente = resumo.saldoInicial
  const extrato = movimentos.map(l => {
    saldoCorrente += l.tipo === 'receita' ? l.valor : -l.valor
    return { ...l, saldo: saldoCorrente }
  })

  function mudarMes(delta: number) {
    const [y, m] = mes.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const tituloMes = new Date(inicioMes + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  // naturezas dinâmicas (tabela) com fallback pras fixas antigas
  const natMap: Record<string, string> = { ...categoriaNome, ...Object.fromEntries(naturezas.map(n => [n.chave, n.nome])) }
  const cats = naturezas.length ? naturezas.filter(n => n.ativo) : Object.entries(categoriaNome).map(([chave, nome]) => ({ chave, nome, ativo: true }))

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>Fluxo de caixa</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '4px' }}>Entradas, saídas e saldo do mês — dinheiro real</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/dashboard/financeiro" style={{ ...btnSecondary, textDecoration: 'none' }}>Financeiro</Link>
          <Link href="/dashboard/financeiro/caixas" style={{ ...btnSecondary, textDecoration: 'none' }}>Caixas</Link>
          <Link href="/dashboard/financeiro/naturezas" style={{ ...btnSecondary, textDecoration: 'none' }}>Naturezas</Link>
          <button onClick={() => setNovo(!novo)} style={btnPrimary}>{novo ? 'Fechar' : '+ Lançar'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => mudarMes(-1)} style={btnSecondary}>←</button>
        <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', minWidth: '160px', textAlign: 'center', textTransform: 'capitalize' }}>{tituloMes}</span>
        <button onClick={() => mudarMes(1)} style={btnSecondary}>→</button>
        <select value={filtroConta} onChange={e => setFiltroConta(e.target.value)} style={{ ...select, width: 'auto', marginLeft: '8px' }}>
          <option value="">Consolidado (todas as caixas)</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      {novo && (
        <form onSubmit={salvar} style={{ ...card, padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <select value={fTipo} onChange={e => setFTipo(e.target.value as any)} style={select}>
              <option value="receita">Entrada</option>
              <option value="custo">Saída</option>
            </select>
            <input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Descrição" required style={input} />
            <input value={fValor} onChange={e => setFValor(e.target.value)} placeholder="Valor R$" type="number" step="0.01" required style={input} />
            <input value={fData} onChange={e => setFData(e.target.value)} type="date" required style={input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <select value={fConta} onChange={e => setFConta(e.target.value)} required style={select}>
              <option value="">Caixa *</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={fCategoria} onChange={e => setFCategoria(e.target.value)} style={select}>
              {cats.map(n => <option key={n.chave} value={n.chave}>{n.nome}</option>)}
            </select>
            <select value={fStatus} onChange={e => setFStatus(e.target.value as any)} style={select}>
              <option value="realizado">Já caiu (realizado)</option>
              <option value="previsto">Previsto</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
            {msg && <span style={{ fontSize: '13px', color: msg.includes('Erro') ? 'var(--red)' : 'var(--green)', marginRight: 'auto' }}>{msg}</span>}
            <button type="button" onClick={() => setNovo(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Salvando...' : 'Lançar'}</button>
          </div>
        </form>
      )}

      {carregando ? (
        <p style={{ fontSize: '13px', color: 'var(--text-faint)' }}>Carregando...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Saldo inicial do mês</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: resumo.saldoInicial >= 0 ? 'var(--text)' : 'var(--red)' }}>{fmt(resumo.saldoInicial)}</div>
            </div>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Entradas</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--green)' }}>{fmt(resumo.entradas)}</div>
              {entradasPrev > 0 && !filtroConta && <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>previstas: {fmt(entradasPrev)}</div>}
            </div>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Saídas</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--red)' }}>{fmt(resumo.saidas)}</div>
              {saidasPrev > 0 && !filtroConta && <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>previstas: {fmt(saidasPrev)}</div>}
            </div>
            <div style={{ ...card, padding: '20px', borderColor: 'var(--accent)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Saldo final do mês</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: resumo.saldoFinal >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(resumo.saldoFinal)}</div>
              {!filtroConta && <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>projetado (c/ previstos): {fmt(saldoProjetado)}</div>}
            </div>
          </div>

          {/* Panorama 12 meses */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Entradas × Saídas — 12 meses</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serie12} margin={{ left: -6, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={44} tickFormatter={kfmt} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} {...tipProps} formatter={(v: any) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="entradas" name="Entradas" fill="#34d399" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="saidas" name="Saídas" fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Saldo acumulado — 12 meses</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={serie12} margin={{ left: -6, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSaldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={44} tickFormatter={kfmt} />
                  <Tooltip {...tipProps} formatter={(v: any) => fmt(v)} />
                  <Area type="monotone" dataKey="saldo" name="Saldo" stroke="#a78bfa" strokeWidth={2.5} fill="url(#gSaldo)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {!filtroConta && (
            <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Por caixa</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Caixa', 'Saldo inicial', 'Entradas', 'Saídas', 'Transf.', 'Saldo final'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 20px', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contas.map(c => {
                    const r = calcCaixa(c.id, c.saldo_inicial)
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: 'var(--text)' }}>{c.nome}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'right' }}>{fmt(r.saldoInicial)}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: 'var(--green)', textAlign: 'right' }}>{fmt(r.entradas)}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(r.saidas)}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: r.transf >= 0 ? 'var(--text-muted)' : 'var(--red)', textAlign: 'right' }}>{r.transf !== 0 ? fmt(r.transf) : '—'}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '600', color: r.saldoFinal >= 0 ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>{fmt(r.saldoFinal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>
              Extrato do mês {contaSel ? `· ${contaSel.nome}` : '· consolidado'} ({extrato.length})
            </div>
            {extrato.length === 0 ? (
              <p style={{ padding: '20px', fontSize: '13px', color: 'var(--text-faint)' }}>Nenhum movimento realizado neste mês.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Data', 'Descrição', 'Categoria', 'Entrada', 'Saída', 'Saldo'].map((h, i) => (
                      <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', padding: '10px 20px', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {extrato.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(dataEf(l) + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '10px 20px', fontSize: '13px', color: 'var(--text)' }}>{l.descricao}</td>
                      <td style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>{natMap[l.categoria] || l.categoria}</td>
                      <td style={{ padding: '10px 20px', fontSize: '13px', color: 'var(--green)', textAlign: 'right' }}>{l.tipo === 'receita' ? fmt(l.valor) : ''}</td>
                      <td style={{ padding: '10px 20px', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{l.tipo === 'custo' ? fmt(l.valor) : ''}</td>
                      <td style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '600', color: l.saldo >= 0 ? 'var(--text-2)' : 'var(--red)', textAlign: 'right' }}>{fmt(l.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}