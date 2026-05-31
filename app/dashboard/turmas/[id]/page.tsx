'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Turma = {
  id: string
  data_inicio: string
  data_fim: string
  status: string
  preco_venda: number
  vagas: number
  meta_matriculas: number
  codigo: string
  tipo_localidade: string
  produtos: { nome: string; duracao_dias: number }
  cidades: { nome: string }
  salas: { nome: string }
}

type Matricula = {
  id: string
  status: string
  valor_pago: number
  data_compra: string
  forma_pagamento: string
  alunos: { id: string; nome: string; whatsapp: string; email: string }
}

type Aluno = { id: string; nome: string; whatsapp: string; email: string }

export default function DetalheTurma() {
  const params = useParams()
  const id = params.id as string

  const [turma, setTurma] = useState<Turma | null>(null)
  const [matriculas, setMatriculas] = useState<Matricula[]>([])
  const [financeiro, setFinanceiro] = useState<any>(null)
  const [datas, setDatas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novaVenda, setNovaVenda] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [aba, setAba] = useState<'matriculas' | 'financeiro' | 'datas'>('matriculas')

  // Form nova venda
  const [buscaAluno, setBuscaAluno] = useState('')
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null)
  const [resultadosBusca, setResultadosBusca] = useState<Aluno[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [novoWhatsapp, setNovoWhatsapp] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [modoAluno, setModoAluno] = useState<'buscar' | 'novo'>('buscar')
  const [valor, setValor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('pix')
  const [dataVenda, setDataVenda] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    if (id) carregarTudo()
  }, [id])

  useEffect(() => {
    if (turma) setValor(turma.preco_venda.toString())
  }, [turma])

  useEffect(() => {
    if (buscaAluno.length >= 2) buscarAlunos()
    else setResultadosBusca([])
  }, [buscaAluno])

  async function carregarTudo() {
    setCarregando(true)
    await Promise.all([carregarTurma(), carregarMatriculas(), carregarFinanceiro(), carregarDatas()])
    setCarregando(false)
  }

  async function carregarTurma() {
    const { data } = await supabase
      .from('turmas')
      .select('*, produtos(nome, duracao_dias), cidades(nome), salas(nome)')
      .eq('id', id)
      .single()
    if (data) setTurma(data)
  }

  async function carregarMatriculas() {
    const { data } = await supabase
      .from('matriculas')
      .select('*, alunos(id, nome, whatsapp, email)')
      .eq('turma_id', id)
      .order('data_compra', { ascending: false })
    if (data) setMatriculas(data)
  }

  async function carregarFinanceiro() {
    const { data } = await supabase
      .from('financeiro_turma')
      .select('*')
      .eq('turma_id', id)
      .single()
    if (data) setFinanceiro(data)
  }

  async function carregarDatas() {
    const { data } = await supabase
      .from('turma_datas')
      .select('*')
      .eq('turma_id', id)
      .order('ordem')
    if (data) setDatas(data)
  }

  async function buscarAlunos() {
    const { data } = await supabase
      .from('alunos')
      .select('id, nome, whatsapp, email')
      .ilike('nome', `%${buscaAluno}%`)
      .limit(5)
    if (data) setResultadosBusca(data)
  }

  async function salvarVenda(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    let alunoId = alunoSelecionado?.id

    if (modoAluno === 'novo') {
      const { data: novoAluno, error } = await supabase
        .from('alunos')
        .insert({ nome: novoNome, whatsapp: novoWhatsapp, email: novoEmail })
        .select()
        .single()
      if (error || !novoAluno) {
        setMensagem('Erro ao criar aluno: ' + error?.message)
        setSalvando(false)
        return
      }
      alunoId = novoAluno.id
    }

    if (!alunoId) {
      setMensagem('Selecione ou cadastre um aluno.')
      setSalvando(false)
      return
    }

    const { error: errMat } = await supabase.from('matriculas').insert({
      aluno_id: alunoId,
      turma_id: id,
      valor_pago: parseFloat(valor),
      data_compra: dataVenda,
      forma_pagamento: formaPagamento,
      status: 'ativa',
    })

    if (errMat) {
      setMensagem('Erro ao registrar venda: ' + errMat.message)
      setSalvando(false)
      return
    }

    // Atualizar LTV do aluno
    const { data: alunoAtual } = await supabase
      .from('alunos').select('ltv').eq('id', alunoId).single()
    await supabase.from('alunos').update({
      ltv: (alunoAtual?.ltv || 0) + parseFloat(valor)
    }).eq('id', alunoId)

    // Atualizar receita realizada
    if (financeiro) {
      const novaReceita = (financeiro.receita_realizada || 0) + parseFloat(valor)
      await supabase.from('financeiro_turma').update({
        receita_realizada: novaReceita,
        margem_realizada: novaReceita - (financeiro.custo_professores || 0) - (financeiro.custo_sala || 0) - (financeiro.custo_deslocamento || 0) - (financeiro.custo_trafego_previsto || 0) - (financeiro.imposto_previsto || 0),
        atualizado_em: new Date().toISOString(),
      }).eq('turma_id', id)
    }

    // Lançamento financeiro
    await supabase.from('lancamentos_financeiros').insert({
      turma_id: id,
      tipo: 'receita',
      categoria: 'matricula',
      descricao: `Matrícula manual — ${formaPagamento}`,
      valor: parseFloat(valor),
      data_prevista: dataVenda,
      data_realizada: dataVenda,
      status: 'realizado',
    })

    setMensagem('Venda registrada com sucesso!')
    setNovaVenda(false)
    setAlunoSelecionado(null)
    setBuscaAluno('')
    setNovoNome(''); setNovoWhatsapp(''); setNovoEmail('')
    setModoAluno('buscar')
    carregarTudo()
    setSalvando(false)
  }

  async function atualizarStatus(novoStatus: string) {
    await supabase.from('turmas').update({ status: novoStatus }).eq('id', id)
    carregarTurma()
  }

  function fmt(v: number) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const statusCor: Record<string, string> = {
    planejada: 'bg-gray-100 text-gray-600',
    em_vendas: 'bg-blue-50 text-blue-700',
    confirmada: 'bg-green-50 text-green-700',
    realizada: 'bg-purple-50 text-purple-700',
    cancelada: 'bg-red-50 text-red-600',
  }

  const progresso = turma ? Math.min((matriculas.length / turma.meta_matriculas) * 100, 100) : 0
  const breakEvenAtingido = turma ? matriculas.length >= turma.meta_matriculas : false

  if (carregando) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Carregando...</p>
    </div>
  )

  if (!turma) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Turma não encontrada.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/turmas" className="text-gray-400 hover:text-gray-600 text-sm">← Turmas</Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{turma.produtos?.nome}</h1>
            <p className="text-xs text-gray-400">
              {turma.cidades?.nome} · {new Date(turma.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')} a {new Date(turma.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={turma.status} onChange={e => atualizarStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="planejada">Planejada</option>
            <option value="em_vendas">Em vendas</option>
            <option value="confirmada">Confirmada</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <span className={`text-xs px-2 py-1 rounded-full ${statusCor[turma.status]}`}>
            {turma.status.replace('_', ' ')}
          </span>
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto">

        {/* Cards resumo */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-2xl font-semibold text-gray-900">{matriculas.length}</div>
            <div className="text-xs text-gray-400 mt-1">Matrículas</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${breakEvenAtingido ? 'bg-green-500' : 'bg-blue-400'}`}
                  style={{ width: `${progresso}%` }} />
              </div>
              <span className="text-xs text-gray-400">{turma.meta_matriculas} meta</span>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-2xl font-semibold text-gray-900">{turma.vagas - matriculas.length}</div>
            <div className="text-xs text-gray-400 mt-1">Vagas restantes</div>
            <div className="text-xs text-gray-400 mt-1">de {turma.vagas} total</div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <div className="text-xl font-semibold text-green-700">{fmt(financeiro?.receita_realizada || 0)}</div>
            <div className="text-xs text-green-500 mt-1">Receita realizada</div>
            <div className="text-xs text-gray-400 mt-1">Prevista: {fmt(financeiro?.receita_prevista || 0)}</div>
          </div>
          <div className={`border rounded-xl p-4 ${(financeiro?.margem_prevista || 0) >= 0 ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100'}`}>
            <div className={`text-xl font-semibold ${(financeiro?.margem_prevista || 0) >= 0 ? 'text-gray-900' : 'text-red-700'}`}>
              {fmt(financeiro?.margem_prevista || 0)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Margem prevista</div>
            <div className="text-xs text-gray-400 mt-1">Break-even: {turma.meta_matriculas} matrículas</div>
          </div>
        </div>

        {/* Abas */}
        <div className="bg-white border-b border-gray-100 rounded-t-xl px-6 flex gap-1">
          {[
            { id: 'matriculas', label: `Matrículas (${matriculas.length})` },
            { id: 'financeiro', label: 'Financeiro' },
            { id: 'datas', label: `Datas (${datas.length})` },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${aba === a.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {a.label}
            </button>
          ))}
        </div>

        <div className="bg-white border border-t-0 border-gray-100 rounded-b-xl">

          {/* ABA MATRÍCULAS */}
          {aba === 'matriculas' && (
            <div>
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <span className="text-sm text-gray-500">{matriculas.length} aluno{matriculas.length !== 1 ? 's' : ''} matriculado{matriculas.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setNovaVenda(!novaVenda)}
                  className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">
                  + Nova venda
                </button>
              </div>

              {novaVenda && (
                <div className="px-6 py-4 border-b border-gray-100 bg-blue-50">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Registrar nova venda</h3>
                  <form onSubmit={salvarVenda} className="space-y-4">

                    <div className="flex gap-2 mb-2">
                      <button type="button" onClick={() => setModoAluno('buscar')}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${modoAluno === 'buscar' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                        Aluno existente
                      </button>
                      <button type="button" onClick={() => setModoAluno('novo')}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${modoAluno === 'novo' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                        Novo aluno
                      </button>
                    </div>

                    {modoAluno === 'buscar' ? (
                      <div className="relative">
                        <input value={buscaAluno} onChange={e => setBuscaAluno(e.target.value)}
                          placeholder="Buscar aluno pelo nome..."
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                        {resultadosBusca.length > 0 && !alunoSelecionado && (
                          <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-sm">
                            {resultadosBusca.map(a => (
                              <div key={a.id}
                                onClick={() => { setAlunoSelecionado(a); setBuscaAluno(a.nome); setResultadosBusca([]) }}
                                className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                                <span className="font-medium">{a.nome}</span>
                                {a.whatsapp && <span className="text-gray-400 ml-2">{a.whatsapp}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {alunoSelecionado && (
                          <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                            <span className="text-sm text-green-700 font-medium">{alunoSelecionado.nome}</span>
                            <button type="button" onClick={() => { setAlunoSelecionado(null); setBuscaAluno('') }}
                              className="text-xs text-gray-400 hover:text-gray-600 ml-auto">× trocar</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                          placeholder="Nome completo *" required
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                        <div className="flex gap-2">
                          <input value={novoWhatsapp} onChange={e => setNovoWhatsapp(e.target.value)}
                            placeholder="WhatsApp"
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                          <input value={novoEmail} onChange={e => setNovoEmail(e.target.value)}
                            placeholder="E-mail" type="email"
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Valor R$</label>
                        <input value={valor} onChange={e => setValor(e.target.value)}
                          type="number" required
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Forma de pagamento</label>
                        <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="pix">PIX</option>
                          <option value="cartao">Cartão</option>
                          <option value="boleto">Boleto</option>
                          <option value="transferencia">Transferência</option>
                          <option value="dinheiro">Dinheiro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Data da venda</label>
                        <input value={dataVenda} onChange={e => setDataVenda(e.target.value)}
                          type="date" required
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => setNovaVenda(false)}
                        className="text-gray-500 text-sm px-4 py-2 hover:text-gray-700">Cancelar</button>
                      <button type="submit" disabled={salvando}
                        className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {salvando ? 'Registrando...' : 'Registrar venda'}
                      </button>
                    </div>
                    {mensagem && (
                      <p className={`text-sm ${mensagem.includes('Erro') ? 'text-red-500' : 'text-green-600'}`}>{mensagem}</p>
                    )}
                  </form>
                </div>
              )}

              {matriculas.length === 0 ? (
                <p className="text-sm text-gray-400 p-6">Nenhuma matrícula ainda. Clique em "+ Nova venda" para registrar.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-50">
                      <th className="text-left px-6 py-3">Aluno</th>
                      <th className="text-left px-6 py-3">Contato</th>
                      <th className="text-left px-6 py-3">Data</th>
                      <th className="text-left px-6 py-3">Valor</th>
                      <th className="text-left px-6 py-3">Pagamento</th>
                      <th className="text-left px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matriculas.map(m => (
                      <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{m.alunos?.nome}</td>
                        <td className="px-6 py-3 text-sm text-gray-500">
                          {m.alunos?.whatsapp && (
                            <a href={`https://wa.me/55${m.alunos.whatsapp.replace(/\D/g, '')}`}
                              target="_blank" rel="noreferrer"
                              className="text-green-600 hover:text-green-800 text-xs">
                              📱 {m.alunos.whatsapp}
                            </a>
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-500">
                          {new Date(m.data_compra).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-3 text-sm font-medium text-green-700">{fmt(m.valor_pago)}</td>
                        <td className="px-6 py-3 text-sm text-gray-500 capitalize">{m.forma_pagamento}</td>
                        <td className="px-6 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            m.status === 'ativa' ? 'bg-blue-50 text-blue-700' :
                            m.status === 'concluida' ? 'bg-green-50 text-green-700' :
                            'bg-red-50 text-red-600'
                          }`}>{m.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ABA FINANCEIRO */}
          {aba === 'financeiro' && financeiro && (
            <div className="p-6 max-w-md">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Receita prevista</span>
                  <span className="font-medium">{fmt(financeiro.receita_prevista)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Receita realizada</span>
                  <span className="font-medium text-green-700">{fmt(financeiro.receita_realizada)}</span>
                </div>
                <div className="border-t border-gray-100 pt-2 mt-2">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Custos previstos</div>
                  {[
                    { label: 'Professores', val: financeiro.custo_professores },
                    { label: 'Sala', val: financeiro.custo_sala },
                    { label: 'Deslocamento', val: financeiro.custo_deslocamento },
                    { label: 'Tráfego (10%)', val: financeiro.custo_trafego_previsto },
                    { label: 'Imposto (8%)', val: financeiro.imposto_previsto },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between py-1">
                      <span className="text-gray-500">(-) {item.label}</span>
                      <span className="text-red-600">{fmt(item.val)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-semibold">
                  <span className="text-gray-700">Margem prevista</span>
                  <span className={financeiro.margem_prevista >= 0 ? 'text-green-700' : 'text-red-600'}>
                    {fmt(financeiro.margem_prevista)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Break-even</span>
                  <span>{financeiro.break_even_matriculas} matrículas ({matriculas.length} realizadas)</span>
                </div>
              </div>
            </div>
          )}

          {/* ABA DATAS */}
          {aba === 'datas' && (
            <div className="p-6">
              {datas.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma data cadastrada.</p>
              ) : (
                <div className="space-y-2">
                  {datas.map((d) => (
                    <div key={d.id} className="flex items-center gap-4 border border-gray-100 rounded-lg px-4 py-3">
                      <span className="text-xs text-gray-400 w-12">Dia {d.ordem}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                      </span>
                      <span className="text-sm text-gray-500">{d.horario_inicio} às {d.horario_fim}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}