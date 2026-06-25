'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Conta = {
  id: string
  nome: string
  tipo: 'dinheiro' | 'banco' | 'checkout' | 'cartao_credito'
  unidade: 'lajeado' | 'porto_alegre' | 'geral'
  saldo_inicial: number
  ativo: boolean
  observacoes: string
  saldo_atual?: number
  total_entradas?: number
  total_saidas?: number
}

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const sel = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

const TIPOS_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  dinheiro: { label: 'Dinheiro', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  banco: { label: 'Banco', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  checkout: { label: 'Checkout', cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  cartao_credito: { label: 'Cartão crédito', cor: 'var(--red)', bg: 'var(--red-bg)' },
}

const UNIDADES_LABEL: Record<string, string> = {
  lajeado: 'Lajeado', porto_alegre: 'Porto Alegre', geral: 'Geral',
}

export default function Caixas() {
  const [contas, setContas] = useState<Conta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novaConta, setNovaConta] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [transferencia, setTransferencia] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const [form, setForm] = useState({
    nome: '', tipo: 'dinheiro' as Conta['tipo'], unidade: 'geral' as Conta['unidade'],
    saldo_inicial: '0', observacoes: '',
  })

  const [transfOrigem, setTransfOrigem] = useState('')
  const [transfDestino, setTransfDestino] = useState('')
  const [transfValor, setTransfValor] = useState('')
  const [transfData, setTransfData] = useState(new Date().toISOString().split('T')[0])
  const [transfDesc, setTransfDesc] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data: contasData } = await supabase.from('contas_financeiras')
      .select('*').order('unidade').order('nome')
    
    if (!contasData) { setContas([]); setCarregando(false); return }

    const { data: lancamentos } = await supabase.from('lancamentos_empresa')
      .select('conta_id, tipo, valor, status')
      .not('conta_id', 'is', null)
      .eq('status', 'realizado')

    const { data: transfsOrigem } = await supabase.from('transferencias_caixa')
      .select('conta_origem_id, valor')

    const { data: transfsDestino } = await supabase.from('transferencias_caixa')
      .select('conta_destino_id, valor')

    const contasComSaldo = contasData.map(c => {
      const entradas = (lancamentos || [])
        .filter(l => l.conta_id === c.id && l.tipo === 'receita')
        .reduce((s, l) => s + (l.valor || 0), 0)
      
      const saidas = (lancamentos || [])
        .filter(l => l.conta_id === c.id && l.tipo === 'custo')
        .reduce((s, l) => s + (l.valor || 0), 0)

      const transfSaida = (transfsOrigem || [])
        .filter(t => t.conta_origem_id === c.id)
        .reduce((s, t) => s + (t.valor || 0), 0)

      const transfEntrada = (transfsDestino || [])
        .filter(t => t.conta_destino_id === c.id)
        .reduce((s, t) => s + (t.valor || 0), 0)

      const saldo_atual = (c.saldo_inicial || 0) + entradas - saidas + transfEntrada - transfSaida

      return {
        ...c,
        saldo_atual,
        total_entradas: entradas + transfEntrada,
        total_saidas: saidas + transfSaida,
      }
    })

    setContas(contasComSaldo)
    setCarregando(false)
  }

  async function salvarConta() {
    if (!form.nome) { setMensagem('Nome é obrigatório.'); return }
    setMensagem('')

    if (editando) {
      const { error } = await supabase.from('contas_financeiras').update({
        nome: form.nome, tipo: form.tipo, unidade: form.unidade,
        saldo_inicial: parseFloat(form.saldo_inicial) || 0,
        observacoes: form.observacoes || null,
        atualizado_em: new Date().toISOString(),
      }).eq('id', editando)
      if (error) { setMensagem('Erro ao atualizar caixa: ' + error.message); return }
      setMensagem('Conta atualizada!')
    } else {
      const { error } = await supabase.from('contas_financeiras').insert({
        nome: form.nome, tipo: form.tipo, unidade: form.unidade,
        saldo_inicial: parseFloat(form.saldo_inicial) || 0,
        observacoes: form.observacoes || null,
        ativo: true,
      })
      if (error) { setMensagem('Erro ao criar caixa: ' + error.message); return }
      setMensagem('Conta criada!')
    }
    limparForm()
    carregar()
  }

  function abrirEdicao(c: Conta) {
    setForm({
      nome: c.nome, tipo: c.tipo, unidade: c.unidade,
      saldo_inicial: c.saldo_inicial?.toString() || '0',
      observacoes: c.observacoes || '',
    })
    setEditando(c.id); setNovaConta(true)
  }

  function limparForm() {
    setForm({ nome: '', tipo: 'dinheiro', unidade: 'geral', saldo_inicial: '0', observacoes: '' })
    setEditando(null); setNovaConta(false)
  }

  async function alternarAtivo(c: Conta) {
    await supabase.from('contas_financeiras').update({ ativo: !c.ativo }).eq('id', c.id)
    carregar()
  }

  async function fazerTransferencia() {
    if (!transfOrigem || !transfDestino || !transfValor) { setMensagem('Preencha todos os campos da transferência.'); return }
    if (transfOrigem === transfDestino) { setMensagem('Origem e destino devem ser diferentes.'); return }
    setMensagem('')

    const { error } = await supabase.from('transferencias_caixa').insert({
      conta_origem_id: transfOrigem,
      conta_destino_id: transfDestino,
      valor: parseFloat(transfValor),
      data_transferencia: transfData,
      descricao: transfDesc || null,
    })

    if (error) { setMensagem('Erro: ' + error.message); return }

    setMensagem('Transferência registrada!')
    setTransfOrigem(''); setTransfDestino(''); setTransfValor(''); setTransfDesc('')
    setTransferencia(false)
    carregar()
  }

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  const contasPorUnidade = contas.reduce((acc, c) => {
    if (!acc[c.unidade]) acc[c.unidade] = []
    acc[c.unidade].push(c)
    return acc
  }, {} as Record<string, Conta[]>)

  const saldoTotal = contas.filter(c => c.ativo).reduce((s, c) => s + (c.saldo_atual || 0), 0)
  const totalEntradas = contas.reduce((s, c) => s + (c.total_entradas || 0), 0)
  const totalSaidas = contas.reduce((s, c) => s + (c.total_saidas || 0), 0)

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Caixas e Contas</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Dinheiro, banco, checkout e cartões</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setTransferencia(!transferencia)} style={btnSecondary}>⇄ Transferência</button>
            <button onClick={() => { limparForm(); setNovaConta(!novaConta) }} style={btnPrimary}>+ Nova caixa</button>
            <Link href="/dashboard/financeiro" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>← Financeiro</Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Saldo total (ativas)</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: saldoTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(saldoTotal)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total entradas</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{fmt(totalEntradas)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total saídas</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)' }}>{fmt(totalSaidas)}</div>
          </div>
        </div>

        {transferencia && (
          <div style={{ ...card, padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16, marginTop: 0 }}>Nova transferência entre caixas</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>De (origem)</label>
                <select style={{ ...sel, width: '100%' }} value={transfOrigem} onChange={e => setTransfOrigem(e.target.value)}>
                  <option value="">Selecione</option>
                  {contas.filter(c => c.ativo).map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({fmt(c.saldo_atual || 0)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Para (destino)</label>
                <select style={{ ...sel, width: '100%' }} value={transfDestino} onChange={e => setTransfDestino(e.target.value)}>
                  <option value="">Selecione</option>
                  {contas.filter(c => c.ativo && c.id !== transfOrigem).map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Valor R$</label>
                <input type="number" step="0.01" style={inp} value={transfValor} onChange={e => setTransfValor(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Data</label>
                <input type="date" style={inp} value={transfData} onChange={e => setTransfData(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Descrição</label>
                <input style={inp} placeholder="Ex: Saque Hotmart para banco" value={transfDesc} onChange={e => setTransfDesc(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setTransferencia(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={fazerTransferencia} style={btnPrimary}>Registrar transferência</button>
            </div>
          </div>
        )}

        {novaConta && (
          <div style={{ ...card, padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16, marginTop: 0 }}>
              {editando ? 'Editar caixa' : 'Nova caixa'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Nome *</label>
                <input style={inp} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Caixinha sala Lajeado" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Tipo</label>
                <select style={{ ...sel, width: '100%' }} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="banco">Banco</option>
                  <option value="checkout">Checkout</option>
                  <option value="cartao_credito">Cartão crédito</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Unidade</label>
                <select style={{ ...sel, width: '100%' }} value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value as any }))}>
                  <option value="geral">Geral</option>
                  <option value="lajeado">Lajeado</option>
                  <option value="porto_alegre">Porto Alegre</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Saldo inicial R$</label>
                <input type="number" step="0.01" style={inp} value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Observações</label>
                <input style={inp} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={limparForm} style={btnSecondary}>Cancelar</button>
              <button onClick={salvarConta} style={btnPrimary}>{editando ? 'Atualizar' : 'Criar caixa'}</button>
            </div>
          </div>
        )}

        {mensagem && (
          <div style={{ padding: 12, marginBottom: 16, background: mensagem.includes('Erro') ? 'var(--red-bg)' : 'var(--green-bg)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green)', margin: 0 }}>{mensagem}</p>
          </div>
        )}

        {carregando ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {Object.entries(contasPorUnidade).map(([unidade, contasUnidade]) => (
              <div key={unidade}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 600 }}>
                  {UNIDADES_LABEL[unidade]}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {contasUnidade.map(c => {
                    const tipo = TIPOS_LABEL[c.tipo]
                    return (
                      <div key={c.id} style={{ ...card, padding: 18, opacity: c.ativo ? 1 : 0.5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.nome}</div>
                            <div style={{ marginTop: 4 }}>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: tipo.bg, color: tipo.cor, textTransform: 'uppercase', fontWeight: 600 }}>
                                {tipo.label}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button onClick={() => abrirEdicao(c)} style={{ background: 'none', border: 'none', color: 'var(--accent-soft)', fontSize: 11, cursor: 'pointer', padding: 2 }}>Editar</button>
                            <button onClick={() => alternarAtivo(c)} style={{ background: 'none', border: 'none', color: c.ativo ? 'var(--red)' : 'var(--green)', fontSize: 11, cursor: 'pointer', padding: 2 }}>
                              {c.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Saldo atual</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: (c.saldo_atual || 0) >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
                            {fmt(c.saldo_atual || 0)}
                          </div>
                          {(c.saldo_inicial || 0) !== 0 && (
                            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                              Inicial: {fmt(c.saldo_inicial)}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11 }}>
                          <div>
                            <span style={{ color: 'var(--text-faint)' }}>↑ </span>
                            <span style={{ color: 'var(--green)' }}>{fmt(c.total_entradas || 0)}</span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-faint)' }}>↓ </span>
                            <span style={{ color: 'var(--red)' }}>{fmt(c.total_saidas || 0)}</span>
                          </div>
                        </div>

                        {c.observacoes && (
                          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                            {c.observacoes}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}