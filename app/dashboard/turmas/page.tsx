'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
type DiaAula = { data: string; horario_inicio: string; horario_fim: string; modulo_id?: string; modulo_nome?: string }

const statusCor: Record<string, { bg: string; color: string }> = {
  planejada: { bg: '#3a3a3c', color: '#9ca3af' },
  em_vendas: { bg: '#172554', color: '#60a5fa' },
  confirmada: { bg: '#052e16', color: '#4ade80' },
  realizada: { bg: '#2e1065', color: '#a78bfa' },
  cancelada: { bg: '#450a0a', color: '#f87171' },
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '14px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const sel = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties

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
    carregarTurmas(); carregarProdutos(); carregarCidades(); carregarSalas(); carregarProfessores()
  }, [])

  useEffect(() => {
    if (cidadeId) { setSalasFiltradas(salas.filter(s => s.cidade_id === cidadeId)); setSalaId('') }
  }, [cidadeId, salas])

  useEffect(() => {
    if (produtoId) {
      const p = produtos.find(p => p.id === produtoId)
      if (p) { setPreco(p.preco_venda.toString()); setVagas(p.vagas_padrao.toString()); setMeta(p.meta_matriculas.toString()); setProfessorId(''); setProfPorModulo({}); carregarModulos(p.id, p.duracao_dias) }
    }
  }, [produtoId])

  async function carregarTurmas() {
    const { data } = await supabase.from('turmas').select('*, produtos(nome), cidades(nome)').order('data_inicio', { ascending: false })
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
    const { data } = await supabase.from('produto_modulos').select('*').eq('produto_id', pid).order('ordem')
    if (data && data.length > 0) {
      setModulos(data)
      const dias: DiaAula[] = []
      data.forEach(mod => { for (let i = 0; i < mod.duracao_dias; i++) dias.push({ data: '', horario_inicio: '08:00', horario_fim: '18:00', modulo_id: mod.id, modulo_nome: mod.nome }) })
      setDiasAula(dias)
    } else {
      setModulos([])
      setDiasAula(Array.from({ length: duracaoTotal }, () => ({ data: '', horario_inicio: '08:00', horario_fim: '18:00' })))
    }
  }

  function atualizarDia(index: number, campo: keyof DiaAula, valor: string) {
    const novosDias = [...diasAula]; novosDias[index] = { ...novosDias[index], [campo]: valor }; setDiasAula(novosDias)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    const produto = produtos.find(p => p.id === produtoId)
    const cidade = cidades.find(c => c.id === cidadeId)
    if (!produto || !cidade) return
    const datasValidas = diasAula.filter(d => d.data)
    const datasOrdenadas = [...datasValidas].sort((a, b) => a.data.localeCompare(b.data))
    const dataInicio = datasOrdenadas[0]?.data
    const dataFim = datasOrdenadas[datasOrdenadas.length - 1]?.data

    const { data: turma, error } = await supabase.from('turmas').insert({
      produto_id: produtoId, cidade_id: cidadeId, sala_id: salaId,
      data_inicio: dataInicio, data_fim: dataFim,
      preco_venda: parseFloat(preco), vagas: parseInt(vagas), meta_matriculas: parseInt(meta),
      tipo_localidade: cidade.tipo === 'sede_propria' ? 'sede_propria' : 'cidade_externa',
      custo_deslocamento_prof: parseFloat(deslocProf), custo_deslocamento_equipe: parseFloat(deslocEquipe),
      status: 'planejada', codigo: codigoTurma || null,
    }).select().single()

    if (error || !turma) { setMensagem('Erro: ' + error?.message); setSalvando(false); return }

    if (diasAula.length > 0) {
      await supabase.from('turma_datas').insert(diasAula.map((d, i) => ({ turma_id: turma.id, modulo_id: d.modulo_id || null, data: d.data, horario_inicio: d.horario_inicio, horario_fim: d.horario_fim, ordem: i + 1 })))
    }

    let custoProfessores = 0
    if (modulos.length > 0) {
      for (const mod of modulos) {
        const profId = profPorModulo[mod.id]
        if (profId) {
          const prof = professores.find(p => p.id === profId)
          const val = prof ? prof.diaria_reais * mod.duracao_dias : 0
          custoProfessores += val
          await supabase.from('turma_professores').insert({ turma_id: turma.id, professor_id: profId, modulo_id: mod.id, valor_calculado: val })
        }
      }
    } else if (professorId) {
      const prof = professores.find(p => p.id === professorId)
      const val = prof ? prof.diaria_reais * produto.duracao_dias : 0
      custoProfessores = val
      await supabase.from('turma_professores').insert({ turma_id: turma.id, professor_id: professorId, valor_calculado: val })
    }

    const { data: templates } = await supabase.from('produto_tarefas_template').select('*').eq('produto_id', produtoId).order('ordem')
    if (templates && templates.length > 0 && dataInicio) {
      const inicio = new Date(dataInicio + 'T12:00:00')
      await supabase.from('tarefas').insert(templates.map(t => {
        const dp = new Date(inicio); dp.setDate(dp.getDate() + t.dias_relativo)
        return { turma_id: turma.id, titulo: t.titulo, setor: t.setor, tipo_entrega: t.tipo_entrega, tipo: 'prevista', data_prazo: dp.toISOString().split('T')[0], status: 'pendente', prioridade: 'normal' }
      }))
    }

    const receitaPrevista = parseFloat(preco) * parseInt(meta)
    const custoTrafego = receitaPrevista * 0.10
    const imposto = receitaPrevista * 0.08
    const custoDeslocamento = parseFloat(deslocProf) + parseFloat(deslocEquipe)
    await supabase.from('financeiro_turma').insert({
      turma_id: turma.id, receita_prevista: receitaPrevista, custo_professores: custoProfessores,
      custo_trafego_previsto: custoTrafego, imposto_previsto: imposto, custo_deslocamento: custoDeslocamento,
      margem_prevista: receitaPrevista - custoProfessores - custoTrafego - imposto - custoDeslocamento,
      break_even_matriculas: parseInt(meta),
    })

    setMensagem('Turma aberta!')
    setAbrirForm(false); setProdutoId(''); setCidadeId(''); setSalaId(''); setProfessorId('')
    setProfPorModulo({}); setDiasAula([]); setModulos([]); setDeslocProf('0'); setDeslocEquipe('0'); setCodigoTurma('')
    carregarTurmas(); setSalvando(false)
  }

  const cidadeSelecionada = cidades.find(c => c.id === cidadeId)
  const isExterna = cidadeSelecionada?.tipo === 'cidade_externa'
  const produtoSelecionado = produtos.find(p => p.id === produtoId)
  const diasPorModulo = modulos.length > 0 ? modulos.map(mod => ({ modulo: mod, dias: diasAula.map((d, i) => ({ ...d, index: i })).filter(d => d.modulo_id === mod.id) })) : null

  return (
    <div style={{ padding: '40px', minHeight: '100vh', backgroundColor: '#1c1c1e' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#ffffff', margin: 0 }}>Turmas</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>{turmas.length} turma{turmas.length !== 1 ? 's' : ''} cadastrada{turmas.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setAbrirForm(!abrirForm)}
          style={{ backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          + Abrir turma
        </button>
      </div>

      {abrirForm && (
        <div style={{ ...card, padding: '28px', marginBottom: '28px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '20px', marginTop: 0 }}>Nova turma</h2>
          <form onSubmit={handleSalvar}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Código da turma</label>
              <input value={codigoTurma} onChange={e => setCodigoTurma(e.target.value)} placeholder="Ex: reels-lajeado-jul25" style={inp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Produto</label>
                <select value={produtoId} onChange={e => setProdutoId(e.target.value)} required style={{ ...sel, width: '100%' }}>
                  <option value="">Selecione</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Cidade</label>
                <select value={cidadeId} onChange={e => setCidadeId(e.target.value)} required style={{ ...sel, width: '100%' }}>
                  <option value="">Selecione</option>
                  {cidades.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Sala</label>
                <select value={salaId} onChange={e => setSalaId(e.target.value)} required style={{ ...sel, width: '100%' }}>
                  <option value="">Selecione</option>
                  {salasFiltradas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Preço R$</label>
                <input value={preco} onChange={e => setPreco(e.target.value)} type="number" required style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Vagas</label>
                <input value={vagas} onChange={e => setVagas(e.target.value)} type="number" required style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Mínimo para não cancelar</label>
                <input value={meta} onChange={e => setMeta(e.target.value)} type="number" required style={inp} />
              </div>
            </div>

            {produtoSelecionado && modulos.length === 0 && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Professor</label>
                <select value={professorId} onChange={e => setProfessorId(e.target.value)} style={{ ...sel, width: '100%' }}>
                  <option value="">Selecione</option>
                  {professores.map(p => <option key={p.id} value={p.id}>{p.nome} — R$ {p.diaria_reais}/dia</option>)}
                </select>
              </div>
            )}

            {produtoSelecionado && diasAula.length > 0 && (
              <div style={{ ...card, marginBottom: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #3a3a3c' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#d1d1d1' }}>Datas e horários</span>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  {diasPorModulo ? diasPorModulo.map(({ modulo, dias }) => (
                    <div key={modulo.id} style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#a78bfa' }}>Módulo {modulo.ordem} — {modulo.nome}</span>
                        <select value={profPorModulo[modulo.id] || ''} onChange={e => setProfPorModulo(prev => ({ ...prev, [modulo.id]: e.target.value }))} style={{ ...sel, fontSize: '12px', padding: '6px 10px' }}>
                          <option value="">Professor</option>
                          {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      </div>
                      {dias.map((dia, i) => (
                        <div key={dia.index} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#6b7280', width: '48px' }}>Dia {i + 1}</span>
                          <input type="date" value={dia.data} onChange={e => atualizarDia(dia.index, 'data', e.target.value)} required style={{ ...inp, width: 'auto' }} />
                          <input type="time" value={dia.horario_inicio} onChange={e => atualizarDia(dia.index, 'horario_inicio', e.target.value)} style={{ ...inp, width: '110px' }} />
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>até</span>
                          <input type="time" value={dia.horario_fim} onChange={e => atualizarDia(dia.index, 'horario_fim', e.target.value)} style={{ ...inp, width: '110px' }} />
                        </div>
                      ))}
                    </div>
                  )) : diasAula.map((dia, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280', width: '48px' }}>Dia {i + 1}</span>
                      <input type="date" value={dia.data} onChange={e => atualizarDia(i, 'data', e.target.value)} required style={{ ...inp, width: 'auto' }} />
                      <input type="time" value={dia.horario_inicio} onChange={e => atualizarDia(i, 'horario_inicio', e.target.value)} style={{ ...inp, width: '110px' }} />
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>até</span>
                      <input type="time" value={dia.horario_fim} onChange={e => atualizarDia(i, 'horario_fim', e.target.value)} style={{ ...inp, width: '110px' }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isExterna && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', backgroundColor: '#431407', borderRadius: '10px', padding: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#fb923c', marginBottom: '6px' }}>Deslocamento professor R$</label>
                  <input value={deslocProf} onChange={e => setDeslocProf(e.target.value)} type="number" style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#fb923c', marginBottom: '6px' }}>Deslocamento equipe R$</label>
                  <input value={deslocEquipe} onChange={e => setDeslocEquipe(e.target.value)} type="number" style={inp} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => setAbrirForm(false)}
                style={{ backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="submit" disabled={salvando}
                style={{ backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                {salvando ? 'Salvando...' : 'Abrir turma'}
              </button>
            </div>
            {mensagem && <p style={{ marginTop: '12px', fontSize: '14px', color: mensagem.includes('Erro') ? '#f87171' : '#4ade80' }}>{mensagem}</p>}
          </form>
        </div>
      )}

      {/* Lista de turmas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {turmas.length === 0 ? (
          <div style={{ ...card, padding: '40px', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', color: '#6b7280', margin: 0 }}>Nenhuma turma cadastrada ainda.</p>
          </div>
        ) : turmas.map(t => {
          const s = statusCor[t.status] || statusCor.planejada
          return (
            <div key={t.id} onClick={() => window.location.href = `/dashboard/turmas/${t.id}`}
              style={{ ...card, padding: '20px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ width: '4px', height: '48px', borderRadius: '4px', backgroundColor: s.color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>{t.produtos?.nome}</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '3px' }}>
                    {t.cidades?.nome}
                    {t.codigo && <span style={{ marginLeft: '10px', color: '#6b7280', fontFamily: 'monospace' }}>{t.codigo}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>Início</div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff', marginTop: '2px' }}>
                    {new Date(t.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>Fim</div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff', marginTop: '2px' }}>
                    {new Date(t.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>Preço</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#4ade80', marginTop: '2px' }}>
                    R$ {t.preco_venda}
                  </div>
                </div>
                <span style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px', backgroundColor: s.bg, color: s.color, fontWeight: '500' }}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}