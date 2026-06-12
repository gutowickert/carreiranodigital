'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { getPrimeiraTarefa, SEQUENCIA_POR_ETAPA } from '@/lib/sequencia-tarefas'

type Lead = {
  id: string
  nome: string
  whatsapp: string
  email: string
  origem: string
  codigo_turma: string
  turma_id: string
  vendedor_id: string
  etapa: string
  motivo_perda_id: string
  motivo_ganho: string
  mensagem_inicial: string
  valor_venda: number
  observacoes: string
  criado_em: string
  prazo_prometido: string
  fbclid: string
  negocio: string
  tamanho_equipe: string
  investimento_marketing: string
  gera_leads_digital: string
  maior_problema: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  turmas?: { id: string; codigo: string; produtos: { nome: string }; cidades: { nome: string } }
  temTarefaAtrasada?: boolean
}

type Turma = { id: string; codigo: string; data_inicio: string; preco_venda: number; produtos: { nome: string }; cidades: { nome: string } }
type Vendedor = { id: string; nome: string }
type MotivoPerda = { id: string; nome: string }
type MatriculaDisponivel = { id: string; aluno_id: string; valor_pago: number; data_compra: string; aluno_nome?: string; aluno_cpf?: string }

const ETAPAS = [
  { id: 'aguardando_atendimento', label: 'Aguardando atendimento', cor: '#9ca3af', bg: '#1f2937' },
  { id: 'atendimento_inicial', label: 'Atendimento inicial', cor: '#60a5fa', bg: '#172554' },
  { id: 'lote_preco_ok', label: 'Lote e preço ok', cor: '#34d399', bg: '#052e16' },
  { id: 'nao_chegou_preco', label: 'Não chegou no preço', cor: '#fb923c', bg: '#431407' },
  { id: 'oferecer_bolsa', label: 'Oferecer bolsa', cor: '#a78bfa', bg: '#2e1065' },
  { id: 'pediu_prazo', label: 'Pediu prazo', cor: '#fbbf24', bg: '#451a03' },
  { id: 'aguardando_pagamento', label: 'Aguardando pagamento', cor: '#06b6d4', bg: '#083344' },
  { id: 'ganho', label: 'Ganho', cor: '#4ade80', bg: '#052e16' },
  { id: 'perda', label: 'Perda', cor: '#f87171', bg: '#450a0a' },
]

const ETAPAS_KANBAN = ETAPAS.filter(e => e.id !== 'ganho' && e.id !== 'perda')

const ORIGEM_LABEL: Record<string, string> = {
  formulario: 'Formulário', whatsapp_site: 'WhatsApp', whatsapp: 'WhatsApp', manual: 'Manual', herospark: 'HeroSpark', outro: 'Outro',
}

const PRAZO_CICLO = 6

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const sel = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

function diaDoCiclo(criadoEm: string): number {
  const inicio = new Date(criadoEm)
  const agora = new Date()
  const diffMs = agora.getTime() - inicio.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export default function CRM() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [motivosPerda, setMotivosPerda] = useState<MotivoPerda[]>([])
  const [visao, setVisao] = useState<'kanban' | 'lista'>('kanban')
  const [filtroTurma, setFiltroTurma] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [leadEditando, setLeadEditando] = useState<Lead | null>(null)
  const [novoLead, setNovoLead] = useState(false)
  const [verFinalizados, setVerFinalizados] = useState(false)
  const [meuPerfil, setMeuPerfil] = useState<any>(null)

  useEffect(() => { carregarTudo() }, [])

  useEffect(() => {
    async function carregarPerfil() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: p } = await supabase.from('usuarios_perfil')
        .select('id, papel, leads_escopo').eq('id', session.user.id).single()
      if (p) setMeuPerfil(p)
    }
    carregarPerfil()
  }, [])
  async function carregarTudo() {
    await Promise.all([carregarLeads(), carregarTurmas(), carregarVendedores(), carregarMotivos()])
  }

  async function carregarLeads() {
    const { data } = await supabase.from('leads')
      .select('*, turmas(id, codigo, produtos(nome), cidades(nome))')
      .order('criado_em', { ascending: false })
    if (!data) return

    // Pra cada lead, verifica se tem tarefa atrasada
    const leadIds = data.map((l: any) => l.id)
    const { data: tarefasAtrasadas } = await supabase.from('tarefas_lead')
      .select('lead_id')
      .in('lead_id', leadIds)
      .eq('concluida', false)
      .eq('cancelada', false)
      .lt('data_vencimento', new Date().toISOString())

    const leadsComTarefaAtrasada = new Set(tarefasAtrasadas?.map((t: any) => t.lead_id) || [])
    const leadsEnriquecidos = data.map((l: any) => ({
      ...l,
      temTarefaAtrasada: leadsComTarefaAtrasada.has(l.id),
    }))

    setLeads(leadsEnriquecidos as any)
  }

  async function carregarTurmas() {
    const { data } = await supabase.from('turmas')
      .select('id, codigo, data_inicio, preco_venda, produtos(nome), cidades(nome)')
      .in('status', ['planejada', 'em_vendas', 'confirmada'])
      .order('data_inicio', { ascending: false })
    if (data) setTurmas(data as any)
  }

  async function carregarVendedores() {
    const { data } = await supabase.from('usuarios_perfil')
      .select('id, nome').eq('setor', 'comercial').eq('ativo', true).order('nome')
    if (data) setVendedores(data)
  }

  async function carregarMotivos() {
    const { data } = await supabase.from('motivos_perda').select('id, nome').eq('ativo', true).order('nome')
    if (data) setMotivosPerda(data)
  }

  async function aplicarRateio(turmaId: string): Promise<string | null> {
    const { data: config } = await supabase.from('vendedor_config_turma')
      .select('vendedor_id, leads_por_ciclo, ordem')
      .eq('turma_id', turmaId).eq('ativo', true).order('ordem')
    if (!config || config.length === 0) return null

    const { data: estado } = await supabase.from('rateio_estado')
      .select('*').eq('turma_id', turmaId).single()

    let proximoVendedor: string
    let novoContador: number

    if (!estado) {
      proximoVendedor = config[0].vendedor_id
      novoContador = 1
    } else {
      const idxAtual = config.findIndex(c => c.vendedor_id === estado.ultimo_vendedor_id)
      const configAtual = idxAtual >= 0 ? config[idxAtual] : config[0]
      if (estado.leads_atribuidos_ciclo >= configAtual.leads_por_ciclo) {
        const proxIdx = (idxAtual + 1) % config.length
        proximoVendedor = config[proxIdx].vendedor_id
        novoContador = 1
      } else {
        proximoVendedor = estado.ultimo_vendedor_id
        novoContador = estado.leads_atribuidos_ciclo + 1
      }
    }

    if (estado) {
      await supabase.from('rateio_estado').update({
        ultimo_vendedor_id: proximoVendedor,
        leads_atribuidos_ciclo: novoContador,
        atualizado_em: new Date().toISOString(),
      }).eq('turma_id', turmaId)
    } else {
      await supabase.from('rateio_estado').insert({
        turma_id: turmaId, ultimo_vendedor_id: proximoVendedor, leads_atribuidos_ciclo: novoContador,
      })
    }
    return proximoVendedor
  }

  // Cancela TODAS as tarefas pendentes do lead (chamado ao mudar de etapa)
  async function cancelarTarefasPendentes(leadId: string) {
    await supabase.from('tarefas_lead').update({
      cancelada: true,
      cancelada_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
      .eq('lead_id', leadId)
      .eq('concluida', false)
      .eq('cancelada', false)
  }

  // Cria a PRIMEIRA tarefa da sequência de uma etapa
  async function criarPrimeiraTarefaDaEtapa(leadId: string, vendedorId: string | null, etapa: string, dataReferencia: Date, leadNome: string) {
    const primeira = getPrimeiraTarefa(etapa)
    if (!primeira) return

    // Data de vencimento = data de referência + N dias
    const vencimento = new Date(dataReferencia)
    vencimento.setDate(vencimento.getDate() + primeira.diasAposEntrada)

    await supabase.from('tarefas_lead').insert({
      lead_id: leadId,
      vendedor_id: vendedorId || null,
      tipo: primeira.chave,
      titulo: `${primeira.titulo} — ${leadNome}`,
      descricao: primeira.descricao,
      data_vencimento: vencimento.toISOString(),
    })

    await supabase.from('lead_andamentos').insert({
      lead_id: leadId,
      vendedor_id: vendedorId || null,
      tipo: 'tarefa_criada',
      observacao: `Sistema criou tarefa: ${primeira.titulo} (vence ${vencimento.toLocaleString('pt-BR')})`,
    })
  }

  // Cria tarefa com data específica (Pediu prazo e Aguardando pagamento)
  async function criarTarefaComData(leadId: string, vendedorId: string | null, tipo: string, titulo: string, descricao: string, dataIso: string) {
    await supabase.from('tarefas_lead').insert({
      lead_id: leadId,
      vendedor_id: vendedorId || null,
      tipo,
      titulo,
      descricao,
      data_vencimento: dataIso,
    })

    await supabase.from('lead_andamentos').insert({
      lead_id: leadId,
      vendedor_id: vendedorId || null,
      tipo: 'tarefa_criada',
      observacao: `Sistema criou tarefa: ${titulo} (vence ${new Date(dataIso).toLocaleString('pt-BR')})`,
    })
  }

  async function moverEtapa(lead: Lead, novaEtapa: string, extras?: { motivoPerdaId?: string; prazoPrometido?: string; dataAgendada?: string }) {
    const agora = new Date()
    const payload: any = { etapa: novaEtapa, atualizado_em: agora.toISOString() }

    if (novaEtapa === 'perda') {
      payload.data_perda = agora.toISOString()
      payload.motivo_perda_id = extras?.motivoPerdaId
    }
    if (novaEtapa === 'pediu_prazo' && extras?.prazoPrometido) {
      payload.prazo_prometido = extras.prazoPrometido
    }

    await supabase.from('leads').update(payload).eq('id', lead.id)
    await supabase.from('lead_andamentos').insert({
      lead_id: lead.id,
      vendedor_id: lead.vendedor_id,
      tipo: 'mudanca_etapa',
      etapa_anterior: lead.etapa,
      etapa_nova: novaEtapa,
      observacao: `Movido para ${ETAPAS.find(e => e.id === novaEtapa)?.label || novaEtapa}`,
    })

    // Cancela tarefas pendentes da etapa anterior
    await cancelarTarefasPendentes(lead.id)

    // Cria primeira tarefa da nova etapa
    if (novaEtapa === 'pediu_prazo' && extras?.prazoPrometido) {
      // Tarefa com data específica (escolhida pelo vendedor)
      await criarTarefaComData(
        lead.id,
        lead.vendedor_id,
        'retornar_prazo',
        `Retornar contato — ${lead.nome}`,
        'Cliente pediu prazo. Retornar contato na data prometida.',
        extras.prazoPrometido
      )
    } else if (novaEtapa === 'aguardando_pagamento' && extras?.dataAgendada) {
      // Tarefa com data específica acordada com cliente
      await criarTarefaComData(
        lead.id,
        lead.vendedor_id,
        'verificar_pagamento',
        `Verificar pagamento — ${lead.nome}`,
        'Cliente disse que vai pagar. Confirmar se pagamento foi efetuado.',
        extras.dataAgendada
      )
    } else if (SEQUENCIA_POR_ETAPA[novaEtapa]?.length > 0) {
      // Tarefa automática conforme sequência da etapa
      await criarPrimeiraTarefaDaEtapa(lead.id, lead.vendedor_id, novaEtapa, agora, lead.nome)
    }

    carregarLeads()
  }

  const soProprios = meuPerfil && meuPerfil.papel !== 'admin' && meuPerfil.leads_escopo === 'proprios'

  const leadsFiltrados = leads.filter(l => {
    if (soProprios && l.vendedor_id !== meuPerfil.id) return false
    if (filtroTurma && l.turma_id !== filtroTurma) return false
    if (filtroVendedor && l.vendedor_id !== filtroVendedor) return false
    return true
  })

  const leadsAtivos = leadsFiltrados.filter(l => l.etapa !== 'ganho' && l.etapa !== 'perda')
  const leadsGanho = leadsFiltrados.filter(l => l.etapa === 'ganho')
  const leadsPerda = leadsFiltrados.filter(l => l.etapa === 'perda')

  const leadsPorEtapa = ETAPAS_KANBAN.map(e => ({
    etapa: e,
    leads: leadsAtivos.filter(l => l.etapa === e.id),
  }))

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>CRM</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{leadsAtivos.length} lead(s) ativos no funil</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setVisao('kanban')}
                style={{ padding: '8px 16px', background: visao === 'kanban' ? '#7c3aed' : 'transparent', color: visao === 'kanban' ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Kanban
              </button>
              <button onClick={() => setVisao('lista')}
                style={{ padding: '8px 16px', background: visao === 'lista' ? '#7c3aed' : 'transparent', color: visao === 'lista' ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Lista
              </button>
            </div>
            <button onClick={() => { setLeadEditando(null); setNovoLead(true); setModalAberto(true) }} style={btnPrimary}>
              + Novo lead
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <select style={sel} value={filtroTurma} onChange={e => setFiltroTurma(e.target.value)}>
            <option value="">Todas as turmas</option>
            {turmas.map(t => (
              <option key={t.id} value={t.id}>
                {t.produtos?.nome} — {t.cidades?.nome} {t.codigo ? '(' + t.codigo + ')' : ''}
              </option>
            ))}
          </select>
          {!soProprios && (
            <select style={sel} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="">Todos vendedores</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          )}
          {(filtroTurma || filtroVendedor) && (
            <button onClick={() => { setFiltroTurma(''); setFiltroVendedor('') }} style={btnSecondary}>Limpar</button>
          )}
        </div>

        {visao === 'kanban' && (
          <>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
              {leadsPorEtapa.map(({ etapa, leads: leadsEtapa }) => (
                <div key={etapa.id} style={{ flex: '0 0 260px', minHeight: 400 }}>
                  <div style={{ background: etapa.bg, border: `1px solid ${etapa.cor}40`, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: etapa.cor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{etapa.label}</span>
                      <span style={{ fontSize: 12, color: etapa.cor }}>{leadsEtapa.length}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {leadsEtapa.map(lead => {
                      const dia = diaDoCiclo(lead.criado_em)
                      const cicloEstourou = dia > PRAZO_CICLO
                      const prazoEstourou = lead.prazo_prometido && new Date(lead.prazo_prometido) < new Date() && lead.etapa === 'pediu_prazo'
                      const tarefaAtrasada = lead.temTarefaAtrasada
                      const alerta = cicloEstourou || prazoEstourou || tarefaAtrasada
                      return (
                        <div key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                          style={{ ...card, padding: 12, cursor: 'pointer', border: alerta ? '1px solid #f87171' : '1px solid #3a3a3c' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>{lead.nome}</div>
                            <div style={{ fontSize: 9, color: alerta ? '#f87171' : '#6b7280', fontWeight: 600 }}>D{dia}</div>
                          </div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{lead.whatsapp || '-'}</div>
                          {lead.turmas && (
                            <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 6, padding: '2px 6px', background: '#2e1065', borderRadius: 4, display: 'inline-block' }}>
                              {lead.turmas.codigo || lead.turmas.produtos?.nome}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <div style={{ fontSize: 10, color: '#6b7280' }}>{ORIGEM_LABEL[lead.origem] || lead.origem}</div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {tarefaAtrasada && (
                                <div style={{ fontSize: 9, color: '#f87171', fontWeight: 600 }}>⚠ tarefa</div>
                              )}
                              {cicloEstourou && (
                                <div style={{ fontSize: 9, color: '#f87171', fontWeight: 600 }}>⚠ ciclo</div>
                              )}
                              {prazoEstourou && (
                                <div style={{ fontSize: 9, color: '#f87171', fontWeight: 600 }}>⚠ prazo</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {leadsEtapa.length === 0 && (
                      <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 11, color: '#6b7280', border: '1px dashed #3a3a3c', borderRadius: 8 }}>
                        Vazio
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, borderTop: '1px solid #3a3a3c', paddingTop: 16 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <button onClick={() => setVerFinalizados(!verFinalizados)} style={btnSecondary}>
                  {verFinalizados ? '▾ Esconder' : '▸ Mostrar'} finalizados
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>Ganho: {leadsGanho.length}</span>
                  <span style={{ color: '#f87171', fontWeight: 600 }}>Perda: {leadsPerda.length}</span>
                </div>
              </div>
              {verFinalizados && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#4ade80', textTransform: 'uppercase', marginBottom: 8 }}>Ganho ({leadsGanho.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                      {leadsGanho.map(lead => (
                        <div key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                          style={{ ...card, padding: 10, cursor: 'pointer' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{lead.nome}</div>
                          <div style={{ fontSize: 10, color: '#34d399', marginTop: 4 }}>R$ {lead.valor_venda?.toFixed(2) || '0,00'}</div>
                        </div>
                      ))}
                      {leadsGanho.length === 0 && <p style={{ fontSize: 11, color: '#6b7280' }}>Nenhum.</p>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#f87171', textTransform: 'uppercase', marginBottom: 8 }}>Perda ({leadsPerda.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                      {leadsPerda.map(lead => (
                        <div key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                          style={{ ...card, padding: 10, cursor: 'pointer' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{lead.nome}</div>
                        </div>
                      ))}
                      {leadsPerda.length === 0 && <p style={{ fontSize: 11, color: '#6b7280' }}>Nenhum.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {visao === 'lista' && (
          <div style={{ ...card, overflow: 'hidden' }}>
            {leadsFiltrados.length === 0 ? (
              <p style={{ padding: 24, fontSize: 14, color: '#6b7280' }}>Nenhum lead no funil.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3c', background: '#1c1c1e' }}>
                    {['Nome', 'WhatsApp', 'Turma', 'Etapa', 'Dia', 'Origem', 'Criado em'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leadsFiltrados.map(lead => {
                    const etapa = ETAPAS.find(e => e.id === lead.etapa)
                    const dia = diaDoCiclo(lead.criado_em)
                    return (
                      <tr key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                        style={{ borderBottom: '1px solid #3a3a3c', cursor: 'pointer' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#fff', fontWeight: 500 }}>{lead.nome}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{lead.whatsapp || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{lead.turmas?.codigo || lead.turmas?.produtos?.nome || '-'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: etapa?.bg, color: etapa?.cor, fontWeight: 500 }}>
                            {etapa?.label || lead.etapa}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: dia > PRAZO_CICLO ? '#f87171' : '#9ca3af' }}>D{dia}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>{ORIGEM_LABEL[lead.origem] || lead.origem}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>
                          {new Date(lead.criado_em).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {modalAberto && (
          <ModalLead
            aberto={modalAberto}
            lead={leadEditando}
            novoLead={novoLead}
            turmas={turmas}
            vendedores={vendedores}
            motivosPerda={motivosPerda}
            aplicarRateio={aplicarRateio}
            moverEtapa={moverEtapa}
            onFechar={() => { setModalAberto(false); setLeadEditando(null); setNovoLead(false); carregarLeads() }}
          />
        )}
      </div>
    </Layout>
  )
}

interface ModalLeadProps {
  aberto: boolean; lead: Lead | null; novoLead: boolean
  turmas: Turma[]; vendedores: Vendedor[]; motivosPerda: MotivoPerda[]
  aplicarRateio: (turmaId: string) => Promise<string | null>
  moverEtapa: (lead: Lead, novaEtapa: string, extras?: { motivoPerdaId?: string; prazoPrometido?: string; dataAgendada?: string }) => Promise<void>
  onFechar: () => void
}

function ModalLead({ aberto, lead, novoLead, turmas, vendedores, motivosPerda, aplicarRateio, moverEtapa, onFechar }: ModalLeadProps) {
  const [form, setForm] = useState<any>({ nome: '', whatsapp: '', email: '', turma_id: '', vendedor_id: '', etapa: 'aguardando_atendimento', origem: 'manual', observacoes: '' })
  const [andamentos, setAndamentos] = useState<any[]>([])
  const [ligando, setLigando] = useState(false)
  const [msgLigacao, setMsgLigacao] = useState('')
  const [ligacoes, setLigacoes] = useState<any[]>([])
  const [novoAndamento, setNovoAndamento] = useState('')
  const [motivoSelecionado, setMotivoSelecionado] = useState('')
  const [prazoData, setPrazoData] = useState('')
  const [prazoHora, setPrazoHora] = useState('14:00')
  const [pagData, setPagData] = useState('')
  const [pagHora, setPagHora] = useState('14:00')
  const [mostrarPerda, setMostrarPerda] = useState(false)
  const [mostrarGanho, setMostrarGanho] = useState(false)
  const [mostrarPrazo, setMostrarPrazo] = useState(false)
  const [mostrarPag, setMostrarPag] = useState(false)

  useEffect(() => {
    if (lead) {
      setForm({
        nome: lead.nome, whatsapp: lead.whatsapp || '', email: lead.email || '',
        turma_id: lead.turma_id || '', vendedor_id: lead.vendedor_id || '',
        etapa: lead.etapa, origem: lead.origem || 'manual',
        observacoes: lead.observacoes || '',
      })
      carregarAndamentos(lead.id)
      carregarLigacoes(lead.id)
    } else {
      setForm({ nome: '', whatsapp: '', email: '', turma_id: '', vendedor_id: '', etapa: 'aguardando_atendimento', origem: 'manual', observacoes: '' })
      setAndamentos([])
      setLigacoes([])
    }
    setMostrarPerda(false); setMostrarGanho(false); setMostrarPrazo(false); setMostrarPag(false)
    setMotivoSelecionado(''); setPrazoData(''); setPagData('')
  }, [lead, aberto])

  async function carregarAndamentos(leadId: string) {
    const { data } = await supabase.from('lead_andamentos')
      .select('*').eq('lead_id', leadId).order('criado_em', { ascending: false })
    if (data) setAndamentos(data)
  }

  async function carregarLigacoes(leadId: string) {
    const { data } = await supabase.from('ligacoes')
      .select('*').eq('lead_id', leadId).order('criado_em', { ascending: false })
    if (data) setLigacoes(data)
  }

  async function ligar() {
    if (!lead) return
    setLigando(true); setMsgLigacao('')
    try {
      const res = await fetch('/api/ligacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      })
      const json = await res.json()
      if (json.ok) {
        setMsgLigacao('Discando... atende no teu Webphone')
        await supabase.from('lead_andamentos').insert({
          lead_id: lead.id, vendedor_id: lead.vendedor_id, tipo: 'ligacao',
          observacao: 'Ligacao iniciada via API4COM',
        })
        carregarAndamentos(lead.id)
      } else {
        setMsgLigacao('Erro: ' + (json.error || 'nao foi possivel ligar'))
      }
    } catch (e: any) {
      setMsgLigacao('Falha: ' + ((e && e.message) || 'erro de rede'))
    } finally {
      setLigando(false)
    }
  }

  async function salvar() {
    let vendedorIdFinal = form.vendedor_id
    if (novoLead && form.turma_id && !form.vendedor_id) {
      const ratrado = await aplicarRateio(form.turma_id)
      if (ratrado) vendedorIdFinal = ratrado
    }
    const codigoTurma = turmas.find(t => t.id === form.turma_id)?.codigo || null

    if (lead) {
      await supabase.from('leads').update({
        nome: form.nome, whatsapp: form.whatsapp || null, email: form.email || null,
        turma_id: form.turma_id || null, codigo_turma: codigoTurma,
        vendedor_id: vendedorIdFinal || null, observacoes: form.observacoes || null,
        atualizado_em: new Date().toISOString(),
      }).eq('id', lead.id)
    } else {
      await supabase.from('leads').insert({
        nome: form.nome, whatsapp: form.whatsapp || null, email: form.email || null,
        turma_id: form.turma_id || null, codigo_turma: codigoTurma,
        vendedor_id: vendedorIdFinal || null, etapa: 'aguardando_atendimento',
        origem: form.origem, observacoes: form.observacoes || null,
      })
    }
    onFechar()
  }

  async function adicionarAndamento() {
    if (!lead || !novoAndamento.trim()) return
    await supabase.from('lead_andamentos').insert({
      lead_id: lead.id, vendedor_id: lead.vendedor_id,
      tipo: 'observacao',
      observacao: novoAndamento,
    })
    setNovoAndamento('')
    carregarAndamentos(lead.id)
  }

  async function confirmarPerda() {
    if (!lead || !motivoSelecionado) return
    await moverEtapa(lead, 'perda', { motivoPerdaId: motivoSelecionado })
    onFechar()
  }

  async function confirmarPrazo() {
    if (!lead || !prazoData) return
    const prazoIso = new Date(`${prazoData}T${prazoHora}:00`).toISOString()
    await moverEtapa(lead, 'pediu_prazo', { prazoPrometido: prazoIso })
    onFechar()
  }

  async function confirmarAguardandoPag() {
    if (!lead || !pagData) return
    const dataIso = new Date(`${pagData}T${pagHora}:00`).toISOString()
    await moverEtapa(lead, 'aguardando_pagamento', { dataAgendada: dataIso })
    onFechar()
  }

  if (!aberto) return null

  const labelStyle = { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' as const }
  const turmaSelecionada = turmas.find(t => t.id === form.turma_id)
  const dia = lead ? diaDoCiclo(lead.criado_em) : 0
  const cicloEstourou = dia > PRAZO_CICLO

  // --- Seção de qualificação (somente leitura) ---
  const qualLinhas: [string, string][] = lead ? ([
    ['Negócio', lead.negocio],
    ['Tamanho da equipe', lead.tamanho_equipe],
    ['Investimento em marketing', lead.investimento_marketing],
    ['Já gera leads pelo digital', lead.gera_leads_digital],
    ['Maior problema', lead.maior_problema],
  ].filter(([, v]) => v && String(v).trim()) as [string, string][]) : []
  const temTracking = !!(lead && (lead.utm_source || lead.utm_medium || lead.utm_campaign || lead.utm_content || lead.fbclid))
  const tagStyle = { fontSize: 11, color: '#a78bfa', background: '#2e1065', border: '1px solid #a78bfa30', borderRadius: 4, padding: '2px 8px' } as React.CSSProperties

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 12, padding: 24, width: 600, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#fff', margin: 0 }}>{novoLead ? 'Novo lead' : form.nome}</h2>
            {!novoLead && lead && (
              <div style={{ fontSize: 11, color: cicloEstourou ? '#f87171' : '#9ca3af', marginTop: 4 }}>
                Dia {dia} do ciclo {cicloEstourou && '⚠ ciclo terminou'}
              </div>
            )}
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>x</button>
        </div>

        {!novoLead && lead && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={ligar} disabled={ligando || !form.whatsapp}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #4ade8040', background: '#052e16', color: '#4ade80', fontSize: 13, fontWeight: 600, cursor: (ligando || !form.whatsapp) ? 'default' : 'pointer', opacity: (ligando || !form.whatsapp) ? 0.6 : 1 }}>
              📞 {ligando ? 'Discando...' : 'Ligar'}
            </button>
            <button disabled title="Em breve — chat de WhatsApp dentro do lead"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #25D36640', background: '#0b2e1a', color: '#25D366', fontSize: 13, fontWeight: 600, cursor: 'default', opacity: 0.5 }}>
              💬 WhatsApp <span style={{ fontSize: 9, opacity: 0.8 }}>(em breve)</span>
            </button>
            {msgLigacao && <span style={{ fontSize: 12, color: (msgLigacao.includes('Erro') || msgLigacao.includes('Falha')) ? '#f87171' : '#9ca3af' }}>{msgLigacao}</span>}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Nome *</label>
            <input style={inp} value={form.nome} onChange={e => setForm((f: any) => ({ ...f, nome: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>WhatsApp</label>
            <input style={inp} value={form.whatsapp} onChange={e => setForm((f: any) => ({ ...f, whatsapp: e.target.value }))} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Email</label>
          <input style={inp} value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Turma</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.turma_id} onChange={e => setForm((f: any) => ({ ...f, turma_id: e.target.value }))}>
              <option value="">—</option>
              {turmas.map(t => (
                <option key={t.id} value={t.id}>
                  {t.produtos?.nome} — {t.cidades?.nome} {t.codigo ? '(' + t.codigo + ')' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Vendedor {novoLead && form.turma_id && '(auto se vazio)'}</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.vendedor_id} onChange={e => setForm((f: any) => ({ ...f, vendedor_id: e.target.value }))}>
              <option value="">—</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
        </div>

        {novoLead && (
          <div>
            <label style={labelStyle}>Origem</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.origem} onChange={e => setForm((f: any) => ({ ...f, origem: e.target.value }))}>
              <option value="manual">Manual</option>
              <option value="formulario">Formulário</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="herospark">HeroSpark</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>Observações</label>
          <textarea style={{ ...inp, resize: 'none', minHeight: 60 } as React.CSSProperties} rows={2}
            value={form.observacoes} onChange={e => setForm((f: any) => ({ ...f, observacoes: e.target.value }))} />
        </div>

        {!novoLead && lead && (
          <div style={{ borderTop: '1px solid #3a3a3c', paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Qualificação (formulário)
            </div>
            {qualLinhas.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {qualLinhas.map(([rotulo, valor]) => (
                  <div key={rotulo} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 8, alignItems: 'start' }}>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{rotulo}</div>
                    <div style={{ fontSize: 13, color: '#fff', whiteSpace: 'pre-wrap' }}>{valor}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                Sem dados de qualificação (lead não veio do formulário ou campos em branco).
              </p>
            )}
            {temTracking && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #3a3a3c', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {lead.utm_source && <span style={tagStyle}>utm_source: {lead.utm_source}</span>}
                {lead.utm_medium && <span style={tagStyle}>utm_medium: {lead.utm_medium}</span>}
                {lead.utm_campaign && <span style={tagStyle}>utm_campaign: {lead.utm_campaign}</span>}
                {lead.utm_content && <span style={tagStyle}>utm_content: {lead.utm_content}</span>}
                {lead.fbclid && <span style={tagStyle}>fbclid ✓</span>}
              </div>
            )}
          </div>
        )}

        {!novoLead && lead && (
          <div style={{ borderTop: '1px solid #3a3a3c', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ligações</div>
              <button onClick={() => carregarLigacoes(lead.id)} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 11, cursor: 'pointer' }}>↻ atualizar</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {ligacoes.map(l => {
                const s = l.duracao || 0
                const dur = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
                return (
                  <div key={l.id} style={{ padding: 10, background: '#1c1c1e', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#d1d1d1' }}>{new Date(l.criado_em).toLocaleString('pt-BR')}</span>
                      <span style={{ color: l.status === 'encerrada' ? '#34d399' : '#fbbf24' }}>
                        {l.status === 'encerrada' ? dur : (l.status || 'iniciada')}
                      </span>
                    </div>
                    {l.gravacao_url ? (
                      <audio controls src={l.gravacao_url} style={{ width: '100%', marginTop: 6, height: 34 }} />
                    ) : (
                      <div style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>
                        {l.status === 'encerrada' ? 'Sem gravação' : 'Aguardando resultado (clica ↻ após desligar)'}
                      </div>
                    )}
                  </div>
                )
              })}
              {ligacoes.length === 0 && <p style={{ fontSize: 12, color: '#6b7280' }}>Nenhuma ligação ainda.</p>}
            </div>
          </div>
        )}

        {!novoLead && lead && lead.etapa !== 'ganho' && lead.etapa !== 'perda' && (
          <>
            <div style={{ borderTop: '1px solid #3a3a3c', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Mover etapa</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ETAPAS.filter(e => e.id !== lead.etapa && e.id !== 'ganho' && e.id !== 'perda' && e.id !== 'pediu_prazo' && e.id !== 'aguardando_pagamento').map(e => (
                  <button key={e.id} onClick={() => moverEtapa(lead, e.id).then(onFechar)}
                    style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${e.cor}40`, background: e.bg, color: e.cor, fontSize: 11, cursor: 'pointer' }}>
                    → {e.label}
                  </button>
                ))}
                <button onClick={() => { setMostrarPrazo(!mostrarPrazo); setMostrarGanho(false); setMostrarPerda(false); setMostrarPag(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #fbbf2440', background: '#451a03', color: '#fbbf24', fontSize: 11, cursor: 'pointer' }}>
                  → Pediu prazo
                </button>
                <button onClick={() => { setMostrarPag(!mostrarPag); setMostrarGanho(false); setMostrarPerda(false); setMostrarPrazo(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #06b6d440', background: '#083344', color: '#06b6d4', fontSize: 11, cursor: 'pointer' }}>
                  → Aguardando pagamento
                </button>
                <button onClick={() => { setMostrarGanho(!mostrarGanho); setMostrarPrazo(false); setMostrarPerda(false); setMostrarPag(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #4ade8040', background: '#052e16', color: '#4ade80', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✓ Ganho
                </button>
                <button onClick={() => { setMostrarPerda(!mostrarPerda); setMostrarPrazo(false); setMostrarGanho(false); setMostrarPag(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #f8717140', background: '#450a0a', color: '#f87171', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✗ Perda
                </button>
              </div>

              {mostrarPrazo && (
                <div style={{ marginTop: 12, padding: 12, background: '#451a03', borderRadius: 8, border: '1px solid #fbbf2440' }}>
                  <label style={labelStyle}>Quando cliente prometeu retornar? *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" style={inp} value={prazoData} onChange={e => setPrazoData(e.target.value)} />
                    <input type="time" style={inp} value={prazoHora} onChange={e => setPrazoHora(e.target.value)} />
                  </div>
                  <button onClick={confirmarPrazo} disabled={!prazoData}
                    style={{ ...btnPrimary, background: '#d97706', marginTop: 8, width: '100%', opacity: prazoData ? 1 : 0.5 }}>
                    Marcar prazo e criar tarefa
                  </button>
                </div>
              )}

              {mostrarPag && (
                <div style={{ marginTop: 12, padding: 12, background: '#083344', borderRadius: 8, border: '1px solid #06b6d440' }}>
                  <label style={labelStyle}>Quando cliente disse que paga? *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" style={inp} value={pagData} onChange={e => setPagData(e.target.value)} />
                    <input type="time" style={inp} value={pagHora} onChange={e => setPagHora(e.target.value)} />
                  </div>
                  <button onClick={confirmarAguardandoPag} disabled={!pagData}
                    style={{ ...btnPrimary, background: '#0891b2', marginTop: 8, width: '100%', opacity: pagData ? 1 : 0.5 }}>
                    Mover e criar tarefa de acompanhamento
                  </button>
                </div>
              )}

              {mostrarGanho && (
                <ModalGanhoVincular lead={lead} turma={turmaSelecionada} onFechar={() => { setMostrarGanho(false); onFechar() }} />
              )}

              {mostrarPerda && (
                <div style={{ marginTop: 12, padding: 12, background: '#450a0a', borderRadius: 8, border: '1px solid #f8717140' }}>
                  <label style={labelStyle}>Motivo da perda *</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={motivoSelecionado} onChange={e => setMotivoSelecionado(e.target.value)}>
                    <option value="">Selecione</option>
                    {motivosPerda.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <button onClick={confirmarPerda} disabled={!motivoSelecionado}
                    style={{ ...btnPrimary, background: '#dc2626', marginTop: 8, width: '100%', opacity: motivoSelecionado ? 1 : 0.5 }}>
                    Confirmar perda
                  </button>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #3a3a3c', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Andamentos</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input style={inp} placeholder="Adicionar anotação..." value={novoAndamento} onChange={e => setNovoAndamento(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') adicionarAndamento() }} />
                <button onClick={adicionarAndamento} style={btnPrimary}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {andamentos.map(a => (
                  <div key={a.id} style={{ padding: 10, background: '#1c1c1e', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ color: '#d1d1d1' }}>{a.observacao}</div>
                    <div style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>
                      {a.tipo && a.tipo !== 'observacao' && <span style={{ color: '#a78bfa', marginRight: 6 }}>[{a.tipo}]</span>}
                      {new Date(a.criado_em).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))}
                {andamentos.length === 0 && <p style={{ fontSize: 12, color: '#6b7280' }}>Nenhum andamento registrado.</p>}
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onFechar} style={btnSecondary}>Cancelar</button>
          <button onClick={salvar} disabled={!form.nome} style={{ ...btnPrimary, opacity: form.nome ? 1 : 0.5 }}>
            {novoLead ? 'Criar lead' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ModalGanhoVincularProps {
  lead: Lead
  turma: Turma | undefined
  onFechar: () => void
}

function ModalGanhoVincular({ lead, turma, onFechar }: ModalGanhoVincularProps) {
  const [matriculas, setMatriculas] = useState<MatriculaDisponivel[]>([])
  const [matriculaSelecionada, setMatriculaSelecionada] = useState<string>('')
  const [motivoGanho, setMotivoGanho] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (turma) carregarMatriculas()
  }, [turma])

  async function carregarMatriculas() {
    if (!turma) return
    setCarregando(true)
    
    const { data } = await supabase.from('matriculas')
      .select('id, aluno_id, valor_pago, data_compra, lead_id, alunos(nome, cpf)')
      .eq('turma_id', turma.id)
      .order('data_compra', { ascending: false })
    
    if (data) {
      const disponiveis = data
        .filter((m: any) => !m.lead_id || m.lead_id === lead.id)
        .map((m: any) => ({
          id: m.id, aluno_id: m.aluno_id, valor_pago: m.valor_pago,
          data_compra: m.data_compra, aluno_nome: m.alunos?.nome, aluno_cpf: m.alunos?.cpf,
        }))
      setMatriculas(disponiveis)
    }
    setCarregando(false)
  }

  async function confirmar() {
    if (!matriculaSelecionada || !turma) return
    setSalvando(true); setMensagem('')

    const mat = matriculas.find(m => m.id === matriculaSelecionada)
    if (!mat) { setSalvando(false); return }

    await supabase.from('matriculas').update({ lead_id: lead.id, vendedor_id: lead.vendedor_id || null }).eq('id', matriculaSelecionada)

    await supabase.from('leads').update({
      etapa: 'ganho',
      data_ganho: new Date().toISOString(),
      valor_venda: mat.valor_pago,
      matricula_id: matriculaSelecionada,
      motivo_ganho: motivoGanho.trim() || null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', lead.id)

    // Cancela tarefas pendentes (ganho encerra o ciclo)
    await supabase.from('tarefas_lead').update({
      cancelada: true,
      cancelada_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
      .eq('lead_id', lead.id)
      .eq('concluida', false)
      .eq('cancelada', false)

    await supabase.from('lead_andamentos').insert({
      lead_id: lead.id, vendedor_id: lead.vendedor_id,
      tipo: 'mudanca_etapa',
      etapa_anterior: lead.etapa, etapa_nova: 'ganho',
      observacao: `Vinculado a matrícula de ${mat.aluno_nome} (R$ ${mat.valor_pago.toFixed(2)})${motivoGanho.trim() ? ' — ' + motivoGanho.trim() : ''}`,
    })

    setMensagem('Lead marcado como ganho!')
    setTimeout(onFechar, 800)
  }

  const labelStyle = { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' as const }

  return (
    <div style={{ marginTop: 12, padding: 16, background: '#052e16', borderRadius: 8, border: '1px solid #4ade8040' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', marginBottom: 12 }}>
        Vincular matrícula existente
      </div>

      {!turma && (
        <p style={{ fontSize: 12, color: '#f87171' }}>
          Este lead não está vinculado a uma turma. Vincule uma turma primeiro.
        </p>
      )}

      {turma && carregando && (
        <p style={{ fontSize: 12, color: '#9ca3af' }}>Carregando matrículas...</p>
      )}

      {turma && !carregando && matriculas.length === 0 && (
        <div>
          <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: 8 }}>
            Nenhuma matrícula disponível para esta turma ainda.
          </p>
          <p style={{ fontSize: 11, color: '#9ca3af' }}>
            Crie a matrícula primeiro em <strong>Turmas → {turma.produtos?.nome} → Nova venda</strong>, depois volte aqui para vincular.
          </p>
        </div>
      )}

      {turma && matriculas.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
            Selecione a matrícula deste lead:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {matriculas.map(m => (
              <div key={m.id} onClick={() => setMatriculaSelecionada(m.id)}
                style={{
                  padding: 10, borderRadius: 6, cursor: 'pointer',
                  border: matriculaSelecionada === m.id ? '2px solid #4ade80' : '1px solid #3a3a3c',
                  background: matriculaSelecionada === m.id ? '#052e16' : '#1c1c1e',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{m.aluno_nome}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                      {m.aluno_cpf && `CPF: ${m.aluno_cpf} · `}
                      {new Date(m.data_compra).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>
                    R$ {m.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Motivo do ganho (opcional)</label>
            <textarea style={{ ...inp, resize: 'none', minHeight: 50 }} rows={2}
              placeholder="Ex: Fechou na virada do lote, cliente decidido"
              value={motivoGanho} onChange={e => setMotivoGanho(e.target.value)} />
          </div>

          {mensagem && (
            <p style={{ marginTop: 10, fontSize: 12, color: mensagem.includes('Erro') ? '#f87171' : '#34d399' }}>{mensagem}</p>
          )}

          <button onClick={confirmar} disabled={!matriculaSelecionada || salvando}
            style={{ ...btnPrimary, background: '#16a34a', marginTop: 12, width: '100%', opacity: (matriculaSelecionada && !salvando) ? 1 : 0.5 }}>
            {salvando ? 'Vinculando...' : 'Confirmar vinculação'}
          </button>
        </>
      )}
    </div>
  )
}
