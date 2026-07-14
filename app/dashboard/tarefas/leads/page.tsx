'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type TarefaLead = {
  id: string
  lead_id: string
  vendedor_id: string | null
  tipo: string
  titulo: string
  descricao: string
  data_vencimento: string
  concluida: boolean
  concluida_em: string | null
  cancelada: boolean
  criado_em: string
  leads?: { id: string; nome: string; whatsapp: string; etapa: string; atendido_por?: string; turma_id: string; turmas?: { codigo: string; produtos: { nome: string } } }
}

type Vendedor = { id: string; nome: string }

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const sel = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--text)', outline: 'none', cursor: 'pointer' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

const TIPO_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  tentar_contato_d1: { label: 'Tentar contato D+1', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  tentar_contato_d2: { label: 'Tentar contato D+2', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  tentar_contato_d4: { label: 'Tentar contato D+4', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  tentar_contato_d6: { label: 'Tentar contato D+6', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  lote_fecha_hoje_d3: { label: 'Lote fecha hoje', cor: 'var(--green)', bg: 'var(--green-bg)' },
  dar_andamento_d4: { label: 'Dar andamento', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  encerrar_lead_d2: { label: 'Encerrar lead', cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  retornar_prazo: { label: 'Retornar (prazo)', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  verificar_pagamento: { label: 'Verificar pagamento', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
}

function tempoRelativo(dataIso: string): string {
  const data = new Date(dataIso)
  const agora = new Date()
  const diffMs = data.getTime() - agora.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < -24) return `${Math.floor(-diffH / 24)}d atrás`
  if (diffH < 0) return `${-diffH}h atrás`
  if (diffH < 24) return `em ${diffH}h`
  return `em ${Math.floor(diffH / 24)}d`
}

export default function TarefasLeads() {
  const [tarefas, setTarefas] = useState<TarefaLead[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'pendentes' | 'concluidas' | 'canceladas' | 'todas'>('pendentes')
  const [filtroDia, setFiltroDia] = useState('')
  const [filtroAtendido, setFiltroAtendido] = useState<'geral' | 'ia' | 'humano'>('geral')
  const [mensagem, setMensagem] = useState('')
  const [meuPerfil, setMeuPerfil] = useState<any>(null)
  const [concluindoId, setConcluindoId] = useState<string | null>(null)
  const [obsConcluir, setObsConcluir] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: p } = await supabase.from('usuarios_perfil').select('id, papel').eq('id', session.user.id).single()
      if (p) setMeuPerfil(p)
    }
    init()
  }, [])

  useEffect(() => { if (meuPerfil) carregar() }, [meuPerfil, filtroVendedor, filtroStatus, filtroAtendido])

  async function carregar() {
    setCarregando(true)

    const leadSel = `leads${filtroAtendido !== 'geral' ? '!inner' : ''}(id, nome, whatsapp, etapa, atendido_por, turma_id, turmas(codigo, produtos(nome)))`
    let query = supabase.from('tarefas_lead')
      .select(`*, ${leadSel}`)
      .order('data_vencimento', { ascending: true })

    if (filtroAtendido !== 'geral') query = query.eq('leads.atendido_por', filtroAtendido)
    if (meuPerfil && meuPerfil.papel !== 'admin') query = query.eq('vendedor_id', meuPerfil.id)
    else if (filtroVendedor) query = query.eq('vendedor_id', filtroVendedor)
    if (filtroStatus === 'pendentes') query = query.eq('concluida', false).eq('cancelada', false)
    if (filtroStatus === 'concluidas') query = query.eq('concluida', true)
    if (filtroStatus === 'canceladas') query = query.eq('cancelada', true)

    const [tarRes, vendRes] = await Promise.all([
      query,
      supabase.from('usuarios_perfil')
        .select('id, nome')
        .eq('setor', 'comercial')
        .eq('ativo', true)
        .order('nome'),
    ])

    if (tarRes.data) setTarefas(tarRes.data as any)
    if (vendRes.data) setVendedores(vendRes.data)
    setCarregando(false)
  }

  async function marcarConcluida(tarefa: TarefaLead, observacao = '') {
    // 1. Marca como concluída
    await supabase.from('tarefas_lead').update({
      concluida: true,
      concluida_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    }).eq('id', tarefa.id)

    // 1.5 Registra o andamento que o atendente escreveu (aparece no card do CRM)
    if (observacao.trim()) {
      await supabase.from('lead_andamentos').insert({
        lead_id: tarefa.lead_id,
        vendedor_id: tarefa.vendedor_id,
        tipo: 'observacao',
        observacao: `[${tarefa.titulo}] ${observacao.trim()}`,
      })
    }
    setConcluindoId(null)
    setObsConcluir('')

    // 2. Verifica se tem próxima tarefa na sequência
    const lead = tarefa.leads
    if (lead && tarefa.tipo) {
      const proxima = await fetch('/api/tarefas/spec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: lead.etapa, apos: tarefa.tipo }) }).then(r => r.json()).then(j => j.tarefa).catch(() => null)
      if (proxima) {
        // Calcula vencimento da próxima: data da tarefa concluída + (proxima.diasAposEntrada - diasAposEntrada_atual)
        // Pra simplificar: vence hoje + 1 dia (1 dia depois da atual)
        // Solução melhor: usar a hora atual + diferença de dias entre as duas
        const vencimento = new Date()
        vencimento.setDate(vencimento.getDate() + 1)

        await supabase.from('tarefas_lead').insert({
          lead_id: lead.id,
          vendedor_id: tarefa.vendedor_id,
          tipo: proxima.chave,
          titulo: `${proxima.titulo} — ${lead.nome}`,
          descricao: proxima.descricao,
          data_vencimento: vencimento.toISOString(),
        })

        await supabase.from('lead_andamentos').insert({
          lead_id: lead.id,
          vendedor_id: tarefa.vendedor_id,
          tipo: 'tarefa_criada',
          observacao: `Sistema criou próxima tarefa após conclusão: ${proxima.titulo}`,
        })

        setMensagem(`Tarefa concluída. Próxima criada: ${proxima.titulo}`)
        setTimeout(() => setMensagem(''), 3000)
      }
    }

    carregar()
  }

  async function desmarcarConcluida(tarefaId: string) {
    await supabase.from('tarefas_lead').update({
      concluida: false,
      concluida_em: null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', tarefaId)
    carregar()
  }

  async function descancelar(tarefaId: string) {
    await supabase.from('tarefas_lead').update({
      cancelada: false,
      cancelada_em: null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', tarefaId)
    carregar()
  }

  const agora = new Date()
  // filtro por dia (data de vencimento)
  const base = filtroDia
    ? tarefas.filter(t => new Date(t.data_vencimento).toDateString() === new Date(filtroDia + 'T12:00:00').toDateString())
    : tarefas
  const tarefasAtrasadas = base.filter(t => !t.concluida && !t.cancelada && new Date(t.data_vencimento) < agora)
  const tarefasHoje = base.filter(t => {
    if (t.concluida || t.cancelada) return false
    const v = new Date(t.data_vencimento)
    return v.toDateString() === agora.toDateString() && v >= agora
  })
  const tarefasFuturas = base.filter(t => !t.concluida && !t.cancelada && new Date(t.data_vencimento) > agora && new Date(t.data_vencimento).toDateString() !== agora.toDateString())
  const tarefasConcluidas = base.filter(t => t.concluida)
  const tarefasCanceladas = base.filter(t => t.cancelada)

  function renderTarefa(t: TarefaLead) {
    const tipo = TIPO_LABEL[t.tipo] || { label: t.tipo, cor: 'var(--text-muted)', bg: 'var(--surface-2)' }
    const venc = new Date(t.data_vencimento)
    const atrasada = !t.concluida && !t.cancelada && venc < agora
    return (
      <div key={t.id} style={{ ...card, padding: 14, opacity: (t.concluida || t.cancelada) ? 0.6 : 1, border: atrasada ? '1px solid var(--red)' : '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: tipo.bg, color: tipo.cor, fontWeight: 600, textTransform: 'uppercase' }}>
                {tipo.label}
              </span>
              {t.leads?.atendido_por === 'ia' && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-bg)', color: 'var(--accent-soft)', fontWeight: 700 }}>🤖 IA</span>
              )}
              {atrasada && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--red-bg)', color: 'var(--red)', fontWeight: 600 }}>
                  ⚠ Atrasada
                </span>
              )}
              {t.concluida && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600 }}>
                  ✓ Concluída
                </span>
              )}
              {t.cancelada && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Cancelada
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.titulo}</div>
            {t.descricao && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.descricao}</div>}
            {t.leads && (
              <div style={{ fontSize: 11, color: 'var(--accent-soft)', marginTop: 6 }}>
                Lead: <Link href={`/dashboard/crm?lead=${t.leads.id}`} style={{ color: 'var(--text)', fontWeight: 700, textDecoration: 'underline' }}>{t.leads.nome}</Link>
                {t.leads.whatsapp && (() => { const n = t.leads.whatsapp.replace(/\D/g, ''); const wa = n ? `https://wa.me/${n.startsWith('55') ? n : '55' + n}` : null; return wa ? <a href={wa} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: 'var(--green-strong)', textDecoration: 'none', fontWeight: 600 }}>📞 {t.leads.whatsapp}</a> : <span> · {t.leads.whatsapp}</span> })()}
                {t.leads.turmas?.codigo && <span style={{ marginLeft: 6, padding: '1px 6px', background: 'var(--accent-bg)', borderRadius: 4 }}>{t.leads.turmas.codigo}</span>}
              </div>
            )}
            <div style={{ fontSize: 10, color: atrasada ? 'var(--red)' : 'var(--text-faint)', marginTop: 6 }}>
              Vence: {venc.toLocaleString('pt-BR')} · {tempoRelativo(t.data_vencimento)}
            </div>
          </div>
          <div>
            {!t.concluida && !t.cancelada && concluindoId !== t.id && (
              <button onClick={() => { setConcluindoId(t.id); setObsConcluir('') }} style={btnPrimary}>✓ Concluir</button>
            )}
            {t.concluida && (
              <button onClick={() => desmarcarConcluida(t.id)} style={btnSecondary}>Reabrir</button>
            )}
            {t.cancelada && (
              <button onClick={() => descancelar(t.id)} style={btnSecondary}>Restaurar</button>
            )}
          </div>
        </div>
        {concluindoId === t.id && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>O que aconteceu nesse contato? (vai pro andamento do lead no CRM)</div>
            <textarea autoFocus value={obsConcluir} onChange={e => setObsConcluir(e.target.value)}
              placeholder="Ex: Falei com o lead, pediu pra retornar quinta. Demonstrou interesse na turma..."
              style={{ width: '100%', minHeight: 70, resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 10, fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setConcluindoId(null); setObsConcluir('') }} style={btnSecondary}>Cancelar</button>
              <button onClick={() => marcarConcluida(t, obsConcluir)} style={btnPrimary}>✓ Salvar e concluir</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Tarefas de Leads</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>
            Tarefas automáticas criadas pelo sistema durante o ciclo de vida dos leads
          </p>
        </div>

        {mensagem && (
          <div style={{ padding: 12, marginBottom: 16, background: 'var(--green-bg)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--green)', margin: 0 }}>{mensagem}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <select style={sel} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)}>
            <option value="pendentes">Pendentes</option>
            <option value="concluidas">Concluídas</option>
            <option value="canceladas">Canceladas</option>
            <option value="todas">Todas</option>
          </select>
          <select style={sel} value={filtroAtendido} onChange={e => setFiltroAtendido(e.target.value as any)} title="Quem atende o lead">
            <option value="geral">Geral (IA + humano)</option>
            <option value="humano">👤 Só humano</option>
            <option value="ia">🤖 Só IA</option>
          </select>
          <input type="date" style={sel} value={filtroDia} onChange={e => setFiltroDia(e.target.value)} title="Filtrar por dia de vencimento" />
          {filtroDia && <button onClick={() => setFiltroDia('')} style={btnSecondary}>Limpar dia</button>}
          {meuPerfil?.papel === 'admin' && (
            <select style={sel} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="">Todos vendedores</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          )}
          {filtroVendedor && (
            <button onClick={() => setFiltroVendedor('')} style={btnSecondary}>Limpar</button>
          )}
        </div>

        {carregando ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando...</p>
        ) : tarefas.length === 0 ? (
          <div style={{ ...card, padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--green-strong)', margin: 0, fontWeight: 500 }}>✓ Tudo em dia</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6, margin: 0 }}>
              Nenhuma tarefa {filtroStatus === 'pendentes' ? 'pendente' : filtroStatus === 'concluidas' ? 'concluída' : filtroStatus === 'canceladas' ? 'cancelada' : ''} no momento.
            </p>
          </div>
        ) : (
          <>
            {filtroStatus === 'pendentes' && (
              <>
                {tarefasAtrasadas.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', marginBottom: 8 }}>
                      ⚠ Atrasadas ({tarefasAtrasadas.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {tarefasAtrasadas.map(renderTarefa)}
                    </div>
                  </div>
                )}

                {tarefasHoje.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 8 }}>
                      Hoje ({tarefasHoje.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {tarefasHoje.map(renderTarefa)}
                    </div>
                  </div>
                )}

                {tarefasFuturas.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                      Próximas ({tarefasFuturas.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {tarefasFuturas.map(renderTarefa)}
                    </div>
                  </div>
                )}
              </>
            )}

            {filtroStatus === 'concluidas' && tarefasConcluidas.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tarefasConcluidas.map(renderTarefa)}
              </div>
            )}

            {filtroStatus === 'canceladas' && tarefasCanceladas.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tarefasCanceladas.map(renderTarefa)}
              </div>
            )}

            {filtroStatus === 'todas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tarefas.map(renderTarefa)}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
