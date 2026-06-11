'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Conta = { id: string; nome: string; tipo: string; unidade: string; saldo_inicial: number; ativo: boolean }
type Lanc = { id: string; tipo: string; categoria: string; descricao: string; valor: number; status: string; data_vencimento: string; data_pagamento: string | null; conta_id: string | null }
type Transf = { id: string; conta_origem_id: string; conta_destino_id: string; valor: number; data_transferencia: string; descricao: string | null }

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' } as React.CSSProperties
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

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
    const [{ data: c }, { data: l }, { data: t }] = await Promise.all([
      supabase.from('contas_financeiras').select('id, nome, tipo, unidade, saldo_inicial, ativo').eq('ativo', true).order('nome'),
      supabase.from('lancamentos_empresa').select('id, tipo, categoria, descricao, valor, status, data_vencimento, data_pagamento, conta_id'),
      supabase.from('transferencias_caixa').select('id, conta_origem_id, conta_destino_id, valor, data_transferencia, descricao'),
    ])
    setContas(c || [])
    setLancamentos((l || []) as Lanc[])
    setTransferencias((t || []) as Transf[])
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

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff', margin: 0 }}>Fluxo de caixa</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Entradas, saídas e saldo do mês — dinheiro real</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/dashboard/financeiro" style={{ ...btnSecondary, textDecoration: 'none' }}>Financeiro</Link>
          <Link href="/dashboard/financeiro/caixas" style={{ ...btnSecondary, textDecoration: 'none' }}>Caixas</Link>
          <button onClick={() => setNovo(!novo)} style={btnPrimary}>{novo ? 'Fechar' : '+ Lançar'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => mudarMes(-1)} style={btnSecondary}>←</button>
        <span style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', minWidth: '160px', textAlign: 'center', textTransform: 'capitalize' }}>{tituloMes}</span>
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
              <option value="outro">Outro</option>
              <option value="pessoal">Pessoal</option>
              <option value="estrutura">Estrutura</option>
              <option value="sistemas">Sistemas</option>
              <option value="marketing">Marketing</option>
              <option value="imposto">Imposto</option>
            </select>
            <select value={fStatus} onChange={e => setFStatus(e.target.value as any)} style={select}>
              <option value="realizado">Já caiu (realizado)</option>
              <option value="previsto">Previsto</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
            {msg && <span style={{ fontSize: '13px', color: msg.includes('Erro') ? '#f87171' : '#34d399', marginRight: 'auto' }}>{msg}</span>}
            <button type="button" onClick={() => setNovo(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Salvando...' : 'Lançar'}</button>
          </div>
        </form>
      )}

      {carregando ? (
        <p style={{ fontSize: '13px', color: '#6b7280' }}>Carregando...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Saldo inicial do mês</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: resumo.saldoInicial >= 0 ? '#ffffff' : '#f87171' }}>{fmt(resumo.saldoInicial)}</div>
            </div>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Entradas</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#34d399' }}>{fmt(resumo.entradas)}</div>
              {entradasPrev > 0 && !filtroConta && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>previstas: {fmt(entradasPrev)}</div>}
            </div>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Saídas</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#f87171' }}>{fmt(resumo.saidas)}</div>
              {saidasPrev > 0 && !filtroConta && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>previstas: {fmt(saidasPrev)}</div>}
            </div>
            <div style={{ ...card, padding: '20px', borderColor: '#7c3aed' }}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Saldo final do mês</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: resumo.saldoFinal >= 0 ? '#34d399' : '#f87171' }}>{fmt(resumo.saldoFinal)}</div>
              {!filtroConta && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>projetado (c/ previstos): {fmt(saldoProjetado)}</div>}
            </div>
          </div>

          {!filtroConta && (
            <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #3a3a3c', fontSize: '14px', fontWeight: '600', color: '#d1d1d1' }}>Por caixa</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                    {['Caixa', 'Saldo inicial', 'Entradas', 'Saídas', 'Transf.', 'Saldo final'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '10px 20px', fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contas.map(c => {
                    const r = calcCaixa(c.id, c.saldo_inicial)
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: '#ffffff' }}>{c.nome}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: '#9ca3af', textAlign: 'right' }}>{fmt(r.saldoInicial)}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: '#34d399', textAlign: 'right' }}>{fmt(r.entradas)}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: '#f87171', textAlign: 'right' }}>{fmt(r.saidas)}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', color: r.transf >= 0 ? '#9ca3af' : '#f87171', textAlign: 'right' }}>{r.transf !== 0 ? fmt(r.transf) : '—'}</td>
                        <td style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '600', color: r.saldoFinal >= 0 ? '#34d399' : '#f87171', textAlign: 'right' }}>{fmt(r.saldoFinal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #3a3a3c', fontSize: '14px', fontWeight: '600', color: '#d1d1d1' }}>
              Extrato do mês {contaSel ? `· ${contaSel.nome}` : '· consolidado'} ({extrato.length})
            </div>
            {extrato.length === 0 ? (
              <p style={{ padding: '20px', fontSize: '13px', color: '#6b7280' }}>Nenhum movimento realizado neste mês.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                    {['Data', 'Descrição', 'Categoria', 'Entrada', 'Saída', 'Saldo'].map((h, i) => (
                      <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', padding: '10px 20px', fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {extrato.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                      <td style={{ padding: '10px 20px', fontSize: '12px', color: '#9ca3af' }}>{new Date(dataEf(l) + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '10px 20px', fontSize: '13px', color: '#ffffff' }}>{l.descricao}</td>
                      <td style={{ padding: '10px 20px', fontSize: '12px', color: '#9ca3af' }}>{categoriaNome[l.categoria] || l.categoria}</td>
                      <td style={{ padding: '10px 20px', fontSize: '13px', color: '#34d399', textAlign: 'right' }}>{l.tipo === 'receita' ? fmt(l.valor) : ''}</td>
                      <td style={{ padding: '10px 20px', fontSize: '13px', color: '#f87171', textAlign: 'right' }}>{l.tipo === 'custo' ? fmt(l.valor) : ''}</td>
                      <td style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '600', color: l.saldo >= 0 ? '#d1d1d1' : '#f87171', textAlign: 'right' }}>{fmt(l.saldo)}</td>
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