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
  sala_id: string
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
  parcelas: number
  lead_id: string | null
  alunos: { id: string; nome: string; whatsapp: string; email: string; cpf: string }
}

type Aluno = { id: string; nome: string; whatsapp: string; email: string; cpf: string }
type Professor = { id: string; nome: string; diaria_reais: number; tipo_pagamento?: 'diaria_fixa' | 'percentual_vendas'; percentual_vendas?: number }
type TurmaProfessor = { id: string; professor_id: string; modulo_id: string | null; valor_calculado: number; professores: { nome: string; diaria_reais: number }; produto_modulos: { nome: string; duracao_dias: number } | null }
type Lead = { id: string; nome: string; whatsapp: string; vendedor_id: string }
type Vendedor = { id: string; nome: string; setor?: string }
type Conta = { id: string; nome: string }

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

const statusCor: Record<string, { bg: string; color: string }> = {
  planejada: { bg: 'var(--surface-2)', color: 'var(--text-muted)' },
  em_vendas: { bg: 'var(--blue-bg)', color: 'var(--blue)' },
  confirmada: { bg: 'var(--green-bg)', color: 'var(--green-strong)' },
  realizada: { bg: 'var(--accent-bg)', color: 'var(--accent-soft)' },
  cancelada: { bg: 'var(--red-bg)', color: 'var(--red)' },
}

function addMonths(date: Date, months: number) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export default function DetalheTurma() {
  const params = useParams()
  const id = params.id as string

  const [turma, setTurma] = useState<Turma | null>(null)
  const [matriculas, setMatriculas] = useState<Matricula[]>([])
  const [financeiro, setFinanceiro] = useState<any>(null)
  const [datas, setDatas] = useState<any[]>([])
  const [lancamentos, setLancamentos] = useState<any[]>([])
  const [turmaProfessores, setTurmaProfessores] = useState<TurmaProfessor[]>([])
  const [professores, setProfessores] = useState<Professor[]>([])
  const [leadsDisponiveis, setLeadsDisponiveis] = useState<Lead[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [contas, setContas] = useState<Conta[]>([])
 const [carregando, setCarregando] = useState(true)
  const [ehAdmin, setEhAdmin] = useState(false)

  useEffect(() => {
    async function checarPapel() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: p } = await supabase.from('usuarios_perfil').select('papel').eq('id', session.user.id).single()
      setEhAdmin(p?.papel === 'admin')
    }
    checarPapel()
  }, [])
  const [novaVenda, setNovaVenda] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [aba, setAba] = useState<'matriculas' | 'financeiro' | 'datas' | 'professores'>('matriculas')
  const [editandoProf, setEditandoProf] = useState<string | null>(null)
  const [novoProfId, setNovoProfId] = useState('')
  const [cidades, setCidades] = useState<{ id: string; nome: string }[]>([])
  const [editandoTurma, setEditandoTurma] = useState(false)
  const [edCodigo, setEdCodigo] = useState('')
  const [edPreco, setEdPreco] = useState('')
  const [edVagas, setEdVagas] = useState('')
  const [edMeta, setEdMeta] = useState('')
  const [edCidadeId, setEdCidadeId] = useState('')

  // Form nova venda
  const [buscaAluno, setBuscaAluno] = useState('')
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null)
  const [resultadosBusca, setResultadosBusca] = useState<Aluno[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [novoCpf, setNovoCpf] = useState('')
  const [novoWhatsapp, setNovoWhatsapp] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [modoAluno, setModoAluno] = useState<'buscar' | 'novo'>('buscar')
  const [valor, setValor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState<'pix' | 'boleto' | 'cartao'>('pix')
  const [parcelas, setParcelas] = useState('1')
  const [dataVenda, setDataVenda] = useState(new Date().toISOString().split('T')[0])
  const [leadVinculado, setLeadVinculado] = useState('')
  const [vendedorId, setVendedorId] = useState('')
  const [contaId, setContaId] = useState('')

  useEffect(() => { if (id) carregarTudo() }, [id])
  useEffect(() => { if (turma) setValor(turma.preco_venda.toString()) }, [turma])
  useEffect(() => {
    if (buscaAluno.length >= 2) buscarAlunos()
    else setResultadosBusca([])
  }, [buscaAluno])

  async function carregarTudo() {
    setCarregando(true)
    await Promise.all([
      carregarTurma(), carregarMatriculas(), carregarFinanceiro(),
      carregarDatas(), carregarLancamentos(), carregarTurmaProfessores(),
      carregarProfessores(), carregarLeadsDisponiveis(), carregarVendedores(),
      carregarContas(), carregarCidades()
    ])
    setCarregando(false)
  }

  async function carregarTurma() {
    const { data } = await supabase.from('turmas').select('*, produtos(nome, duracao_dias), cidades(nome), salas(nome)').eq('id', id).single()
    if (data) setTurma(data)
  }
  async function carregarMatriculas() {
    const { data } = await supabase.from('matriculas').select('*, alunos(id, nome, whatsapp, email, cpf)').eq('turma_id', id).order('data_compra', { ascending: false })
    if (data) setMatriculas(data)
  }
  async function carregarFinanceiro() {
    const { data } = await supabase.from('financeiro_turma').select('*').eq('turma_id', id).single()
    if (data) setFinanceiro(data)
  }
  async function carregarDatas() {
    const { data } = await supabase.from('turma_datas').select('*').eq('turma_id', id).order('ordem')
    if (data) setDatas(data)
  }
  async function carregarLancamentos() {
    const { data } = await supabase.from('lancamentos_empresa').select('*').eq('turma_id', id).order('data_vencimento')
    if (data) setLancamentos(data)
  }
  async function carregarTurmaProfessores() {
    const { data } = await supabase.from('turma_professores').select('*, professores(nome, diaria_reais), produto_modulos(nome, duracao_dias)').eq('turma_id', id)
    if (data) setTurmaProfessores(data)
  }
  async function carregarProfessores() {
    const { data } = await supabase.from('professores').select('*').eq('ativo', true).order('nome')
    if (data) setProfessores(data)
  }
  async function carregarLeadsDisponiveis() {
    const { data } = await supabase.from('leads')
      .select('id, nome, whatsapp, vendedor_id')
      .eq('turma_id', id)
      .not('etapa', 'in', '(ganho,perdido)')
      .order('criado_em', { ascending: false })
    if (data) setLeadsDisponiveis(data)
  }
async function carregarContas() {
    const { data } = await supabase.from('contas_financeiras')
      .select('id, nome').eq('ativo', true).order('nome')
    if (data) setContas(data)
  }
  async function carregarVendedores() {
    const { data } = await supabase.from('usuarios_perfil')
      .select('id, nome, setor')
      .in('setor', ['comercial', 'comercial_externo'])
      .eq('ativo', true)
      .order('setor')
      .order('nome')
    if (data) setVendedores(data as any)
  }

  async function buscarAlunos() {
    const { data } = await supabase.from('alunos')
      .select('id, nome, whatsapp, email, cpf')
      .or(`nome.ilike.%${buscaAluno}%,cpf.ilike.%${buscaAluno}%,whatsapp.ilike.%${buscaAluno}%`)
      .limit(5)
    if (data) setResultadosBusca(data)
  }

  function limparForm() {
    setNovaVenda(false); setAlunoSelecionado(null); setBuscaAluno('')
    setNovoNome(''); setNovoCpf(''); setNovoWhatsapp(''); setNovoEmail('')
    setModoAluno('buscar'); setFormaPagamento('pix'); setParcelas('1')
setLeadVinculado(''); setVendedorId(''); setContaId(''); setMensagem('')  }

  async function salvarVenda(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    let alunoId = alunoSelecionado?.id
    let nomeAluno = alunoSelecionado?.nome

    if (modoAluno === 'novo') {
      if (!novoNome || !novoCpf) { setMensagem('Nome e CPF são obrigatórios.'); setSalvando(false); return }
      const { data: novoAluno, error } = await supabase.from('alunos').insert({
        nome: novoNome, cpf: novoCpf,
        whatsapp: novoWhatsapp || null,
        email: novoEmail || `${novoCpf}@semEmail.com`,
      }).select().single()
      if (error || !novoAluno) { setMensagem('Erro ao criar aluno: ' + error?.message); setSalvando(false); return }
      alunoId = novoAluno.id
      nomeAluno = novoNome
    }

    if (!alunoId) { setMensagem('Selecione ou cadastre um aluno.'); setSalvando(false); return }
if (!alunoId) { setMensagem('Selecione ou cadastre um aluno.'); setSalvando(false); return }
    const valorVenda = parseFloat(valor)
    const numParcelas = formaPagamento === 'cartao' ? 1 : parseInt(parcelas)

    // Se vinculou lead, pega vendedor do lead (a menos que tenha selecionado outro)
    let vendedorFinal = vendedorId || null
    if (leadVinculado && !vendedorId) {
      const lead = leadsDisponiveis.find(l => l.id === leadVinculado)
      if (lead?.vendedor_id) vendedorFinal = lead.vendedor_id
    }

    const { data: matricula, error: errMat } = await supabase.from('matriculas').insert({
      aluno_id: alunoId, turma_id: id, valor_pago: valorVenda,
      data_compra: dataVenda, forma_pagamento: formaPagamento,
      parcelas: numParcelas, status: 'ativa',
      lead_id: leadVinculado || null,
      vendedor_id: vendedorFinal,
    }).select().single()
    if (errMat) { setMensagem('Erro ao registrar venda: ' + errMat.message); setSalvando(false); return }

    // Dispara Purchase pro CAPI (server-side, via route — token fica protegido)
    fetch('/api/capi/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricula_id: matricula.id }),
    }).catch(() => {})

    // LTV do aluno
    const { data: alunoAtual } = await supabase.from('alunos').select('ltv').eq('id', alunoId).single()
    await supabase.from('alunos').update({ ltv: (alunoAtual?.ltv || 0) + valorVenda }).eq('id', alunoId)

    // Receita realizada no financeiro_turma
    if (financeiro) {
      const novaReceita = (financeiro.receita_realizada || 0) + valorVenda
      await supabase.from('financeiro_turma').update({
        receita_realizada: novaReceita,
        margem_realizada: novaReceita - (financeiro.custo_professores || 0) - (financeiro.custo_sala || 0) - (financeiro.custo_deslocamento || 0) - (financeiro.custo_trafego_previsto || 0) - (financeiro.imposto_previsto || 0),
        atualizado_em: new Date().toISOString(),
      }).eq('turma_id', id)
    }

    // Cria N lançamentos (parcelas)
    const valorParcela = valorVenda / numParcelas
    const dataBase = new Date(dataVenda + 'T12:00:00')
    const lancamentosParcelas = []
    for (let i = 0; i < numParcelas; i++) {
      const dataVencimento = addMonths(dataBase, i)
      const dataStr = dataVencimento.toISOString().split('T')[0]
      lancamentosParcelas.push({
        tipo: 'receita', categoria: 'outro',
        descricao: `Matrícula ${nomeAluno} (${formaPagamento})${numParcelas > 1 ? ` ${i+1}/${numParcelas}` : ''}`,
        valor: valorParcela, unidade: 'geral',
        mes_referencia: dataStr.substring(0, 7) + '-01',
        data_vencimento: dataStr,
        data_pagamento: i === 0 ? dataStr : null,
        status: i === 0 ? 'realizado' : 'previsto',
        turma_id: id,
        conta_id: contaId,
      })
    }
    await supabase.from('lancamentos_empresa').insert(lancamentosParcelas)

    // Subtrair do lançamento de receita PREVISTA da turma
    const { data: prevista } = await supabase.from('lancamentos_empresa')
      .select('id, valor')
      .eq('turma_id', id)
      .eq('tipo', 'receita')
      .eq('status', 'previsto')
      .ilike('descricao', 'Receita prevista%')
      .single()

    if (prevista) {
      const novoValor = Math.max(0, (prevista.valor || 0) - valorVenda)
      if (novoValor === 0) {
        await supabase.from('lancamentos_empresa').delete().eq('id', prevista.id)
      } else {
        await supabase.from('lancamentos_empresa').update({ valor: novoValor }).eq('id', prevista.id)
      }
    }

    // Se vinculou um lead, marca como ganho
    if (leadVinculado) {
      await supabase.from('leads').update({
        etapa: 'ganho',
        data_ganho: new Date().toISOString(),
        valor_venda: valorVenda,
        matricula_id: matricula.id,
        atualizado_em: new Date().toISOString(),
      }).eq('id', leadVinculado)

      await supabase.from('lead_andamentos').insert({
        lead_id: leadVinculado, vendedor_id: vendedorFinal,
        etapa_anterior: 'em_atendimento', etapa_nova: 'ganho',
        observacao: `Matrícula criada — ${formaPagamento} ${numParcelas}x R$ ${valorParcela.toFixed(2)}`,
      })
    }

    setMensagem('Venda registrada com sucesso!')
    limparForm()
    carregarTudo(); setSalvando(false)
  }

  async function atualizarStatus(novoStatus: string) {
    await supabase.from('turmas').update({ status: novoStatus }).eq('id', id)
    carregarTurma()
  }
  async function carregarCidades() {
    const { data } = await supabase.from('cidades').select('id, nome').eq('ativo', true).order('nome')
    if (data) setCidades(data)
  }

  function abrirEdicao() {
    if (!turma) return
    setEdCodigo(turma.codigo || '')
    setEdPreco(String(turma.preco_venda ?? ''))
    setEdVagas(String(turma.vagas ?? ''))
    setEdMeta(String(turma.meta_matriculas ?? ''))
    setEdCidadeId((turma as any).cidade_id || '')
    setEditandoTurma(true)
  }

  async function salvarEdicao() {
    const { error } = await supabase.from('turmas').update({
      codigo: edCodigo.trim() || null,
      preco_venda: parseFloat(edPreco) || 0,
      vagas: parseInt(edVagas) || 0,
      meta_matriculas: parseInt(edMeta) || 0,
      cidade_id: edCidadeId || null,
    }).eq('id', id)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setEditandoTurma(false)
    carregarTurma()
  }

  async function excluirTurma() {
    if (matriculas.length > 0) {
      alert('Esta turma tem matrículas registradas. Cancele ou transfira as matrículas antes de excluir.')
      return
    }
    if (!confirm('Excluir esta turma e tudo provisionado (datas, financeiro, tarefas, agenda)? Os leads serão desvinculados, não apagados. Não dá pra desfazer.')) return
    await supabase.from('agenda_aulas').delete().eq('turma_id', id)
    await supabase.from('lancamentos_empresa').delete().eq('turma_id', id)
    await supabase.from('tarefas').delete().eq('turma_id', id)
    await supabase.from('financeiro_turma').delete().eq('turma_id', id)
    await supabase.from('turma_professores').delete().eq('turma_id', id)
    await supabase.from('turma_datas').delete().eq('turma_id', id)
    await supabase.from('leads').update({ turma_id: null }).eq('turma_id', id)
    const { error } = await supabase.from('turmas').delete().eq('id', id)
    if (error) { alert('Erro ao excluir: ' + error.message); return }
    window.location.href = '/dashboard/turmas'
  }
  async function fecharTurma() {
    // Pega lançamentos previstos de coprodução
    const { data: copreviews } = await supabase.from('lancamentos_empresa')
      .select('*')
      .eq('turma_id', id)
      .eq('categoria', 'pessoal')
      .ilike('descricao', 'Coprodução%')

    if (!copreviews || copreviews.length === 0) {
      alert('Esta turma não tem coproduções (% sobre vendas) cadastradas.')
      return
    }

    // Calcula líquido realizado
    const receitaReal = financeiro?.receita_realizada || 0
    const trafegoReal = custoRealizadoTrafego
    const impostoReal = custoRealizadoImposto
    const deslocReal = custoRealizadoDesloc
    const liquidoReal = receitaReal - trafegoReal - impostoReal - deslocReal

    // Pra cada coprodução, recalcula com líquido real
    let resumo = `Fechamento da turma:\n\n`
    resumo += `Receita realizada: ${fmt(receitaReal)}\n`
    resumo += `(-) Tráfego realizado: ${fmt(trafegoReal)}\n`
    resumo += `(-) Imposto realizado: ${fmt(impostoReal)}\n`
    resumo += `(-) Deslocamento realizado: ${fmt(deslocReal)}\n`
    resumo += `= Líquido: ${fmt(liquidoReal)}\n\n`
    resumo += `Coproduções (recalculadas):\n`

    const atualizacoes: Array<{ id: string, valor: number, descricao: string }> = []
    for (const c of copreviews) {
      // Tenta extrair o % do registro de professor
      const tp = turmaProfessores.find(p => c.descricao.includes(p.professores.nome))
      const prof = tp ? professores.find(p => p.id === tp.professor_id) : null
      const pct = (prof as any)?.percentual_vendas || 0
      const valorReal = (liquidoReal * pct) / 100
      const novaDesc = c.descricao.replace(' — PREVISTO', '')

      resumo += `  ${novaDesc}: ${pct}% × ${fmt(liquidoReal)} = ${fmt(valorReal)}\n`
      atualizacoes.push({ id: c.id, valor: valorReal, descricao: novaDesc })
    }

    resumo += `\nConfirma o fechamento?`

    if (!confirm(resumo)) return

    // Aplica atualizações
    for (const a of atualizacoes) {
      await supabase.from('lancamentos_empresa').update({
        valor: a.valor,
        descricao: a.descricao,
        status: 'realizado',
        data_pagamento: new Date().toISOString().split('T')[0],
      }).eq('id', a.id)
    }

    // Marca turma como realizada (se não estiver)
    if (turma?.status !== 'realizada') {
      await supabase.from('turmas').update({ status: 'realizada' }).eq('id', id)
    }

    alert('Turma fechada com sucesso!')
    carregarTudo()
  }

  async function trocarProfessor(turmaProfId: string) {
    if (!novoProfId) { setEditandoProf(null); return }
    const tp = turmaProfessores.find(x => x.id === turmaProfId)
    const novoProf = professores.find(p => p.id === novoProfId)
    if (!tp || !novoProf) return

    const dias = tp.produto_modulos?.duracao_dias || (turma?.produtos?.duracao_dias || 0)
    const novoValor = novoProf.diaria_reais * dias

    await supabase.from('turma_professores').update({
      professor_id: novoProfId, valor_calculado: novoValor,
    }).eq('id', turmaProfId)

    const descAntiga = `Professor ${tp.professores.nome}`
    const { data: lancAntigo } = await supabase.from('lancamentos_empresa')
      .select('id')
      .eq('turma_id', id)
      .eq('categoria', 'pessoal')
      .ilike('descricao', `${descAntiga}%`)
      .eq('status', 'previsto')
      .limit(1).single()

    if (lancAntigo) {
      const novaDescricao = `Professor ${novoProf.nome}${tp.produto_modulos ? ' — ' + tp.produto_modulos.nome : ''}`
      await supabase.from('lancamentos_empresa').update({
        descricao: novaDescricao, valor: novoValor,
      }).eq('id', lancAntigo.id)
    }

    const novoCustoProfs = turmaProfessores.reduce((s, x) => s + (x.id === turmaProfId ? novoValor : x.valor_calculado), 0)
    if (financeiro) {
      const novaMargemPrev = (financeiro.receita_prevista || 0) - novoCustoProfs - (financeiro.custo_trafego_previsto || 0) - (financeiro.imposto_previsto || 0) - (financeiro.custo_deslocamento || 0)
      await supabase.from('financeiro_turma').update({
        custo_professores: novoCustoProfs, margem_prevista: novaMargemPrev,
        atualizado_em: new Date().toISOString(),
      }).eq('turma_id', id)
    }

    await supabase.from('agenda_aulas')
      .update({ professor_id: novoProfId })
      .eq('turma_id', id)
      .eq('professor_id', tp.professor_id)

    setEditandoProf(null); setNovoProfId('')
    carregarTudo()
  }

  function fmt(v: number) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const progresso = turma ? Math.min((matriculas.length / turma.meta_matriculas) * 100, 100) : 0
  const breakEvenAtingido = turma ? matriculas.length >= turma.meta_matriculas : false

  const custoRealizadoProf = lancamentos.filter(l => l.categoria === 'pessoal' && l.status === 'realizado').reduce((s, l) => s + l.valor, 0)
  const custoRealizadoTrafego = lancamentos.filter(l => l.categoria === 'marketing' && l.status === 'realizado').reduce((s, l) => s + l.valor, 0)
  const custoRealizadoImposto = lancamentos.filter(l => l.categoria === 'imposto' && l.status === 'realizado').reduce((s, l) => s + l.valor, 0)
  const custoRealizadoDesloc = lancamentos.filter(l => l.categoria === 'outro' && l.status === 'realizado' && l.descricao?.startsWith('Deslocamento')).reduce((s, l) => s + l.valor, 0)
  const custoRealizadoSala = lancamentos.filter(l => l.categoria === 'outro' && l.status === 'realizado' && l.descricao?.startsWith('Aluguel sala')).reduce((s, l) => s + l.valor, 0)
  const totalCustosRealizados = custoRealizadoProf + custoRealizadoTrafego + custoRealizadoImposto + custoRealizadoDesloc + custoRealizadoSala
  const margemRealizada = (financeiro?.receita_realizada || 0) - totalCustosRealizados

  const trafegoPendente = lancamentos.filter(l => l.categoria === 'marketing' && l.status === 'previsto' && l.descricao?.startsWith('Tráfego'))
  const trafegoPorDia = trafegoPendente.length > 0 ? trafegoPendente[0].valor : 0

  if (carregando) return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-faint)', fontSize: '14px' }}>Carregando...</p>
    </div>
  )

  if (!turma) return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-faint)', fontSize: '14px' }}>Turma não encontrada.</p>
    </div>
  )

  const s = statusCor[turma.status] || statusCor.planejada

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      <header style={{ padding: '20px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/dashboard/turmas" style={{ color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'none' }}>← Turmas</Link>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>{turma.produtos?.nome}</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px', margin: 0 }}>
              {turma.cidades?.nome} · {turma.salas?.nome} · {new Date(turma.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')} a {new Date(turma.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {ehAdmin && (
            <>
              <button onClick={abrirEdicao} style={btnSecondary}>Editar</button>
              <select value={turma.status} onChange={e => atualizarStatus(e.target.value)} style={select}>
                <option value="planejada">Planejada</option>
                <option value="em_vendas">Em vendas</option>
                <option value="confirmada">Confirmada</option>
                <option value="realizada">Realizada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </>
          )}
          <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '20px', backgroundColor: s.bg, color: s.color }}>
            {turma.status.replace('_', ' ')}
          </span>
        </div>
      </header>

      {editandoTurma && (
        <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 14px' }}>Editar turma</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Código</label>
              <input value={edCodigo} onChange={e => setEdCodigo(e.target.value)} style={input} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Preço R$</label>
              <input value={edPreco} onChange={e => setEdPreco(e.target.value)} type="number" style={input} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Cidade</label>
              <select value={edCidadeId} onChange={e => setEdCidadeId(e.target.value)} style={{ ...select, width: '100%' }}>
                <option value="">—</option>
                {cidades.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Vagas</label>
              <input value={edVagas} onChange={e => setEdVagas(e.target.value)} type="number" style={input} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Mínimo p/ não cancelar</label>
              <input value={edMeta} onChange={e => setEdMeta(e.target.value)} type="number" style={input} />
            </div>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--amber)', margin: '0 0 12px' }}>
            Atenção: trocar a cidade entre própria e externa não recalcula o deslocamento já provisionado. Se precisar disso, exclua e reabra a turma.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={excluirTurma} style={{ ...btnSecondary, border: '1px solid var(--red-bg)', color: 'var(--red)' }}>Excluir turma</button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEditandoTurma(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={salvarEdicao} style={btnPrimary}>Salvar alterações</button>
            </div>
          </div>
        </div>
      )}

      <main style={{ padding: '24px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ ...card, padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)' }}>{matriculas.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Matrículas</div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, backgroundColor: 'var(--surface-2)', borderRadius: '20px', height: '4px' }}>
                <div style={{ height: '4px', borderRadius: '20px', backgroundColor: breakEvenAtingido ? 'var(--green-strong)' : 'var(--accent)', width: `${progresso}%` }} />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>meta {turma.meta_matriculas}</span>
            </div>
          </div>
          <div style={{ ...card, padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)' }}>{turma.vagas - matriculas.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Vagas restantes</div>
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>de {turma.vagas} total</div>
          </div>
          {ehAdmin && (
          <>
          <div style={{ ...card, padding: '16px' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--green-strong)' }}>{fmt(financeiro?.receita_realizada || 0)}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Receita realizada</div>
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>Prevista: {fmt(financeiro?.receita_prevista || 0)}</div>
          </div>
          <div style={{ ...card, padding: '16px' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: (financeiro?.margem_prevista || 0) >= 0 ? 'var(--green-strong)' : 'var(--red)' }}>{fmt(financeiro?.margem_prevista || 0)}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Margem prevista</div>
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>Break-even: {turma.meta_matriculas}</div>
          </div>
          </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '0' }}>
          {[
            { id: 'matriculas', label: `Matrículas (${matriculas.length})` },
            ...(ehAdmin ? [
              { id: 'financeiro', label: 'Financeiro' },
              { id: 'professores', label: `Professores (${turmaProfessores.length})` },
            ] : []),
            { id: 'datas', label: `Datas (${datas.length})` },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as any)} style={{
              padding: '10px 18px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
              border: 'none', borderBottom: aba === a.id ? '2px solid var(--accent)' : '2px solid transparent',
              backgroundColor: 'transparent', color: aba === a.id ? 'var(--accent-soft)' : 'var(--text-muted)',
              marginBottom: '-1px',
            }}>
              {a.label}
            </button>
          ))}
        </div>

        <div style={{ ...card, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 0 }}>
          {aba === 'matriculas' && (
            <div>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{matriculas.length} aluno{matriculas.length !== 1 ? 's' : ''} matriculado{matriculas.length !== 1 ? 's' : ''}</span>
                <button onClick={() => novaVenda ? limparForm() : setNovaVenda(true)} style={btnPrimary}>
                  {novaVenda ? 'Cancelar' : '+ Nova venda'}
                </button>
              </div>

              {novaVenda && (
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '14px' }}>Registrar nova venda</h3>
                  <form onSubmit={salvarVenda} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setModoAluno('buscar')}
                        style={{ ...btnSecondary, backgroundColor: modoAluno === 'buscar' ? 'var(--accent)' : 'var(--surface-2)', color: modoAluno === 'buscar' ? 'var(--on-accent)' : 'var(--text-2)', fontSize: '12px', padding: '6px 12px' }}>
                        Aluno existente
                      </button>
                      <button type="button" onClick={() => setModoAluno('novo')}
                        style={{ ...btnSecondary, backgroundColor: modoAluno === 'novo' ? 'var(--accent)' : 'var(--surface-2)', color: modoAluno === 'novo' ? 'var(--on-accent)' : 'var(--text-2)', fontSize: '12px', padding: '6px 12px' }}>
                        Novo aluno
                      </button>
                    </div>

                    {modoAluno === 'buscar' ? (
                      <div style={{ position: 'relative' }}>
                        <input value={buscaAluno} onChange={e => setBuscaAluno(e.target.value)} placeholder="Buscar por nome, CPF ou WhatsApp..." style={input} />
                        {resultadosBusca.length > 0 && !alunoSelecionado && (
                          <div style={{ position: 'absolute', zIndex: 10, width: '100%', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px' }}>
                            {resultadosBusca.map(a => (
                              <div key={a.id} onClick={() => { setAlunoSelecionado(a); setBuscaAluno(a.nome); setResultadosBusca([]) }}
                                style={{ padding: '8px 14px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontWeight: '500' }}>{a.nome}</span>
                                {a.cpf && <span style={{ color: 'var(--text-faint)', marginLeft: '10px', fontSize: '11px' }}>CPF: {a.cpf}</span>}
                                {a.whatsapp && <span style={{ color: 'var(--text-faint)', marginLeft: '10px', fontSize: '11px' }}>{a.whatsapp}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {alunoSelecionado && (
                          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: '8px', padding: '10px 14px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--green-strong)', fontWeight: '500' }}>{alunoSelecionado.nome}</span>
                            {alunoSelecionado.cpf && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CPF: {alunoSelecionado.cpf}</span>}
                            <button type="button" onClick={() => { setAlunoSelecionado(null); setBuscaAluno('') }}
                              style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>× trocar</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                          <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome completo *" required style={input} />
                          <input value={novoCpf} onChange={e => setNovoCpf(e.target.value)} placeholder="CPF *" required style={input} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input value={novoWhatsapp} onChange={e => setNovoWhatsapp(e.target.value)} placeholder="WhatsApp" style={input} />
                          <input value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="E-mail" type="email" style={input} />
                        </div>
                      </div>
                    )}

                    {leadsDisponiveis.length > 0 && (
                      <div style={{ backgroundColor: 'var(--accent-bg)', border: '1px solid var(--accent)', borderRadius: '8px', padding: '12px 14px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--accent-soft)', fontWeight: '600', marginBottom: '6px' }}>
                          Vincular lead (opcional) — {leadsDisponiveis.length} lead(s) desta turma
                        </label>
                        <select value={leadVinculado} onChange={e => setLeadVinculado(e.target.value)} style={{ ...select, width: '100%' }}>
                          <option value="">Sem vínculo</option>
                          {leadsDisponiveis.map(l => (
                            <option key={l.id} value={l.id}>{l.nome} {l.whatsapp ? `· ${l.whatsapp}` : ''}</option>
                          ))}
                        </select>
                        {leadVinculado && (
                          <p style={{ fontSize: '10px', color: 'var(--accent-soft)', marginTop: '6px' }}>
                            ✓ Lead será marcado como ganho automaticamente
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Vendedor (opcional)
                        {leadVinculado && !vendedorId && (() => {
                          const lead = leadsDisponiveis.find(l => l.id === leadVinculado)
                          if (lead?.vendedor_id) {
                            const v = vendedores.find(vd => vd.id === lead.vendedor_id)
                            return <span style={{ color: 'var(--accent-soft)', marginLeft: 8 }}>· auto: {v?.nome}</span>
                          }
                          return null
                        })()}
                      </label>
                      <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} style={{ ...select, width: '100%' }}>
                        <option value="">— sem vendedor</option>
                        {vendedores.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.nome} {v.setor === 'comercial_externo' ? '(Externo)' : '(Interno)'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Valor R$</label>
                        <input value={valor} onChange={e => setValor(e.target.value)} type="number" step="0.01" required style={input} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Forma</label>
                        <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value as any)} style={{ ...select, width: '100%' }}>
                          <option value="pix">PIX</option>
                          <option value="boleto">Boleto</option>
                          <option value="cartao">Cartão (à vista)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Parcelas {formaPagamento === 'cartao' && <span style={{ color: 'var(--text-faint)' }}>(à vista)</span>}
                        </label>
                        <input value={formaPagamento === 'cartao' ? '1' : parcelas} onChange={e => setParcelas(e.target.value)}
                          type="number" min="1" max="12" disabled={formaPagamento === 'cartao'}
                          style={{ ...input, opacity: formaPagamento === 'cartao' ? 0.5 : 1 }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Data da venda</label>
                        <input value={dataVenda} onChange={e => setDataVenda(e.target.value)} type="date" required style={input} />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Caixa que recebe o pagamento *</label>
                      <select value={contaId} onChange={e => setContaId(e.target.value)} required style={{ ...select, width: '100%' }}>
                        <option value="">Selecione a caixa</option>
                        {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                    {formaPagamento !== 'cartao' && parseInt(parcelas) > 1 && valor && (          
                      <div style={{ fontSize: 11, color: 'var(--accent-soft)', padding: '8px 12px', background: 'var(--bg)', borderRadius: 6 }}>
                        {parcelas}x de R$ {(parseFloat(valor) / parseInt(parcelas)).toFixed(2)} (primeira no dia da venda, demais com 1 mês de intervalo)
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button type="button" onClick={limparForm} style={btnSecondary}>Cancelar</button>
                      <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Registrando...' : 'Registrar venda'}</button>
                    </div>
                    {mensagem && <p style={{ fontSize: '13px', color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green-strong)' }}>{mensagem}</p>}
                  </form>
                </div>
              )}

              {matriculas.length === 0 ? (
                <p style={{ padding: '24px', fontSize: '13px', color: 'var(--text-faint)' }}>Nenhuma matrícula ainda.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Aluno', 'CPF', 'Contato', 'Data', 'Valor', 'Pagamento', 'Status'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '12px 20px', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matriculas.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text)' }}>{m.alunos?.nome}</td>
                        <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{m.alunos?.cpf || '-'}</td>
                        <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {m.alunos?.whatsapp && (
                            <a href={`https://wa.me/55${m.alunos.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green-strong)', textDecoration: 'none' }}>
                              {m.alunos.whatsapp}
                            </a>
                          )}
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(m.data_compra).toLocaleDateString('pt-BR')}</td>
                        <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: '600', color: 'var(--green-strong)' }}>
                          {fmt(m.valor_pago)}
                          {m.parcelas > 1 && <span style={{ fontSize: '10px', color: 'var(--text-faint)', marginLeft: '6px' }}>{m.parcelas}x</span>}
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{m.forma_pagamento}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', backgroundColor: 'var(--green-bg)', color: 'var(--green-strong)' }}>{m.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {ehAdmin && aba === 'financeiro' && financeiro && (
            <div style={{ padding: '24px' }}>
              {turma.status === 'realizada' && (
                <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={fecharTurma} style={{ ...btnPrimary, backgroundColor: 'var(--green)' }}>
                    🔒 Fechar turma e recalcular coproduções
                  </button>
                </div>
              )}

              {trafegoPorDia > 0 && (
                <div style={{ backgroundColor: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--blue)', fontWeight: '600', marginBottom: '4px' }}>📊 Investimento diário sugerido de tráfego</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)' }}>{fmt(trafegoPorDia)} / dia</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{trafegoPendente.length} dia(s) restante(s) de provisão</div>
                </div>
              )}

              <table style={{ width: '100%', maxWidth: '600px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 0', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500' }}></th>
                    <th style={{ textAlign: 'right', padding: '8px 16px', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500' }}>Previsto</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500' }}>Realizado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 0', fontSize: '13px', color: 'var(--text-muted)' }}>Receita</td>
                    <td style={{ padding: '8px 16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'right' }}>{fmt(financeiro.receita_prevista)}</td>
                    <td style={{ padding: '8px 0', fontSize: '13px', color: 'var(--green-strong)', textAlign: 'right', fontWeight: '600' }}>{fmt(financeiro.receita_realizada)}</td>
                  </tr>
                  <tr><td colSpan={3} style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}></td></tr>
                  <tr>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--text-muted)' }}>(-) Professores</td>
                    <td style={{ padding: '6px 16px', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(financeiro.custo_professores)}</td>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(custoRealizadoProf)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--text-muted)' }}>(-) Tráfego (12%)</td>
                    <td style={{ padding: '6px 16px', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(financeiro.custo_trafego_previsto)}</td>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(custoRealizadoTrafego)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--text-muted)' }}>(-) Imposto (8%)</td>
                    <td style={{ padding: '6px 16px', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(financeiro.imposto_previsto)}</td>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(custoRealizadoImposto)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--text-muted)' }}>(-) Deslocamento</td>
                    <td style={{ padding: '6px 16px', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(financeiro.custo_deslocamento)}</td>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(custoRealizadoDesloc)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--text-muted)' }}>(-) Aluguel sala</td>
                    <td style={{ padding: '6px 16px', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(financeiro.custo_sala)}</td>
                    <td style={{ padding: '6px 0', fontSize: '13px', color: 'var(--red)', textAlign: 'right' }}>{fmt(custoRealizadoSala)}</td>
                  </tr>
                  <tr><td colSpan={3} style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}></td></tr>
                  <tr>
                    <td style={{ padding: '12px 0', fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>Margem</td>
                    <td style={{ padding: '12px 16px', fontSize: '15px', fontWeight: '700', color: (financeiro.margem_prevista || 0) >= 0 ? 'var(--green-strong)' : 'var(--red)', textAlign: 'right' }}>
                      {fmt(financeiro.margem_prevista)}
                    </td>
                    <td style={{ padding: '12px 0', fontSize: '15px', fontWeight: '700', color: margemRealizada >= 0 ? 'var(--green-strong)' : 'var(--red)', textAlign: 'right' }}>
                      {fmt(margemRealizada)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-faint)' }}>
                Break-even: {financeiro.break_even_matriculas} matrículas — {matriculas.length} realizadas
              </div>

              {lancamentos.length > 0 && (
                <div style={{ marginTop: '32px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '12px' }}>Lançamentos da turma ({lancamentos.length})</h3>
                  <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Descrição', 'Vencimento', 'Valor', 'Status'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '11px', color: 'var(--text-faint)', fontWeight: '500' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lancamentos.map(l => (
                          <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-2)' }}>{l.descricao}</td>
                            <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>{l.data_vencimento ? new Date(l.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                            <td style={{ padding: '10px 16px', fontSize: '12px', fontWeight: '600', color: l.tipo === 'receita' ? 'var(--green-strong)' : 'var(--red)' }}>
                              {l.tipo === 'receita' ? '+' : '-'}{fmt(l.valor)}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', backgroundColor: l.status === 'realizado' ? 'var(--green-bg)' : 'var(--surface-2)', color: l.status === 'realizado' ? 'var(--green-strong)' : 'var(--text-muted)' }}>
                                {l.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {ehAdmin && aba === 'professores' && (
            <div style={{ padding: '24px' }}>
              {turmaProfessores.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-faint)' }}>Nenhum professor vinculado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {turmaProfessores.map(tp => (
                    <div key={tp.id} style={{ ...card, padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        {tp.produto_modulos && (
                          <div style={{ fontSize: '11px', color: 'var(--accent-soft)', fontWeight: '600', marginBottom: '4px' }}>{tp.produto_modulos.nome}</div>
                        )}
                        {editandoProf === tp.id ? (
                          <select value={novoProfId} onChange={e => setNovoProfId(e.target.value)} style={select}>
                            <option value="">Selecione novo professor</option>
                            {professores.map(p => <option key={p.id} value={p.id}>{p.nome} — R$ {p.diaria_reais}/dia</option>)}
                          </select>
                        ) : (
                          <>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{tp.professores?.nome || 'Professor não encontrado'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>R$ {tp.professores?.diaria_reais ?? 0}/dia · {fmt(tp.valor_calculado)} total</div>
                          </>
                        )}
                      </div>
                      {editandoProf === tp.id ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => { setEditandoProf(null); setNovoProfId('') }} style={btnSecondary}>Cancelar</button>
                          <button onClick={() => trocarProfessor(tp.id)} style={btnPrimary}>Confirmar troca</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditandoProf(tp.id); setNovoProfId(tp.professor_id) }} style={btnSecondary}>Trocar professor</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {aba === 'datas' && (
            <div style={{ padding: '24px' }}>
              {datas.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-faint)' }}>Nenhuma data cadastrada.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {datas.map((d) => (
                    <div key={d.id} style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-faint)', width: '40px' }}>Dia {d.ordem}</span>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>
                        {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{d.horario_inicio} às {d.horario_fim}</span>
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