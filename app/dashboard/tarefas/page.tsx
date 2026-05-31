'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Tarefa = {
  id: string
  titulo: string
  descricao: string
  setor: string
  tipo: string
  data_prazo: string
  status: string
  prioridade: string
  turmas: { produtos: { nome: string }; cidades: { nome: string } } | null
}

const setorCor: Record<string, { bg: string; color: string }> = {
  operacoes: { bg: '#451a03', color: '#fb923c' },
  marketing: { bg: '#450a0a', color: '#f87171' },
  comercial: { bg: '#172554', color: '#60a5fa' },
  financeiro: { bg: '#042f2e', color: '#34d399' },
  pos_venda: { bg: '#052e16', color: '#4ade80' },
}

const setorNome: Record<string, string> = {
  operacoes: 'Operações', marketing: 'Marketing', comercial: 'Comercial',
  financeiro: 'Financeiro', pos_venda: 'Pós-venda',
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const input = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Tarefas() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [filtroSetor, setFiltroSetor] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [carregando, setCarregando] = useState(true)
  const [novaAvulsa, setNovaAvulsa] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const [avTitulo, setAvTitulo] = useState('')
  const [avDescricao, setAvDescricao] = useState('')
  const [avSetor, setAvSetor] = useState('operacoes')
  const [avPrazo, setAvPrazo] = useState('')
  const [avPrioridade, setAvPrioridade] = useState('normal')

  useEffect(() => { carregarTarefas() }, [])

  async function carregarTarefas() {
    setCarregando(true)
    const { data } = await supabase.from('tarefas').select('*, turmas(produtos(nome), cidades(nome))').order('data_prazo', { ascending: true })
    if (data) setTarefas(data)
    setCarregando(false)
  }

  async function atualizarStatus(id: string, novoStatus: string) {
    await supabase.from('tarefas').update({ status: novoStatus, concluida_em: novoStatus === 'concluida' ? new Date().toISOString() : null }).eq('id', id)
    carregarTarefas()
  }

  async function salvarAvulsa(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    const { error } = await supabase.from('tarefas').insert({ titulo: avTitulo, descricao: avDescricao, setor: avSetor, data_prazo: avPrazo, prioridade: avPrioridade, tipo: 'avulsa', tipo_entrega: 'tarefa', status: 'pendente', turma_id: null })
    if (!error) { setMensagem('Tarefa criada!'); setAvTitulo(''); setAvDescricao(''); setAvPrazo(''); setNovaAvulsa(false); carregarTarefas() }
    setSalvando(false)
  }

  function isAtrasada(prazo: string, status: string) {
    if (status === 'concluida') return false
    return new Date(prazo + 'T23:59:59') < new Date()
  }

  const tarefasFiltradas = tarefas.filter(t => {
    const statusReal = isAtrasada(t.data_prazo, t.status) ? 'atrasada' : t.status
    return (filtroSetor === 'todos' || t.setor === filtroSetor) &&
      (filtroStatus === 'todos' || statusReal === filtroStatus) &&
      (filtroTipo === 'todos' || t.tipo === filtroTipo)
  })

  const contadores = {
    atrasadas: tarefas.filter(t => isAtrasada(t.data_prazo, t.status)).length,
    pendentes: tarefas.filter(t => t.status === 'pendente' && !isAtrasada(t.data_prazo, t.status)).length,
    concluidas: tarefas.filter(t => t.status === 'concluida').length,
    avulsas: tarefas.filter(t => t.tipo === 'avulsa').length,
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff' }}>Tarefas</h1>
        <button onClick={() => setNovaAvulsa(!novaAvulsa)} style={btnPrimary}>+ Nova tarefa</button>
      </div>

      {/* Contadores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Atrasadas', val: contadores.atrasadas, cor: '#f87171', bg: '#450a0a', filtro: () => setFiltroStatus('atrasada') },
          { label: 'Pendentes', val: contadores.pendentes, cor: '#9ca3af', bg: '#2c2c2e', filtro: () => setFiltroStatus('pendente') },
          { label: 'Concluídas', val: contadores.concluidas, cor: '#4ade80', bg: '#052e16', filtro: () => setFiltroStatus('concluida') },
          { label: 'Avulsas', val: contadores.avulsas, cor: '#a78bfa', bg: '#2e1065', filtro: () => setFiltroTipo('avulsa') },
        ].map(item => (
          <div key={item.label} onClick={item.filtro}
            style={{ backgroundColor: item.bg, border: '1px solid #3a3a3c', borderRadius: '12px', padding: '20px', cursor: 'pointer' }}>
            <div style={{ fontSize: '32px', fontWeight: '700', color: item.cor }}>{item.val}</div>
            <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Form nova avulsa */}
      {novaAvulsa && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Nova tarefa avulsa</div>
          <form onSubmit={salvarAvulsa}>
            <input value={avTitulo} onChange={e => setAvTitulo(e.target.value)} placeholder="Título da tarefa" required style={{ ...input, marginBottom: '12px' }} />
            <textarea value={avDescricao} onChange={e => setAvDescricao(e.target.value)} placeholder="Descrição (opcional)" rows={2}
              style={{ ...input, resize: 'none', marginBottom: '12px' } as React.CSSProperties} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <select value={avSetor} onChange={e => setAvSetor(e.target.value)} style={select}>
                <option value="operacoes">Operações</option>
                <option value="marketing">Marketing</option>
                <option value="comercial">Comercial</option>
                <option value="financeiro">Financeiro</option>
                <option value="pos_venda">Pós-venda</option>
              </select>
              <select value={avPrioridade} onChange={e => setAvPrioridade(e.target.value)} style={select}>
                <option value="normal">Prioridade normal</option>
                <option value="urgente">Urgente</option>
              </select>
              <input type="date" value={avPrazo} onChange={e => setAvPrazo(e.target.value)} required style={input} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setNovaAvulsa(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Salvando...' : 'Criar tarefa'}</button>
            </div>
          </form>
          {mensagem && <p style={{ marginTop: '12px', fontSize: '14px', color: '#34d399' }}>{mensagem}</p>}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)} style={{ ...select, width: 'auto' }}>
          <option value="todos">Todos os setores</option>
          <option value="operacoes">Operações</option>
          <option value="marketing">Marketing</option>
          <option value="comercial">Comercial</option>
          <option value="financeiro">Financeiro</option>
          <option value="pos_venda">Pós-venda</option>
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...select, width: 'auto' }}>
          <option value="todos">Todos os status</option>
          <option value="atrasada">Atrasadas</option>
          <option value="pendente">Pendentes</option>
          <option value="em_andamento">Em andamento</option>
          <option value="concluida">Concluídas</option>
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...select, width: 'auto' }}>
          <option value="todos">Automáticas e avulsas</option>
          <option value="prevista">Só automáticas</option>
          <option value="avulsa">Só avulsas</option>
        </select>
        <button onClick={() => { setFiltroSetor('todos'); setFiltroStatus('todos'); setFiltroTipo('todos') }}
          style={{ ...btnSecondary, fontSize: '13px' }}>Limpar</button>
      </div>

      {/* Lista */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3a3c' }}>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{tarefasFiltradas.length} tarefa{tarefasFiltradas.length !== 1 ? 's' : ''}</span>
        </div>

        {carregando ? (
          <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Carregando...</p>
        ) : tarefasFiltradas.length === 0 ? (
          <p style={{ padding: '24px', fontSize: '14px', color: '#6b7280' }}>Nenhuma tarefa encontrada.</p>
        ) : (
          <div>
            {tarefasFiltradas.map(t => {
              const atrasada = isAtrasada(t.data_prazo, t.status)
              const urgente = t.prioridade === 'urgente'
              const setor = setorCor[t.setor] || { bg: '#2c2c2e', color: '#9ca3af' }

              return (
                <div key={t.id} style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid #3a3a3c',
                  backgroundColor: atrasada && t.status !== 'concluida' ? '#1a0a0a' : 'transparent',
                  borderLeft: urgente && t.status !== 'concluida' ? '3px solid #f97316' : '3px solid transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <input type="checkbox" checked={t.status === 'concluida'}
                      onChange={() => atualizarStatus(t.id, t.status === 'concluida' ? 'pendente' : 'concluida')}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, marginTop: '2px' }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: t.status === 'concluida' ? '#6b7280' : '#ffffff', textDecoration: t.status === 'concluida' ? 'line-through' : 'none' }}>
                          {t.titulo}
                        </span>
                        {urgente && t.status !== 'concluida' && (
                          <span style={{ fontSize: '11px', backgroundColor: '#431407', color: '#f97316', padding: '2px 8px', borderRadius: '20px' }}>urgente</span>
                        )}
                        {t.tipo === 'avulsa' && (
                          <span style={{ fontSize: '11px', backgroundColor: '#2e1065', color: '#a78bfa', padding: '2px 8px', borderRadius: '20px' }}>avulsa</span>
                        )}
                      </div>
                      {t.descricao && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{t.descricao}</div>}
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {t.turmas ? `${t.turmas.produtos?.nome} — ${t.turmas.cidades?.nome}` : 'Tarefa avulsa'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', backgroundColor: setor.bg, color: setor.color, padding: '3px 8px', borderRadius: '20px' }}>
                        {setorNome[t.setor]}
                      </span>
                      <span style={{ fontSize: '12px', color: atrasada && t.status !== 'concluida' ? '#f87171' : '#6b7280', fontWeight: atrasada ? '600' : '400' }}>
                        {new Date(t.data_prazo + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      {t.status !== 'concluida' && (
                        <select value={t.status} onChange={e => atualizarStatus(t.id, e.target.value)}
                          style={{ ...select, fontSize: '12px', padding: '4px 8px' }}>
                          <option value="pendente">Pendente</option>
                          <option value="em_andamento">Em andamento</option>
                          <option value="concluida">Concluída</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}