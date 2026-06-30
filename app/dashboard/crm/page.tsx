'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getPrimeiraTarefa, SEQUENCIA_POR_ETAPA } from '@/lib/sequencia-tarefas'
import { iniciarGravacaoOpus, type GravadorOpus } from '@/lib/audio'

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
  nao_lida?: boolean
}

type Turma = { id: string; codigo: string; data_inicio: string; preco_venda: number; produtos: { nome: string }; cidades: { nome: string } }
type Vendedor = { id: string; nome: string }
type MotivoPerda = { id: string; nome: string }
type MatriculaDisponivel = { id: string; aluno_id: string; valor_pago: number; data_compra: string; aluno_nome?: string; aluno_cpf?: string }

const ETAPAS = [
  { id: 'aguardando_atendimento', label: 'Aguardando atendimento', cor: 'var(--text-muted)', bg: 'var(--surface-2)' },
  { id: 'atendimento_inicial', label: 'Atendimento inicial', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  { id: 'lote_preco_ok', label: 'Lote e preço ok', cor: 'var(--green)', bg: 'var(--green-bg)' },
  { id: 'nao_chegou_preco', label: 'Não chegou no preço', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  { id: 'oferecer_bolsa', label: 'Oferecer bolsa', cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  { id: 'pediu_prazo', label: 'Pediu prazo', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  { id: 'aguardando_pagamento', label: 'Aguardando pagamento', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  { id: 'agendado', label: 'Agendado', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  { id: 'proxima_turma', label: 'Próxima turma', cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  { id: 'ganho', label: 'Ganho', cor: 'var(--green-strong)', bg: 'var(--green-bg)' },
  { id: 'perda', label: 'Perda', cor: 'var(--red)', bg: 'var(--red-bg)' },
]

const ETAPAS_KANBAN = ETAPAS.filter(e => e.id !== 'ganho' && e.id !== 'perda')

const ORIGEM_LABEL: Record<string, string> = {
  formulario: 'Formulário', whatsapp_site: 'WhatsApp', whatsapp: 'WhatsApp', manual: 'Manual', herospark: 'HeroSpark', outro: 'Outro',
}

const PRAZO_CICLO = 6

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const sel = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

function diaDoCiclo(criadoEm: string): number {
  const inicio = new Date(criadoEm)
  const agora = new Date()
  const diffMs = agora.getTime() - inicio.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export default function CRM() {
  const [leads, setLeads] = useState<Lead[]>([])
  const dragLeadRef = useRef<Lead | null>(null)
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null)
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [motivosPerda, setMotivosPerda] = useState<MotivoPerda[]>([])
  const [visao, setVisao] = useState<'kanban' | 'lista'>('kanban')
  const [busca, setBusca] = useState('')
  const [filtroTurma, setFiltroTurma] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [leadEditando, setLeadEditando] = useState<Lead | null>(null)
  const [novoLead, setNovoLead] = useState(false)
  const [verFinalizados, setVerFinalizados] = useState(false)
  const [meuPerfil, setMeuPerfil] = useState<any>(null)

  useEffect(() => { carregarTudo() }, [])

  // Abre o card do lead quando chega via /dashboard/crm?lead=<id>
  useEffect(() => {
    if (leads.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const leadId = params.get('lead')
    if (leadId) {
      const l = leads.find(x => x.id === leadId)
      if (l) {
        setLeadEditando(l as any)
        setNovoLead(false)
        setModalAberto(true)
        window.history.replaceState({}, '', '/dashboard/crm')
      }
    }
  }, [leads])

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
    } else if ((novaEtapa === 'agendado' || novaEtapa === 'proxima_turma') && extras?.dataAgendada) {
      // Contato agendado pra um dia (cria a tarefa de chamar)
      await criarTarefaComData(
        lead.id,
        lead.vendedor_id,
        novaEtapa,
        `${novaEtapa === 'agendado' ? 'Contato agendado' : 'Próxima turma'} — ${lead.nome}`,
        novaEtapa === 'agendado' ? 'Retomar contato com o lead (agendado).' : 'Lead para a próxima turma. Retomar contato.',
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
    if (busca.trim()) {
      const b = busca.trim().toLowerCase()
      const bDig = b.replace(/\D/g, '')
      const achaNome = (l.nome || '').toLowerCase().includes(b)
      const achaFone = bDig.length >= 3 && (l.whatsapp || '').replace(/\D/g, '').includes(bDig)
      if (!achaNome && !achaFone) return false
    }
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
      <div style={{ padding: '24px clamp(12px, 4vw, 40px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>CRM</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>{leadsAtivos.length} lead(s) ativos no funil</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setVisao('kanban')}
                style={{ padding: '8px 16px', background: visao === 'kanban' ? 'var(--accent)' : 'transparent', color: visao === 'kanban' ? 'var(--on-accent)' : 'var(--text-muted)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Kanban
              </button>
              <button onClick={() => setVisao('lista')}
                style={{ padding: '8px 16px', background: visao === 'lista' ? 'var(--accent)' : 'transparent', color: visao === 'lista' ? 'var(--on-accent)' : 'var(--text-muted)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Lista
              </button>
            </div>
            <button onClick={() => { setLeadEditando(null); setNovoLead(true); setModalAberto(true) }} style={btnPrimary}>
              + Novo lead
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <input style={{ ...inp, minWidth: 220, flex: '0 1 280px' }} placeholder="🔎 Buscar por nome ou telefone..." value={busca} onChange={e => setBusca(e.target.value)} />
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
          {(busca || filtroTurma || filtroVendedor) && (
            <button onClick={() => { setBusca(''); setFiltroTurma(''); setFiltroVendedor('') }} style={btnSecondary}>Limpar</button>
          )}
        </div>

        {visao === 'kanban' && (
          <>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
              {leadsPorEtapa.map(({ etapa, leads: leadsEtapa }) => (
                <div key={etapa.id}
                  onDragOver={e => { if (dragLeadRef.current) { e.preventDefault(); if (colunaAlvo !== etapa.id) setColunaAlvo(etapa.id) } }}
                  onDragLeave={() => { if (colunaAlvo === etapa.id) setColunaAlvo(null) }}
                  onDrop={async e => {
                    e.preventDefault()
                    const l = dragLeadRef.current
                    dragLeadRef.current = null
                    setColunaAlvo(null)
                    if (l && l.etapa !== etapa.id) { await moverEtapa(l, etapa.id) }
                  }}
                  style={{ flex: '0 0 260px', minHeight: 400, borderRadius: 8, outline: colunaAlvo === etapa.id ? `2px dashed ${etapa.cor}` : '2px dashed transparent', transition: 'outline-color 0.15s' }}>
                  <div style={{ background: etapa.bg, border: `1px solid ${etapa.cor}40`, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: etapa.cor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{etapa.label}</span>
                      <span style={{ fontSize: 12, color: etapa.cor }}>{leadsEtapa.length}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', paddingRight: 4 }}>
                    {leadsEtapa.map(lead => {
                      const dia = diaDoCiclo(lead.criado_em)
                      const cicloEstourou = dia > PRAZO_CICLO
                      const prazoEstourou = lead.prazo_prometido && new Date(lead.prazo_prometido) < new Date() && lead.etapa === 'pediu_prazo'
                      const tarefaAtrasada = lead.temTarefaAtrasada
                      const alerta = cicloEstourou || prazoEstourou || tarefaAtrasada
                      return (
                        <div key={lead.id}
                          draggable
                          onDragStart={e => { dragLeadRef.current = lead; e.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { dragLeadRef.current = null; setColunaAlvo(null) }}
                          onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                          style={{ ...card, padding: 12, cursor: 'grab', border: alerta ? '1px solid var(--red)' : '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{lead.nao_lida && <span title="Não lida" style={{ color: 'var(--amber)' }}>🔴 </span>}{lead.nome}</div>
                            <div style={{ fontSize: 9, color: alerta ? 'var(--red)' : 'var(--text-faint)', fontWeight: 600 }}>D{dia}</div>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{lead.whatsapp || '-'}</div>
                          {lead.turmas && (
                            <div style={{ fontSize: 10, color: 'var(--accent-soft)', marginTop: 6, padding: '2px 6px', background: 'var(--accent-bg)', borderRadius: 4, display: 'inline-block' }}>
                              {lead.turmas.codigo || lead.turmas.produtos?.nome}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{ORIGEM_LABEL[lead.origem] || lead.origem}</div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {tarefaAtrasada && (
                                <div style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600 }}>⚠ tarefa</div>
                              )}
                              {cicloEstourou && (
                                <div style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600 }}>⚠ ciclo</div>
                              )}
                              {prazoEstourou && (
                                <div style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600 }}>⚠ prazo</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {leadsEtapa.length === 0 && (
                      <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', border: '1px dashed var(--border)', borderRadius: 8 }}>
                        Vazio
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <button onClick={() => setVerFinalizados(!verFinalizados)} style={btnSecondary}>
                  {verFinalizados ? '▾ Esconder' : '▸ Mostrar'} finalizados
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
                  <span style={{ color: 'var(--green-strong)', fontWeight: 600 }}>Ganho: {leadsGanho.length}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>Perda: {leadsPerda.length}</span>
                </div>
              </div>
              {verFinalizados && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-strong)', textTransform: 'uppercase', marginBottom: 8 }}>Ganho ({leadsGanho.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                      {leadsGanho.map(lead => (
                        <div key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                          style={{ ...card, padding: 10, cursor: 'pointer' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{lead.nome}</div>
                          <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 4 }}>R$ {lead.valor_venda?.toFixed(2) || '0,00'}</div>
                        </div>
                      ))}
                      {leadsGanho.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Nenhum.</p>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', marginBottom: 8 }}>Perda ({leadsPerda.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                      {leadsPerda.map(lead => (
                        <div key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                          style={{ ...card, padding: 10, cursor: 'pointer' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{lead.nome}</div>
                        </div>
                      ))}
                      {leadsPerda.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Nenhum.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {visao === 'lista' && (
          <div style={{ ...card, overflowX: 'auto' }}>
            {leadsFiltrados.length === 0 ? (
              <p style={{ padding: 24, fontSize: 14, color: 'var(--text-faint)' }}>Nenhum lead no funil.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    {['Nome', 'WhatsApp', 'Turma', 'Etapa', 'Dia', 'Origem', 'Criado em'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leadsFiltrados.map(lead => {
                    const etapa = ETAPAS.find(e => e.id === lead.etapa)
                    const dia = diaDoCiclo(lead.criado_em)
                    return (
                      <tr key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{lead.nao_lida && <span title="Não lida" style={{ color: 'var(--amber)' }}>🔴 </span>}{lead.nome}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{lead.whatsapp || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{lead.turmas?.codigo || lead.turmas?.produtos?.nome || '-'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: etapa?.bg, color: etapa?.cor, fontWeight: 500 }}>
                            {etapa?.label || lead.etapa}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: dia > PRAZO_CICLO ? 'var(--red)' : 'var(--text-muted)' }}>D{dia}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-faint)' }}>{ORIGEM_LABEL[lead.origem] || lead.origem}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-faint)' }}>
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
            podeExcluir={meuPerfil?.papel === 'admin'}
            onFechar={() => { setModalAberto(false); setLeadEditando(null); setNovoLead(false); carregarLeads() }}
          />
        )}
      </div>
  )
}

interface ModalLeadProps {
  aberto: boolean; lead: Lead | null; novoLead: boolean
  turmas: Turma[]; vendedores: Vendedor[]; motivosPerda: MotivoPerda[]
  aplicarRateio: (turmaId: string) => Promise<string | null>
  moverEtapa: (lead: Lead, novaEtapa: string, extras?: { motivoPerdaId?: string; prazoPrometido?: string; dataAgendada?: string }) => Promise<void>
  podeExcluir?: boolean
  onFechar: () => void
}

function ModalLead({ aberto, lead, novoLead, turmas, vendedores, motivosPerda, aplicarRateio, moverEtapa, podeExcluir, onFechar }: ModalLeadProps) {
  const [form, setForm] = useState<any>({ nome: '', whatsapp: '', email: '', turma_id: '', vendedor_id: '', etapa: 'aguardando_atendimento', origem: 'manual', observacoes: '' })
  const [andamentos, setAndamentos] = useState<any[]>([])
  const [ligando, setLigando] = useState(false)
  const [msgLigacao, setMsgLigacao] = useState('')
  const [ligacoes, setLigacoes] = useState<any[]>([])
  const [chatAberto, setChatAberto] = useState(false)
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
  const [mostrarAgendado, setMostrarAgendado] = useState(false)
  const [agendadoData, setAgendadoData] = useState('')
  const [agendadoHora, setAgendadoHora] = useState('09:00')
  const [mostrarProxTurma, setMostrarProxTurma] = useState(false)
  const [proxTurmaData, setProxTurmaData] = useState('')
  const [proxTurmaHora, setProxTurmaHora] = useState('09:00')
  const [naoLida, setNaoLida] = useState(false)

  async function toggleNaoLida() {
    if (!lead) return
    const novo = !naoLida
    setNaoLida(novo)
    await supabase.from('leads').update({ nao_lida: novo }).eq('id', lead.id)
  }

  const [excluindo, setExcluindo] = useState(false)
  async function excluir() {
    if (!lead) return
    if (!confirm(`Excluir o lead "${lead.nome}"? Essa ação não pode ser desfeita.`)) return
    if (!confirm('Tem certeza? O lead e o histórico (andamentos, tarefas, ligações) serão apagados. A conversa do WhatsApp é mantida, só desvinculada.')) return
    setExcluindo(true)
    try {
      const res = await fetch('/api/lead/excluir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      })
      const json = await res.json()
      if (json.ok) onFechar()
      else alert(json.error || 'Não foi possível excluir.')
    } catch { alert('Erro de rede ao excluir.') }
    finally { setExcluindo(false) }
  }

  useEffect(() => {
    if (lead) {
      setForm({
        nome: lead.nome, whatsapp: lead.whatsapp || '', email: lead.email || '',
        turma_id: lead.turma_id || '', vendedor_id: lead.vendedor_id || '',
        etapa: lead.etapa, origem: lead.origem || 'manual',
        observacoes: lead.observacoes || '',
      })
      setNaoLida(!!lead.nao_lida)
      carregarAndamentos(lead.id)
      carregarLigacoes(lead.id)
    } else {
      setForm({ nome: '', whatsapp: '', email: '', turma_id: '', vendedor_id: '', etapa: 'aguardando_atendimento', origem: 'manual', observacoes: '' })
      setNaoLida(false)
      setAndamentos([])
      setLigacoes([])
    }
    setMostrarPerda(false); setMostrarGanho(false); setMostrarPrazo(false); setMostrarPag(false)
    setMostrarAgendado(false); setMostrarProxTurma(false); setAgendadoData(''); setProxTurmaData(''); setAgendadoHora('09:00'); setProxTurmaHora('09:00')
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

  // Move o lead pra etapa "Agendado" (vira coluna no kanban) e cria a tarefa de chamar no dia
  async function confirmarAgendado() {
    if (!lead || !agendadoData) return
    const dataIso = new Date(`${agendadoData}T${agendadoHora || '09:00'}:00`).toISOString()
    await moverEtapa(lead, 'agendado', { dataAgendada: dataIso })
    onFechar()
  }

  // Move o lead pra etapa "Próxima turma" (vira coluna no kanban) e cria a tarefa de chamar no dia
  async function confirmarProxTurma() {
    if (!lead || !proxTurmaData) return
    const dataIso = new Date(`${proxTurmaData}T${proxTurmaHora || '09:00'}:00`).toISOString()
    await moverEtapa(lead, 'proxima_turma', { dataAgendada: dataIso })
    onFechar()
  }

  if (!aberto) return null

  const labelStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' as const }
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
  const tagStyle = { fontSize: 11, color: 'var(--accent-soft)', background: 'var(--accent-bg)', border: '1px solid var(--accent-soft)', borderRadius: 4, padding: '2px 8px' } as React.CSSProperties

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 'clamp(16px, 3vw, 24px)', width: 'min(600px, 94vw)', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{novoLead ? 'Novo lead' : form.nome}</h2>
            {!novoLead && lead && (
              <div style={{ fontSize: 11, color: cicloEstourou ? 'var(--red)' : 'var(--text-muted)', marginTop: 4 }}>
                Dia {dia} do ciclo {cicloEstourou && '⚠ ciclo terminou'}
              </div>
            )}
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 22, cursor: 'pointer' }}>x</button>
        </div>

        {!novoLead && lead && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={ligar} disabled={ligando || !form.whatsapp}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--green-strong)', background: 'var(--green-bg)', color: 'var(--green-strong)', fontSize: 13, fontWeight: 600, cursor: (ligando || !form.whatsapp) ? 'default' : 'pointer', opacity: (ligando || !form.whatsapp) ? 0.6 : 1 }}>
              📞 {ligando ? 'Discando...' : 'Ligar'}
            </button>
            <button onClick={() => setChatAberto(v => !v)} disabled={!form.whatsapp}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #25D36640', background: chatAberto ? '#25D366' : '#0b2e1a', color: chatAberto ? '#063' : '#25D366', fontSize: 13, fontWeight: 600, cursor: form.whatsapp ? 'pointer' : 'default', opacity: form.whatsapp ? 1 : 0.5 }}>
              💬 WhatsApp
            </button>
            <button onClick={toggleNaoLida} title="Marca pra outro atendente pegar"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid ' + (naoLida ? 'var(--amber)' : 'var(--border-strong)'), background: naoLida ? 'var(--amber-bg)' : 'var(--surface-2)', color: naoLida ? 'var(--amber)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {naoLida ? '🔴 Não lida' : '○ Marcar não lida'}
            </button>
            {msgLigacao && <span style={{ fontSize: 12, color: (msgLigacao.includes('Erro') || msgLigacao.includes('Falha')) ? 'var(--red)' : 'var(--text-muted)' }}>{msgLigacao}</span>}
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
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Qualificação (formulário)
            </div>
            {qualLinhas.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {qualLinhas.map(([rotulo, valor]) => (
                  <div key={rotulo} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 8, alignItems: 'start' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rotulo}</div>
                    <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{valor}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
                Sem dados de qualificação (lead não veio do formulário ou campos em branco).
              </p>
            )}
            {temTracking && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {lead.utm_source && <span style={tagStyle}>utm_source: {lead.utm_source}</span>}
                {lead.utm_medium && <span style={tagStyle}>utm_medium: {lead.utm_medium}</span>}
                {lead.utm_campaign && <span style={tagStyle}>utm_campaign: {lead.utm_campaign}</span>}
                {lead.utm_content && <span style={tagStyle}>utm_content: {lead.utm_content}</span>}
                {lead.fbclid && <span style={tagStyle}>fbclid ✓</span>}
              </div>
            )}
          </div>
        )}

        {!novoLead && lead && chatAberto && <ChatLead lead={lead} />}

        {!novoLead && lead && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ligações</div>
              <button onClick={() => carregarLigacoes(lead.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer' }}>↻ atualizar</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {ligacoes.map(l => {
                const s = l.duracao || 0
                const dur = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
                return (
                  <div key={l.id} style={{ padding: 10, background: 'var(--bg)', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-2)' }}>{new Date(l.criado_em).toLocaleString('pt-BR')}</span>
                      <span style={{ color: l.status === 'encerrada' ? 'var(--green)' : 'var(--amber)' }}>
                        {l.status === 'encerrada' ? dur : (l.status || 'iniciada')}
                      </span>
                    </div>
                    {l.gravacao_url ? (
                      <audio controls src={l.gravacao_url} style={{ width: '100%', marginTop: 6, height: 34 }} />
                    ) : (
                      <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 4 }}>
                        {l.status === 'encerrada' ? 'Sem gravação' : 'Aguardando resultado (clica ↻ após desligar)'}
                      </div>
                    )}
                  </div>
                )
              })}
              {ligacoes.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nenhuma ligação ainda.</p>}
            </div>
          </div>
        )}

        {!novoLead && lead && lead.etapa !== 'ganho' && lead.etapa !== 'perda' && (
          <>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Mover etapa</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ETAPAS.filter(e => e.id !== lead.etapa && e.id !== 'ganho' && e.id !== 'perda' && e.id !== 'pediu_prazo' && e.id !== 'aguardando_pagamento' && e.id !== 'agendado' && e.id !== 'proxima_turma').map(e => (
                  <button key={e.id} onClick={() => moverEtapa(lead, e.id).then(onFechar)}
                    style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${e.cor}40`, background: e.bg, color: e.cor, fontSize: 11, cursor: 'pointer' }}>
                    → {e.label}
                  </button>
                ))}
                <button onClick={() => { setMostrarPrazo(!mostrarPrazo); setMostrarGanho(false); setMostrarPerda(false); setMostrarPag(false); setMostrarAgendado(false); setMostrarProxTurma(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--amber)', background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: 11, cursor: 'pointer' }}>
                  → Pediu prazo
                </button>
                <button onClick={() => { setMostrarPag(!mostrarPag); setMostrarGanho(false); setMostrarPerda(false); setMostrarPrazo(false); setMostrarAgendado(false); setMostrarProxTurma(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--blue)', background: 'var(--blue-bg)', color: 'var(--blue)', fontSize: 11, cursor: 'pointer' }}>
                  → Aguardando pagamento
                </button>
                <button onClick={() => { setMostrarAgendado(!mostrarAgendado); setMostrarProxTurma(false); setMostrarPrazo(false); setMostrarPag(false); setMostrarGanho(false); setMostrarPerda(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--blue)', background: 'var(--blue-bg)', color: 'var(--blue)', fontSize: 11, cursor: 'pointer' }}>
                  📅 Agendar contato
                </button>
                <button onClick={() => { setMostrarProxTurma(!mostrarProxTurma); setMostrarAgendado(false); setMostrarPrazo(false); setMostrarPag(false); setMostrarGanho(false); setMostrarPerda(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--accent-soft)', background: 'var(--accent-bg)', color: 'var(--accent-soft)', fontSize: 11, cursor: 'pointer' }}>
                  ➡️ Próxima turma
                </button>
                <button onClick={() => { setMostrarGanho(!mostrarGanho); setMostrarPrazo(false); setMostrarPerda(false); setMostrarPag(false); setMostrarAgendado(false); setMostrarProxTurma(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--green-strong)', background: 'var(--green-bg)', color: 'var(--green-strong)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✓ Ganho
                </button>
                <button onClick={() => { setMostrarPerda(!mostrarPerda); setMostrarPrazo(false); setMostrarGanho(false); setMostrarPag(false); setMostrarAgendado(false); setMostrarProxTurma(false) }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✗ Perda
                </button>
              </div>

              {mostrarPrazo && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--amber-bg)', borderRadius: 8, border: '1px solid var(--amber)' }}>
                  <label style={labelStyle}>Quando cliente prometeu retornar? *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" style={inp} value={prazoData} onChange={e => setPrazoData(e.target.value)} />
                    <input type="time" style={inp} value={prazoHora} onChange={e => setPrazoHora(e.target.value)} />
                  </div>
                  <button onClick={confirmarPrazo} disabled={!prazoData}
                    style={{ ...btnPrimary, background: 'var(--amber)', marginTop: 8, width: '100%', opacity: prazoData ? 1 : 0.5 }}>
                    Marcar prazo e criar tarefa
                  </button>
                </div>
              )}

              {mostrarPag && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--blue-bg)', borderRadius: 8, border: '1px solid var(--blue)' }}>
                  <label style={labelStyle}>Quando cliente disse que paga? *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" style={inp} value={pagData} onChange={e => setPagData(e.target.value)} />
                    <input type="time" style={inp} value={pagHora} onChange={e => setPagHora(e.target.value)} />
                  </div>
                  <button onClick={confirmarAguardandoPag} disabled={!pagData}
                    style={{ ...btnPrimary, background: 'var(--blue)', marginTop: 8, width: '100%', opacity: pagData ? 1 : 0.5 }}>
                    Mover e criar tarefa de acompanhamento
                  </button>
                </div>
              )}

              {mostrarAgendado && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--blue-bg)', borderRadius: 8, border: '1px solid var(--blue)' }}>
                  <label style={labelStyle}>📅 Chamar o lead em: *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" style={{ ...inp, flex: 1 }} value={agendadoData} onChange={e => setAgendadoData(e.target.value)} />
                    <input type="time" style={{ ...inp, width: 110 }} value={agendadoHora} onChange={e => setAgendadoHora(e.target.value)} />
                  </div>
                  <button onClick={confirmarAgendado} disabled={!agendadoData}
                    style={{ ...btnPrimary, background: 'var(--blue)', marginTop: 8, width: '100%', opacity: agendadoData ? 1 : 0.5 }}>
                    Agendar contato
                  </button>
                </div>
              )}

              {mostrarProxTurma && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--accent-bg)', borderRadius: 8, border: '1px solid var(--accent-soft)' }}>
                  <label style={labelStyle}>➡️ Próxima turma — chamar em: *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" style={{ ...inp, flex: 1 }} value={proxTurmaData} onChange={e => setProxTurmaData(e.target.value)} />
                    <input type="time" style={{ ...inp, width: 110 }} value={proxTurmaHora} onChange={e => setProxTurmaHora(e.target.value)} />
                  </div>
                  <button onClick={confirmarProxTurma} disabled={!proxTurmaData}
                    style={{ ...btnPrimary, background: 'var(--accent)', marginTop: 8, width: '100%', opacity: proxTurmaData ? 1 : 0.5 }}>
                    Marcar próxima turma
                  </button>
                </div>
              )}

              {mostrarGanho && (
                <ModalGanhoVincular lead={lead} turma={turmaSelecionada} onFechar={() => { setMostrarGanho(false); onFechar() }} />
              )}

              {mostrarPerda && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--red-bg)', borderRadius: 8, border: '1px solid var(--red)' }}>
                  <label style={labelStyle}>Motivo da perda *</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={motivoSelecionado} onChange={e => setMotivoSelecionado(e.target.value)}>
                    <option value="">Selecione</option>
                    {motivosPerda.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <button onClick={confirmarPerda} disabled={!motivoSelecionado}
                    style={{ ...btnPrimary, background: 'var(--red)', marginTop: 8, width: '100%', opacity: motivoSelecionado ? 1 : 0.5 }}>
                    Confirmar perda
                  </button>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Andamentos</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input style={inp} placeholder="Adicionar anotação..." value={novoAndamento} onChange={e => setNovoAndamento(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') adicionarAndamento() }} />
                <button onClick={adicionarAndamento} style={btnPrimary}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {andamentos.map(a => (
                  <div key={a.id} style={{ padding: 10, background: 'var(--bg)', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ color: 'var(--text-2)' }}>{a.observacao}</div>
                    <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 4 }}>
                      {a.tipo && a.tipo !== 'observacao' && <span style={{ color: 'var(--accent-soft)', marginRight: 6 }}>[{a.tipo}]</span>}
                      {new Date(a.criado_em).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))}
                {andamentos.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nenhum andamento registrado.</p>}
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div>
            {!novoLead && lead && podeExcluir && (
              <button onClick={excluir} disabled={excluindo}
                style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: excluindo ? 0.6 : 1 }}>
                {excluindo ? 'Excluindo...' : '🗑 Excluir lead'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onFechar} style={btnSecondary}>Cancelar</button>
            <button onClick={salvar} disabled={!form.nome} style={{ ...btnPrimary, opacity: form.nome ? 1 : 0.5 }}>
              {novoLead ? 'Criar lead' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChatLead({ lead }: { lead: Lead }) {
  const [mensagens, setMensagens] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [gravando, setGravando] = useState(false)
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [mostrarVincular, setMostrarVincular] = useState(false)
  const [buscaConv, setBuscaConv] = useState('')
  const [convResultados, setConvResultados] = useState<any[]>([])
  const gravadorRef = useRef<GravadorOpus | null>(null)
  const fimRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const txtRef = useRef<HTMLTextAreaElement | null>(null)
  // copiloto (sugestão de IA)
  const [sugerindo, setSugerindo] = useState(false)
  const [sugestao, setSugestao] = useState<{ objecao: string; dica: string } | null>(null)
  // caixa de mensagem cresce conforme o texto (volta ao tamanho ao limpar)
  useEffect(() => { const t = txtRef.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(Math.max(t.scrollHeight, 76), 160) + 'px' } }, [texto])

  async function sugerirResposta() {
    setSugerindo(true); setSugestao(null); setErro('')
    try {
      const r = await fetch('/api/copiloto/sugerir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id }) })
      const j = await r.json()
      if (!j.ok) { setErro(j.error || 'Não consegui sugerir agora.'); return }
      setTexto(j.rascunho || '')
      setSugestao({ objecao: j.objecao || 'nenhuma', dica: j.dica || '' })
      setTimeout(() => txtRef.current?.focus(), 50)
    } catch { setErro('Falha ao falar com o copiloto.') }
    finally { setSugerindo(false) }
  }

  async function buscarConversas(termo: string) {
    const t = termo.trim()
    if (!t) { setConvResultados([]); return }
    const tel = t.replace(/\D/g, '')
    let q = supabase.from('wa_conversas').select('id, nome, telefone, lead_id')
      .order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(12)
    q = tel.length >= 3 ? q.ilike('telefone', `%${tel}%`) : q.ilike('nome', `%${t}%`)
    const { data } = await q
    setConvResultados(data || [])
  }

  async function vincularConversa(convId: string) {
    await supabase.from('wa_conversas').update({ lead_id: lead.id }).eq('id', convId)
    setMostrarVincular(false); setBuscaConv(''); setConvResultados([])
    carregar()
  }

  async function carregar() {
    const sufixo = (lead.whatsapp || '').replace(/\D/g, '').slice(-8)
    const { data: conv } = await supabase.from('wa_conversas')
      .select('id')
      .or(`lead_id.eq.${lead.id}${sufixo ? `,telefone.ilike.%${sufixo}%` : ''}`)
    const ids = (conv || []).map((c: any) => c.id)
    if (ids.length === 0) { setMensagens([]); return }
    const { data: msgs } = await supabase.from('wa_mensagens')
      .select('*').in('conversa_id', ids).order('criado_em', { ascending: true })
    setMensagens(msgs || [])
  }

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 5000)
    return () => clearInterval(t)
  }, [lead.id])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens.length])

  async function enviarTexto() {
    if (!texto.trim()) return
    setEnviando(true); setErro('')
    try {
      const res = await fetch('/api/wa/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, telefone: lead.whatsapp, texto }),
      })
      const json = await res.json()
      if (json.ok) { setTexto(''); carregar() }
      else setErro(json.error || 'falha ao enviar')
    } catch (e: any) { setErro((e && e.message) || 'erro de rede') }
    finally { setEnviando(false) }
  }

  async function iniciarGravacao() {
    setErro('')
    try {
      gravadorRef.current = await iniciarGravacaoOpus()
      setGravando(true)
    } catch {
      setErro('Sem acesso ao microfone')
    }
  }

  async function pararGravacao() {
    const g = gravadorRef.current
    gravadorRef.current = null
    setGravando(false)
    if (!g) return
    setEnviando(true)
    try {
      // OGG/Opus nativo: WhatsApp não reconverte e a reprodução em 1.5x/2x funciona
      const audioBase64 = await g.parar()
      const res = await fetch('/api/wa/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, telefone: lead.whatsapp, audioBase64 }),
      })
      const json = await res.json()
      if (json.ok) carregar(); else setErro(json.error || 'falha ao enviar audio')
    } catch (e: any) { setErro((e && e.message) || 'erro ao processar áudio') }
    finally { setEnviando(false) }
  }

  async function enviarAnexo(file: File) {
    setEnviando(true); setErro('')
    try {
      const ehImagem = file.type.startsWith('image/')
      const ext = (file.name.split('.').pop() || (ehImagem ? 'jpg' : 'pdf')).toLowerCase()
      const reader = new FileReader()
      reader.onloadend = async () => {
        try {
          const res = await fetch('/api/wa/enviar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadId: lead.id, telefone: lead.whatsapp,
              anexoBase64: reader.result, anexoNome: file.name,
              anexoTipo: ehImagem ? 'imagem' : 'documento', anexoExt: ext,
            }),
          })
          const json = await res.json()
          if (json.ok) carregar()
          else setErro(json.error || 'falha ao enviar anexo')
        } catch (e: any) { setErro((e && e.message) || 'erro de rede') }
        finally { setEnviando(false) }
      }
      reader.readAsDataURL(file)
    } catch { setErro('falha ao ler arquivo'); setEnviando(false) }
  }

  function renderMidia(m: any) {
    if (m.tipo === 'imagem' && m.midia_url) return <img src={m.midia_url} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4 }} />
    if (m.tipo === 'audio' && m.midia_url) return <audio controls src={m.midia_url} style={{ width: '100%', marginTop: 4, height: 34 }} />
    if (m.tipo === 'video' && m.midia_url) return <video controls src={m.midia_url} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4 }} />
    if (m.tipo === 'documento' && m.midia_url) return <a href={m.midia_url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', fontSize: 12 }}>📎 {m.texto || 'documento'}</a>
    if (m.tipo === 'audio' && !m.midia_url) return <span style={{ fontSize: 12, opacity: 0.8 }}>🎤 Áudio</span>
    return null
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WhatsApp</div>
        <button onClick={() => { setMostrarVincular(v => !v); setBuscaConv(''); setConvResultados([]) }}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>
          🔗 Vincular conversa
        </button>
      </div>
      {mostrarVincular && (
        <div style={{ marginBottom: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>Busca por nome ou telefone e vincula a este lead — útil quando o cliente fala de um número diferente do cadastrado.</div>
          <input style={inp} placeholder="Nome ou telefone..." value={buscaConv}
            onChange={e => { setBuscaConv(e.target.value); buscarConversas(e.target.value) }} />
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
            {convResultados.map(c => (
              <button key={c.id} onClick={() => vincularConversa(c.id)}
                style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                {c.nome || c.telefone} <span style={{ color: 'var(--text-faint)' }}>· {c.telefone}</span>
                {c.lead_id && <span style={{ color: 'var(--amber)' }}> (já vinculada)</span>}
              </button>
            ))}
            {buscaConv && convResultados.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Nenhuma conversa encontrada.</div>}
          </div>
        </div>
      )}
      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mensagens.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', margin: '12px 0' }}>Nenhuma mensagem ainda. Manda a primeira!</p>}
        {mensagens.map(m => {
          const eu = m.direcao === 'enviada'
          return (
            <div key={m.id} style={{ alignSelf: eu ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
              <div style={{ background: eu ? '#075E54' : 'var(--surface)', border: eu ? 'none' : '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                {m.texto && m.tipo === 'texto' && <div style={{ fontSize: 13, color: eu ? 'var(--on-accent)' : 'var(--text)', whiteSpace: 'pre-wrap' }}>{m.texto}</div>}
                {m.tipo !== 'texto' && (
                  <>
                    {renderMidia(m)}
                    {m.texto && m.tipo !== 'documento' && <div style={{ fontSize: 12, color: eu ? '#e6f4ea' : 'var(--text-2)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{m.texto}</div>}
                  </>
                )}
                <div style={{ fontSize: 9, color: eu ? '#a7f3d0' : 'var(--text-faint)', marginTop: 4, textAlign: 'right' }}>
                  {new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>

      {sugestao && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>✨ Copiloto</span>
          {sugestao.objecao && sugestao.objecao !== 'nenhuma' && <span style={{ color: 'var(--text-2)' }}> · objeção: <b>{sugestao.objecao}</b></span>}
          {sugestao.dica && <div style={{ color: 'var(--text-2)', marginTop: 2 }}>💡 {sugestao.dica}</div>}
          <div style={{ color: '#6b7280', marginTop: 2, fontSize: 11 }}>Rascunho na caixa abaixo — revise e envie.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
        <input ref={fileRef} type="file" style={{ display: 'none' }}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={e => { const f = e.target.files?.[0]; if (f) enviarAnexo(f); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={enviando || gravando} title="Anexar arquivo"
          style={{ ...btnPrimary, background: 'var(--surface-2)', minWidth: 44, padding: '8px' }}>📎</button>
        <button onClick={sugerirResposta} disabled={sugerindo || gravando} title="Sugerir resposta (Copiloto IA)"
          style={{ ...btnPrimary, background: 'var(--surface-2)', minWidth: 44, padding: '8px' }}>{sugerindo ? '…' : '✨'}</button>
        <textarea ref={txtRef} rows={3} style={{ ...inp, flex: 1, resize: 'none', minHeight: 76, maxHeight: 160, lineHeight: 1.4, fontFamily: 'inherit' }}
          placeholder="Mensagem... (Shift+Enter pula linha)" value={texto} disabled={gravando}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto() } }} />
        {texto.trim() ? (
          <button onClick={enviarTexto} disabled={enviando}
            style={{ ...btnPrimary, background: '#25D366', minWidth: 70 }}>
            {enviando ? '...' : 'Enviar'}
          </button>
        ) : gravando ? (
          <button onClick={pararGravacao}
            style={{ ...btnPrimary, background: 'var(--red)', minWidth: 70 }}>
            ⏹ Parar
          </button>
        ) : (
          <button onClick={iniciarGravacao} disabled={enviando} title="Gravar áudio"
            style={{ ...btnPrimary, background: 'var(--surface-2)', minWidth: 70 }}>
            🎤
          </button>
        )}
      </div>
      {gravando && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>● Gravando... clica em Parar pra enviar</div>}
      {erro && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{erro}</div>}
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

  // ---- Cadastrar nova venda direto do lead (quando não há matrícula pra vincular) ----
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([])
  const [modoVenda, setModoVenda] = useState(false)
  const [vNome, setVNome] = useState(lead.nome || '')
  const [vCpf, setVCpf] = useState('')
  const [vEmail, setVEmail] = useState((lead as any).email || '')
  const [vWhats, setVWhats] = useState(lead.whatsapp || '')
  const [vValor, setVValor] = useState('')
  const [vForma, setVForma] = useState('pix')
  const [vParcelas, setVParcelas] = useState('1')
  const [vConta, setVConta] = useState('')
  const [vData, setVData] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    supabase.from('contas_financeiras').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setContas((data as any) || []))
  }, [])
  useEffect(() => { if (turma?.preco_venda) setVValor(String(turma.preco_venda)) }, [turma])

  async function cadastrarVenda() {
    if (!turma) return
    const valorVenda = parseFloat(vValor)
    if (!valorVenda || valorVenda <= 0) { setMensagem('Erro: informe o valor da venda'); return }
    if (!vConta) { setMensagem('Erro: escolha em qual caixa o dinheiro entrou'); return }
    setSalvando(true); setMensagem('')
    try {
      // acha ou cria o aluno a partir dos dados (cpf > email > whatsapp)
      let alunoId: string | null = null
      if (vCpf.trim()) { const { data } = await supabase.from('alunos').select('id').eq('cpf', vCpf.trim()).maybeSingle(); if (data) alunoId = data.id }
      if (!alunoId && vEmail.trim()) { const { data } = await supabase.from('alunos').select('id').eq('email', vEmail.trim()).maybeSingle(); if (data) alunoId = data.id }
      if (!alunoId && vWhats.trim()) { const suf = vWhats.replace(/\D/g, '').slice(-8); if (suf.length >= 8) { const { data } = await supabase.from('alunos').select('id').ilike('whatsapp', `%${suf}`).maybeSingle(); if (data) alunoId = data.id } }
      if (!alunoId) {
        const { data: novo, error } = await supabase.from('alunos').insert({ nome: vNome || lead.nome, cpf: vCpf.trim() || null, email: vEmail.trim() || null, whatsapp: vWhats.trim() || null }).select('id').single()
        if (error || !novo) { setMensagem('Erro ao criar aluno: ' + (error?.message || '')); setSalvando(false); return }
        alunoId = novo.id
      }
      const numParcelas = vForma === 'cartao' ? 1 : (parseInt(vParcelas) || 1)
      // matrícula
      const { data: mat, error: eM } = await supabase.from('matriculas').insert({
        aluno_id: alunoId, turma_id: turma.id, valor_pago: valorVenda, data_compra: vData,
        forma_pagamento: vForma, parcelas: numParcelas, status: 'ativa', lead_id: lead.id, vendedor_id: lead.vendedor_id || null,
      }).select('id').single()
      if (eM || !mat) { setMensagem('Erro ao criar matrícula: ' + (eM?.message || '')); setSalvando(false); return }
      // lançamentos (parcelas) na caixa escolhida
      const valorParcela = valorVenda / numParcelas
      const base = new Date(vData + 'T12:00:00')
      const lanc: any[] = []
      for (let i = 0; i < numParcelas; i++) {
        const d = new Date(base); d.setMonth(d.getMonth() + i)
        const ds = d.toISOString().split('T')[0]
        lanc.push({
          tipo: 'receita', categoria: 'outro',
          descricao: `Matrícula ${vNome || lead.nome} (${vForma})${numParcelas > 1 ? ` ${i + 1}/${numParcelas}` : ''}`,
          valor: valorParcela, unidade: 'geral', mes_referencia: ds.substring(0, 7) + '-01',
          data_vencimento: ds, data_pagamento: i === 0 ? ds : null, status: i === 0 ? 'realizado' : 'previsto',
          turma_id: turma.id, conta_id: vConta,
        })
      }
      await supabase.from('lancamentos_empresa').insert(lanc)
      // receita realizada da turma + abate da prevista
      const { data: fin } = await supabase.from('financeiro_turma').select('receita_realizada').eq('turma_id', turma.id).maybeSingle()
      if (fin) await supabase.from('financeiro_turma').update({ receita_realizada: (fin.receita_realizada || 0) + valorVenda, atualizado_em: new Date().toISOString() }).eq('turma_id', turma.id)
      const { data: prev } = await supabase.from('lancamentos_empresa').select('id, valor').eq('turma_id', turma.id).eq('tipo', 'receita').eq('status', 'previsto').ilike('descricao', 'Receita prevista%').maybeSingle()
      if (prev) { const nv = Math.max(0, (prev.valor || 0) - valorVenda); if (nv === 0) await supabase.from('lancamentos_empresa').delete().eq('id', prev.id); else await supabase.from('lancamentos_empresa').update({ valor: nv }).eq('id', prev.id) }
      // LTV do aluno
      const { data: al } = await supabase.from('alunos').select('ltv').eq('id', alunoId).single()
      await supabase.from('alunos').update({ ltv: (al?.ltv || 0) + valorVenda }).eq('id', alunoId)
      // lead -> ganho
      await supabase.from('leads').update({ etapa: 'ganho', data_ganho: new Date().toISOString(), valor_venda: valorVenda, matricula_id: mat.id, motivo_ganho: motivoGanho.trim() || null, atualizado_em: new Date().toISOString() }).eq('id', lead.id)
      await supabase.from('tarefas_lead').update({ cancelada: true, cancelada_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('lead_id', lead.id).eq('concluida', false).eq('cancelada', false)
      await supabase.from('lead_andamentos').insert({ lead_id: lead.id, vendedor_id: lead.vendedor_id, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: 'ganho', observacao: `Venda cadastrada pelo CRM: ${vForma} ${numParcelas}x — R$ ${valorVenda.toFixed(2)}${motivoGanho.trim() ? ' — ' + motivoGanho.trim() : ''}` })
      setMensagem('Venda cadastrada e lead em ganho!')
      setTimeout(onFechar, 900)
    } catch (e: any) { setMensagem('Erro: ' + (e?.message || '')) } finally { setSalvando(false) }
  }

  const labelStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' as const }

  return (
    <div style={{ marginTop: 12, padding: 16, background: 'var(--green-bg)', borderRadius: 8, border: '1px solid var(--green-strong)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-strong)', marginBottom: 12 }}>
        {modoVenda ? 'Cadastrar nova venda (dados do lead)' : 'Marcar ganho'}
      </div>

      {!turma && (
        <p style={{ fontSize: 12, color: 'var(--red)' }}>
          Este lead não está vinculado a uma turma. Vincule uma turma primeiro.
        </p>
      )}

      {turma && carregando && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando...</p>
      )}

      {/* MODO VINCULAR: matrícula existente + atalho pra cadastrar nova */}
      {turma && !carregando && !modoVenda && (
        <>
          {matriculas.length > 0 ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Selecione a matrícula deste lead:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {matriculas.map(m => (
                  <div key={m.id} onClick={() => setMatriculaSelecionada(m.id)}
                    style={{ padding: 10, borderRadius: 6, cursor: 'pointer', border: matriculaSelecionada === m.id ? '2px solid var(--green-strong)' : '1px solid var(--border)', background: matriculaSelecionada === m.id ? 'var(--green-bg)' : 'var(--bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{m.aluno_nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{m.aluno_cpf && `CPF: ${m.aluno_cpf} · `}{new Date(m.data_compra).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>R$ {m.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Motivo do ganho (opcional)</label>
                <textarea style={{ ...inp, resize: 'none', minHeight: 50 }} rows={2} placeholder="Ex: Fechou na virada do lote, cliente decidido" value={motivoGanho} onChange={e => setMotivoGanho(e.target.value)} />
              </div>
              {mensagem && <p style={{ marginTop: 10, fontSize: 12, color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green)' }}>{mensagem}</p>}
              <button onClick={confirmar} disabled={!matriculaSelecionada || salvando} style={{ ...btnPrimary, background: 'var(--green)', marginTop: 12, width: '100%', opacity: (matriculaSelecionada && !salvando) ? 1 : 0.5 }}>
                {salvando ? 'Vinculando...' : 'Confirmar vinculação'}
              </button>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Nenhuma matrícula existente pra vincular. Cadastre a venda com os dados do lead:</p>
          )}
          <button onClick={() => { setMensagem(''); setModoVenda(true) }} style={{ ...btnPrimary, background: matriculas.length > 0 ? 'var(--surface-2)' : 'var(--green)', marginTop: 10, width: '100%' }}>
            + Cadastrar nova venda (dados do lead)
          </button>
        </>
      )}

      {/* MODO NOVA VENDA: formulário com os dados do lead */}
      {turma && modoVenda && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Aluno (quem vai cursar)</label><input style={inp} value={vNome} onChange={e => setVNome(e.target.value)} /></div>
            <div><label style={labelStyle}>CPF (opcional)</label><input style={inp} value={vCpf} onChange={e => setVCpf(e.target.value)} placeholder="000.000.000-00" /></div>
            <div><label style={labelStyle}>WhatsApp</label><input style={inp} value={vWhats} onChange={e => setVWhats(e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Email (opcional)</label><input style={inp} value={vEmail} onChange={e => setVEmail(e.target.value)} /></div>
            <div><label style={labelStyle}>Valor da venda (R$)</label><input style={inp} type="number" value={vValor} onChange={e => setVValor(e.target.value)} /></div>
            <div><label style={labelStyle}>Data</label><input style={inp} type="date" value={vData} onChange={e => setVData(e.target.value)} /></div>
            <div><label style={labelStyle}>Forma de pagamento</label>
              <select style={inp} value={vForma} onChange={e => setVForma(e.target.value)}>
                <option value="pix">Pix</option><option value="cartao">Cartão</option><option value="boleto">Boleto</option><option value="dinheiro">Dinheiro</option>
              </select>
            </div>
            <div><label style={labelStyle}>Parcelas</label><input style={inp} type="number" min={1} value={vParcelas} onChange={e => setVParcelas(e.target.value)} disabled={vForma === 'cartao'} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Caixa (onde o dinheiro entrou)</label>
              <select style={inp} value={vConta} onChange={e => setVConta(e.target.value)}>
                <option value="">Selecione a caixa...</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Motivo do ganho (opcional)</label><textarea style={{ ...inp, resize: 'none', minHeight: 44 }} rows={2} value={motivoGanho} onChange={e => setMotivoGanho(e.target.value)} /></div>
          </div>
          {vForma === 'cartao' && <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>Cartão entra como 1 lançamento (lança o valor que cair na caixa).</p>}
          {mensagem && <p style={{ marginTop: 10, fontSize: 12, color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green)' }}>{mensagem}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setModoVenda(false)} disabled={salvando} style={{ ...btnSecondary }}>Voltar</button>
            <button onClick={cadastrarVenda} disabled={salvando} style={{ ...btnPrimary, background: 'var(--green)', flex: 1, opacity: salvando ? 0.6 : 1 }}>
              {salvando ? 'Cadastrando...' : '✓ Cadastrar venda e dar ganho'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
