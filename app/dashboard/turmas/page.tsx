'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Turma = {
  id: string
  data_inicio: string
  data_fim: string
  status: string
  preco_venda: number
  vagas: number
  codigo: string
  produtos: { nome: string }
  cidades: { nome: string }
}

type Produto = { id: string; nome: string; duracao_dias: number; preco_venda: number; vagas_padrao: number; meta_matriculas: number }
type Cidade = { id: string; nome: string; tipo: string }
type Sala = { id: string; nome: string; cidade_id: string }
type Modulo = { id: string; nome: string; ordem: number; duracao_dias: number }
type Professor = { id: string; nome: string; diaria_reais: number }

type DiaAula = {
  data: string
  horario_inicio: string
  horario_fim: string
  modulo_id?: string
  modulo_nome?: string
}

export default function Turmas() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [salas, setSalas] = useState<Sala[]>([])
  const [professores, setProfessores] = useState<Professor[]>([])
  const [modulos, setModulos] = useState<Modulo[]>([])
  const [salasFiltradas, setSalasFiltradas] = useState<Sala[]>([])
  const [abrirForm, setAbrirForm] = useState(false)
  const [diasAula, setDiasAula] = useState<DiaAula[]>([])

  const [profPorModulo, setProfPorModulo] = useState<Record<string, string>>({})
  const [professorId, setProfessorId] = useState('')
  const [codigoTurma, setCodigoTurma] = useState('')

  const [produtoId, setProdutoId] = useState('')
  const [cidadeId, setCidadeId] = useState('')
  const [salaId, setSalaId] = useState('')
  const [preco, setPreco] = useState('')
  const [vagas, setVagas] = useState('')
  const [meta, setMeta] = useState('')
  const [deslocProf, setDeslocProf] = useState('0')
  const [deslocEquipe, setDeslocEquipe] = useState('0')
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    carregarTurmas()
    carregarProdutos()
    carregarCidades()
    carregarSalas()
    carregarProfessores()
  }, [])

  useEffect(() => {
    if (cidadeId) {
      setSalasFiltradas(salas.filter(s => s.cidade_id === cidadeId))
      setSalaId('')
    }
  }, [cidadeId, salas])

  useEffect(() => {
    if (produtoId) {
      const p = produtos.find(p => p.id === produtoId)
      if (p) {
        setPreco(p.preco_venda.toString())
        setVagas(p.vagas_padrao.toString())
        setMeta(p.meta_matriculas.toString())
        setProfessorId('')
        setProfPorModulo({})
        carregarModulos(p.id, p.duracao_dias)
      }
    }
  }, [produtoId])

  async function carregarTurmas() {
    const { data } = await supabase
      .from('turmas')
      .select('*, produtos(nome), cidades(nome), salas(nome)')
      .order('data_inicio', { ascending: false })
    if (data) setTurmas(data)
  }

  async function carregarProdutos() {
    const { data } = await supabase.from('produtos').select('*').eq('ativo', true).order('nome')
    if (data) setProdutos(data)
  }

  async function carregarCidades() {
    const { data } = await supabase.from('cidades').select('*').eq('ativo', true).order('nome')
    if (data) setCidades(data)
  }

  async function carregarSalas() {
    const { data } = await supabase.from('salas').select('*').order('nome')
    if (data) setSalas(data)
  }

  async function carregarProfessores() {
    const { data } = await supabase.from('professores').select('*').eq('ativo', true).order('nome')
    if (data) setProfessores(data)
  }

  async function carregarModulos(pid: string, duracaoTotal: number) {
    const { data } = await supabase
      .from('produto_modulos')
      .select('*')
      .eq('produto_id', pid)
      .order('ordem')

    if (data && data.length > 0) {
      setModulos(data)
      const dias: DiaAula[] = []
      data.forEach(mod => {
        for (let i = 0; i < mod.duracao_dias; i++) {
          dias.push({
            data: '',
            horario_inicio: '08:00',
            horario_fim: '18:00',
            modulo_id: mod.id,
            modulo_nome: mod.nome,
          })
        }
      })
      setDiasAula(dias)
    } else {
      setModulos([])
      const dias = Array.from({ length: duracaoTotal }, () => ({
        data: '',
        horario_inicio: '08:00',
        horario_fim: '18:00',
      }))
      setDiasAula(dias)
    }
  }

  function atualizarDia(index: number, campo: keyof DiaAula, valor: string) {
    const novosDias = [...diasAula]
    novosDias[index] = { ...novosDias[index], [campo]: valor }
    setDiasAula(novosDias)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    const produto = produtos.find(p => p.id === produtoId)
    const cidade = cidades.find(c => c.id === cidadeId)
    if (!produto || !cidade) return

    const datasValidas = diasAula.filter(d => d.data)
    const datasOrdenadas = [...datasValidas].sort((a, b) => a.data.localeCompare(b.data))
    const dataInicio = datasOrdenadas[0]?.data
    const dataFim = datasOrdenadas[datasOrdenadas.length - 1]?.data
    const tipoLocalidade = cidade.tipo === 'sede_propria' ? 'sede_propria' : 'cidade_externa'

    const { data: turma, error } = await supabase.from('turmas').insert({
      produto_id: produtoId,
      cidade_id: cidadeId,
      sala_id: salaId,
      data_inicio: dataInicio,
      data_fim: dataFim,
      preco_venda: parseFloat(preco),
      vagas: parseInt(vagas),
      meta_matriculas: parseInt(meta),
      tipo_localidade: tipoLocalidade,
      custo_deslocamento_prof: parseFloat(deslocProf),
      custo_deslocamento_equipe: parseFloat(deslocEquipe),
      status: 'planejada',
      codigo: codigoTurma || null,
    }).select().single()

    if (error || !turma) {
      setMensagem('Erro ao salvar turma: ' + error?.message)
      setSalvando(false)
      return
    }

    if (diasAula.length > 0) {
      await supabase.from('turma_datas').insert(
        diasAula.map((d, i) => ({
          turma_id: turma.id,
          modulo_id: d.modulo_id || null,
          data: d.data,
          horario_inicio: d.horario_inicio,
          horario_fim: d.horario_fim,
          ordem: i + 1,
        }))
      )
    }

    let custoProfessores = 0
    if (modulos.length > 0) {
      for (const mod of modulos) {
        const profId = profPorModulo[mod.id]
        if (profId) {
          const prof = professores.find(p => p.id === profId)
          const valorCalculado = prof ? prof.diaria_reais * mod.duracao_dias : 0
          custoProfessores += valorCalculado
          await supabase.from('turma_professores').insert({
            turma_id: turma.id,
            professor_id: profId,
            modulo_id: mod.id,
            valor_calculado: valorCalculado,
          })
        }
      }
    } else {
      if (professorId) {
        const prof = professores.find(p => p.id === professorId)
        const valorCalculado = prof ? prof.diaria_reais * produto.duracao_dias : 0
        custoProfessores = valorCalculado
        await supabase.from('turma_professores').insert({
          turma_id: turma.id,
          professor_id: professorId,
          valor_calculado: valorCalculado,
        })
      }
    }

    const { data: templates } = await supabase
      .from('produto_tarefas_template')
      .select('*')
      .eq('produto_id', produtoId)
      .order('ordem')

    if (templates && templates.length > 0 && dataInicio) {
      const inicio = new Date(dataInicio + 'T12:00:00')
      const tarefas = templates.map(t => {
        const dataPrazo = new Date(inicio)
        dataPrazo.setDate(dataPrazo.getDate() + t.dias_relativo)
        return {
          turma_id: turma.id,
          titulo: t.titulo,
          setor: t.setor,
          tipo_entrega: t.tipo_entrega,
          tipo: 'prevista' as const,
          data_prazo: dataPrazo.toISOString().split('T')[0],
          status: 'pendente' as const,
          prioridade: 'normal' as const,
        }
      })
      await supabase.from('tarefas').insert(tarefas)
    }

    const receitaPrevista = parseFloat(preco) * parseInt(meta)
    const custoTrafego = receitaPrevista * 0.10
    const imposto = receitaPrevista * 0.08
    const custoDeslocamento = parseFloat(deslocProf) + parseFloat(deslocEquipe)

    await supabase.from('financeiro_turma').insert({
      turma_id: turma.id,
      receita_prevista: receitaPrevista,
      custo_professores: custoProfessores,
      custo_trafego_previsto: custoTrafego,
      imposto_previsto: imposto,
      custo_deslocamento: custoDeslocamento,
      margem_prevista: receitaPrevista - custoProfessores - custoTrafego - imposto - custoDeslocamento,
      break_even_matriculas: parseInt(meta),
    })

    setMensagem('Turma aberta com sucesso!')
    setAbrirForm(false)
    setProdutoId('')
    setCidadeId('')
    setSalaId('')
    setProfessorId('')
    setProfPorModulo({})
    setDiasAula([])
    setModulos([])
    setDeslocProf('0')
    setDeslocEquipe('0')
    setCodigoTurma('')
    carregarTurmas()
    setSalvando(false)
  }

  const statusCor: Record<string, string> = {
    planejada: 'bg-gray-100 text-gray-600',
    em_vendas: 'bg-blue-50 text-blue-700',
    confirmada: 'bg-green-50 text-green-700',
    realizada: 'bg-purple-50 text-purple-700',
    cancelada: 'bg-red-50 text-red-600',
  }

  const cidadeSelecionada = cidades.find(c => c.id === cidadeId)
  const isExterna = cidadeSelecionada?.tipo === 'cidade_externa'
  const produtoSelecionado = produtos.find(p => p.id === produtoId)
  const diasPorModulo = modulos.length > 0
    ? modulos.map(mod => ({
        modulo: mod,
        dias: diasAula.map((d, i) => ({ ...d, index: i })).filter(d => d.modulo_id === mod.id)
      }))
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Painel</Link>
          <h1 className="text-lg font-semibold text-gray-900">Turmas</h1>
        </div>
        <button
          onClick={() => setAbrirForm(!abrirForm)}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          + Abrir turma
        </button>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {abrirForm && (
          <div className="bg-white border border-blue-100 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-medium text-gray-700 mb-4">Nova turma</h2>
            <form onSubmit={handleSalvar} className="space-y-4">

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Código da turma</label>
                <input value={codigoTurma} onChange={e => setCodigoTurma(e.target.value)}
                  placeholder="Ex: reels-lajeado-jul25"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">Identificador único — usado para vincular leads do formulário a esta turma</p>
              </div>

              <div className="flex gap-3">
                <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} required
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecione o produto</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.duracao_dias} dias)</option>)}
                </select>
                <select value={cidadeId} onChange={(e) => setCidadeId(e.target.value)} required
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecione a cidade</option>
                  {cidades.map(c => <option key={c.id} value={c.id}>{c.nome} {c.tipo === 'cidade_externa' ? '(externa)' : ''}</option>)}
                </select>
                <select value={salaId} onChange={(e) => setSalaId(e.target.value)} required
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecione a sala</option>
                  {salasFiltradas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>

              <div className="flex gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Preço de venda R$</label>
                  <input value={preco} onChange={(e) => setPreco(e.target.value)} type="number" required
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vagas disponíveis</label>
                  <input value={vagas} onChange={(e) => setVagas(e.target.value)} type="number" required
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Mínimo para não cancelar</label>
                  <input value={meta} onChange={(e) => setMeta(e.target.value)} type="number" required
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {produtoSelecionado && modulos.length === 0 && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Professor</h3>
                  <select value={professorId} onChange={(e) => setProfessorId(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Selecione o professor</option>
                    {professores.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — R$ {p.diaria_reais}/dia (total: R$ {p.diaria_reais * produtoSelecionado.duracao_dias})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {produtoSelecionado && diasAula.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Datas, horários e professores — {produtoSelecionado.duracao_dias} dias
                    </h3>
                  </div>

                  {diasPorModulo ? (
                    <div className="divide-y divide-gray-50">
                      {diasPorModulo.map(({ modulo, dias }) => (
                        <div key={modulo.id} className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded-full">
                                Módulo {modulo.ordem}
                              </span>
                              <span className="text-sm font-medium text-gray-700">{modulo.nome}</span>
                              <span className="text-xs text-gray-400">({modulo.duracao_dias} dias)</span>
                            </div>
                            <select
                              value={profPorModulo[modulo.id] || ''}
                              onChange={(e) => setProfPorModulo(prev => ({ ...prev, [modulo.id]: e.target.value }))}
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 max-w-xs"
                            >
                              <option value="">Selecionar professor</option>
                              {professores.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.nome} — R$ {p.diaria_reais * modulo.duracao_dias}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            {dias.map((dia, i) => (
                              <div key={dia.index} className="flex gap-3 items-center">
                                <span className="text-xs text-gray-400 w-12">Dia {i + 1}</span>
                                <input type="date" value={dia.data}
                                  onChange={(e) => atualizarDia(dia.index, 'data', e.target.value)} required
                                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                <input type="time" value={dia.horario_inicio}
                                  onChange={(e) => atualizarDia(dia.index, 'horario_inicio', e.target.value)}
                                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                <span className="text-xs text-gray-400">até</span>
                                <input type="time" value={dia.horario_fim}
                                  onChange={(e) => atualizarDia(dia.index, 'horario_fim', e.target.value)}
                                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 space-y-2">
                      {diasAula.map((dia, i) => (
                        <div key={i} className="flex gap-3 items-center">
                          <span className="text-xs text-gray-400 w-12">Dia {i + 1}</span>
                          <input type="date" value={dia.data}
                            onChange={(e) => atualizarDia(i, 'data', e.target.value)} required
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <input type="time" value={dia.horario_inicio}
                            onChange={(e) => atualizarDia(i, 'horario_inicio', e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <span className="text-xs text-gray-400">até</span>
                          <input type="time" value={dia.horario_fim}
                            onChange={(e) => atualizarDia(i, 'horario_fim', e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isExterna && (
                <div className="flex gap-3 bg-orange-50 p-3 rounded-lg">
                  <div className="flex-1">
                    <label className="text-xs text-orange-700 font-medium block mb-1">Deslocamento professor R$</label>
                    <input value={deslocProf} onChange={(e) => setDeslocProf(e.target.value)} type="number"
                      className="border border-orange-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-orange-700 font-medium block mb-1">Deslocamento equipe R$</label>
                    <input value={deslocEquipe} onChange={(e) => setDeslocEquipe(e.target.value)} type="number"
                      className="border border-orange-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none" />
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setAbrirForm(false)}
                  className="text-gray-500 text-sm px-4 py-2 hover:text-gray-700">
                  Cancelar
                </button>
                <button type="submit" disabled={salvando}
                  className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {salvando ? 'Abrindo...' : 'Abrir turma'}
                </button>
              </div>
            </form>
            {mensagem && (
              <p className={`text-sm mt-3 ${mensagem.includes('Erro') ? 'text-red-500' : 'text-green-600'}`}>
                {mensagem}
              </p>
            )}
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-sm font-medium text-gray-700">Turmas abertas</h2>
          </div>
          {turmas.length === 0 ? (
            <p className="text-sm text-gray-400 p-6">Nenhuma turma aberta ainda.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50">
                  <th className="text-left px-6 py-3">Produto</th>
                  <th className="text-left px-6 py-3">Cidade</th>
                  <th className="text-left px-6 py-3">Código</th>
                  <th className="text-left px-6 py-3">Início</th>
                  <th className="text-left px-6 py-3">Fim</th>
                  <th className="text-left px-6 py-3">Preço</th>
                  <th className="text-left px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {turmas.map((t) => (
                  <tr key={t.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => window.location.href = `/dashboard/turmas/${t.id}`}>
                    <td className="px-6 py-3 text-sm text-gray-900">{t.produtos?.nome}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">{t.cidades?.nome}</td>
                    <td className="px-6 py-3 text-sm text-gray-400 font-mono">{t.codigo || '—'}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {new Date(t.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {new Date(t.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900">R$ {t.preco_venda}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${statusCor[t.status]}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}