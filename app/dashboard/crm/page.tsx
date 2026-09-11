'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'
import { ModalLead } from '@/components/LeadCard'
import { LABEL_FASE, ORDEM_FASE } from '@/lib/lote-core'
import { Chip } from '@/components/ui'
import { Plus, Search, Columns3, List, CalendarRange, Flame, Thermometer, Snowflake, Clock, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

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

const ETAPAS = [
  { id: 'aguardando_atendimento', label: 'Ligação', cor: 'var(--text-muted)', bg: 'var(--surface-2)' },
  { id: 'deu_venda', label: 'Deu Venda', cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  { id: 'atendimento_inicial', label: 'Atendimento inicial', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  { id: 'lote_preco_ok', label: 'Lote e preço ok', cor: 'var(--green)', bg: 'var(--green-bg)' },
  { id: 'oferecer_bolsa', label: 'Oferecer bolsa', cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  { id: 'aguardando_pagamento', label: 'Aguardando pagamento', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  { id: 'ligacao_boa', label: 'Ligação Boa', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
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

// ⚠️ O CRM NÃO TEM VIDRO. Centenas de cards em colunas que rolam: desfoque aqui trava qualquer
// notebook ("não pode travar nunca" — Nando, 11/09). Card sólido, coluna sólida, só o modal é de vidro.
const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow-sm)' }
const inp = { backgroundColor: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
// minWidth 0 + maxWidth: um <select> não encolhe abaixo da opção mais longa por conta própria, e
// "Formação Completa em Marketing Digital — Porto Alegre (CÓDIGO)" empurrava ele por cima da busca.
const sel = { backgroundColor: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', minWidth: 0, maxWidth: 300, flex: '0 1 260px' } as React.CSSProperties
const btnPrimary = { background: 'var(--grad)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', padding: '9px 16px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '9px 16px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as React.CSSProperties

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
  const [verPorFase, setVerPorFase] = useState(false) // board por FASE da turma (ideia do Nando) em vez de por etapa
  const [fasesPorTurma, setFasesPorTurma] = useState<Record<string, string>>({}) // turma_id -> fase (só turmas com lote)
  const [busca, setBusca] = useState('')
  const [filtroTurma, setFiltroTurma] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroAtendido, setFiltroAtendido] = useState<'geral' | 'ia' | 'humano'>('geral')
  const [modalAberto, setModalAberto] = useState(false)
  const [leadEditando, setLeadEditando] = useState<Lead | null>(null)
  const [novoLead, setNovoLead] = useState(false)
  const [verFinalizados, setVerFinalizados] = useState(false)
  const [meuPerfil, setMeuPerfil] = useState<any>(null)
  // etapas do funil DA ORG (fallback: as hardcoded, pra CnD nunca quebrar)
  const [etapasOrg, setEtapasOrg] = useState<any[]>(ETAPAS)
  useEffect(() => {
    fetchAuth('/api/etapas').then(r => r.json()).then(j => {
      if (j?.ok && j.etapas?.length) setEtapasOrg(j.etapas.filter((e: any) => e.ativo !== false).map((e: any) => ({ id: e.chave, label: e.label, cor: e.cor || 'var(--text-muted)', bg: e.cor ? e.cor + '22' : 'var(--surface-2)', papel: e.papel })))
    }).catch(() => { })
  }, [])
  const etapasKanban = etapasOrg.filter(e => (e.papel ? (e.papel !== 'ganho' && e.papel !== 'perda') : (e.id !== 'ganho' && e.id !== 'perda')))
  // fase de cada turma (só as com lote) — pro board "Ver por Fase"
  useEffect(() => { fetchAuth('/api/turmas/fases').then(r => r.json()).then(j => { if (j?.ok) setFasesPorTurma(j.fases || {}) }).catch(() => { }) }, [])

  // abre o card do lead direto quando vem de outra tela (?lead=<id>) — ex.: Fila de Ligações
  const [leadParam, setLeadParam] = useState<string | null>(null)
  useEffect(() => { if (typeof window !== 'undefined') setLeadParam(new URLSearchParams(window.location.search).get('lead')) }, [])
  useEffect(() => {
    if (leadParam && leads.length) {
      const l = leads.find(x => x.id === leadParam)
      if (l) { setLeadEditando(l); setNovoLead(false); setModalAberto(true) }
      setLeadParam(null)
    }
  }, [leadParam, leads])

  // espera a sessão hidratar E o token estar VÁLIDO antes de buscar (senão a query vai sem token
  // e a RLS zera o CRM); refresca se estiver perto de vencer; re-busca em qualquer evento de auth.
  useEffect(() => {
    let vivo = true
    let tentativas = 0
    async function sessaoOk() {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) return false
      const expMs = (session.expires_at || 0) * 1000
      if (expMs && expMs - Date.now() < 60_000) {   // vence em <1min: refresca já
        const { data } = await supabase.auth.refreshSession()
        session = data.session
      }
      return !!session
    }
    async function boot() {
      if (!vivo) return
      if (await sessaoOk()) { carregarTudo(); return }
      if (tentativas++ < 25) setTimeout(boot, 300)   // sessão ainda hidratando: tenta de novo
    }
    boot()
    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      if (session && (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED' || ev === 'INITIAL_SESSION')) carregarTudo()
    })
    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [])

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
    // PRESERVA ligar_agendado: uma ligação MARCADA pelo vendedor é um compromisso — não pode ser
    // apagada quando o lead muda de etapa (era o bug da Cris: agendava a ligação e o move pra "Ligação"
    // cancelava ela na hora, sumindo da Fila de Ligações).
    await supabase.from('tarefas_lead').update({
      cancelada: true,
      cancelada_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
      .eq('lead_id', leadId)
      .eq('concluida', false)
      .eq('cancelada', false)
      .neq('tipo', 'ligar_agendado')
  }

  // Cria a PRIMEIRA tarefa da sequência de uma etapa
  async function criarPrimeiraTarefaDaEtapa(leadId: string, vendedorId: string | null, etapa: string, dataReferencia: Date, leadNome: string) {
    const primeira = await fetch('/api/tarefas/spec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa }) }).then(r => r.json()).then(j => j.tarefa).catch(() => null)
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

  // Agenda uma LIGAÇÃO pra data/hora, SEM mudar a etapa do lead — cai na Fila de Ligações no horário.
  async function agendarLigacao(lead: Lead, dataIso: string) {
    // Reagendar = SUBSTITUIR: cancela a ligação agendada pendente existente (não duplica na fila).
    await supabase.from('tarefas_lead').update({ cancelada: true, cancelada_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
      .eq('lead_id', lead.id).eq('tipo', 'ligar_agendado').eq('concluida', false).eq('cancelada', false)
    await criarTarefaComData(lead.id, lead.vendedor_id, 'ligar_agendado', `Ligar (agendado) — ${lead.nome}`, 'Ligação agendada pelo vendedor. Ligar no horário combinado.', dataIso)
    carregarLeads()
  }

  async function moverEtapa(lead: Lead, novaEtapa: string, extras?: { motivoPerdaId?: string; prazoPrometido?: string; dataAgendada?: string }) {
    const agora = new Date()
    const payload: any = { etapa: novaEtapa, atualizado_em: agora.toISOString() }

    if (novaEtapa === 'perda') {
      payload.data_perda = agora.toISOString()
      payload.motivo_perda_id = extras?.motivoPerdaId
    }
    // Reabrindo um lead perdido: limpa a marcação de perda pra não sujar relatórios
    if (lead.etapa === 'perda' && novaEtapa !== 'perda') {
      payload.data_perda = null
      payload.motivo_perda_id = null
    }
    if (novaEtapa === 'aguardando_atendimento' && extras?.prazoPrometido) {
      payload.prazo_prometido = extras.prazoPrometido // data/hora da ligação agendada
    }

    await supabase.from('leads').update(payload).eq('id', lead.id)
    await supabase.from('lead_andamentos').insert({
      lead_id: lead.id,
      vendedor_id: lead.vendedor_id,
      tipo: 'mudanca_etapa',
      etapa_anterior: lead.etapa,
      etapa_nova: novaEtapa,
      observacao: `Movido para ${etapasOrg.find(e => e.id === novaEtapa)?.label || novaEtapa}`,
    })

    // Cancela tarefas pendentes da etapa anterior
    await cancelarTarefasPendentes(lead.id)

    // Cria primeira tarefa da nova etapa
    if (novaEtapa === 'aguardando_atendimento' && extras?.prazoPrometido) {
      // Ligação AGENDADA: tarefa de ligação na data/hora combinada
      await criarTarefaComData(
        lead.id,
        lead.vendedor_id,
        'ligar_agendado',
        `Ligar (agendado) — ${lead.nome}`,
        'Cliente pediu ligação nesta data/hora. Ligar no horário combinado.',
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
    } else if (novaEtapa === 'ligacao_boa' && extras?.dataAgendada) {
      // Ligação Boa: lead QUENTE (o time avaliou na ligação que vai fechar). A IA NÃO toca; atenção especial do time.
      // Fica aqui até o time tirar na mão. Tarefa criada na data/hora que o vendedor marcou (obrigatório).
      await criarTarefaComData(
        lead.id,
        lead.vendedor_id,
        'ligacao_boa',
        `Ligação Boa — ${lead.nome}`,
        'Cliente com alto potencial de fechamento (avaliado na ligação). Dar atenção especial no horário marcado — a IA não atende este.',
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
    } else {
      // Tarefa automática conforme a cadência do fluxo (editável no Agente Interno)
      await criarPrimeiraTarefaDaEtapa(lead.id, lead.vendedor_id, novaEtapa, agora, lead.nome)
    }

    carregarLeads()
  }

  const soProprios = meuPerfil && meuPerfil.papel !== 'admin' && meuPerfil.leads_escopo === 'proprios'

  const leadsFiltrados = leads.filter(l => {
    if (soProprios && l.vendedor_id !== meuPerfil.id) return false
    if (filtroTurma && l.turma_id !== filtroTurma) return false
    if (filtroVendedor && l.vendedor_id !== filtroVendedor) return false
    if (filtroAtendido !== 'geral' && ((l as any).atendido_por || 'humano') !== filtroAtendido) return false
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
  // motivo de perda → nome + cor (indicador visual nos leads perdidos)
  const motivoMap: Record<string, string> = Object.fromEntries(motivosPerda.map((m: any) => [m.id, m.nome]))
  const corMotivo = (nome: string) => {
    const n = (nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (n.includes('preco') || n.includes('orcamento')) return { color: 'var(--amber)', background: 'var(--amber-bg)' }
    if (n.includes('concorrente')) return { color: 'var(--accent-soft)', background: 'var(--accent-bg)' }
    if (n.includes('data')) return { color: 'var(--blue)', background: 'var(--blue-bg)' }
    if (n.includes('interesse')) return { color: 'var(--red)', background: 'var(--red-bg)' }
    return { color: 'var(--text-muted)', background: 'var(--surface-2)' } // sem resposta, outro, etc.
  }

  // 🆕 BOARD POR FASE (Nando): as colunas viram a FASE da turma (calendário); a etapa de negociação vira tag no card.
  const faseDoLead = (l: Lead) => fasesPorTurma[l.turma_id] || null
  const etapaInfo = (id: string) => etapasOrg.find(e => e.id === id) || { id, label: id, cor: 'var(--text-muted)', bg: 'var(--surface-2)' }
  const FASE_COR: Record<string, { cor: string; bg: string }> = {
    vendas_abertas: { cor: 'var(--blue)', bg: 'var(--blue-bg)' },
    lote_avancado: { cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
    ultimo_lote: { cor: 'var(--amber)', bg: 'var(--amber-bg)' },
    vespera: { cor: 'var(--red)', bg: 'var(--red-bg)' },
    encerrada: { cor: 'var(--text-muted)', bg: 'var(--surface-2)' },
    sem_lote: { cor: 'var(--text-muted)', bg: 'var(--surface-2)' },
  }
  const colunasFase = ([...ORDEM_FASE, 'sem_lote'] as string[]).map(f => ({
    id: f,
    label: f === 'sem_lote' ? 'Sem lote' : (LABEL_FASE as any)[f],
    cor: FASE_COR[f].cor, bg: FASE_COR[f].bg, dropEtapa: null as string | null,
    leads: leadsAtivos.filter(l => (faseDoLead(l) || 'sem_lote') === f),
  })).filter(c => ['vendas_abertas', 'lote_avancado', 'ultimo_lote', 'vespera'].includes(c.id) || c.leads.length)
  // fonte unificada das colunas do kanban — por FASE (calendário, drag desligado) ou por ETAPA (de sempre, drag ligado)
  const colunasKanban = verPorFase ? colunasFase : etapasKanban.map(e => ({
    id: e.id, label: e.label, cor: e.cor, bg: e.bg, dropEtapa: e.id as string | null,
    leads: leadsAtivos.filter(l => l.etapa === e.id),
  }))

  return (
      <div style={{ padding: '24px clamp(12px, 4vw, 40px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="display relevo-titulo" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.05 }}>Funil</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}><b className="tnum" style={{ color: 'var(--text)' }}>{leadsAtivos.length}</b> lead{leadsAtivos.length === 1 ? '' : 's'} ativo{leadsAtivos.length === 1 ? '' : 's'} no funil</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* kanban × lista: um controle segmentado */}
            <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: 3, gap: 2 }}>
              {([['kanban', 'Colunas', Columns3], ['lista', 'Lista', List]] as const).map(([v, nome, Icone]) => (
                <button key={v} onClick={() => setVisao(v)}
                  style={{ padding: '6px 13px', background: visao === v ? 'var(--accent-bg)' : 'transparent', color: visao === v ? 'var(--accent-soft)' : 'var(--text-muted)', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: visao === v ? 700 : 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icone size={14} /> {nome}
                </button>
              ))}
            </div>
            {visao === 'kanban' && (
              <button onClick={() => setVerPorFase(v => !v)} title="Agrupar por FASE da turma (calendário) em vez de etapa de negociação"
                style={{ ...btnSecondary, background: verPorFase ? 'var(--accent-bg)' : 'var(--surface)', color: verPorFase ? 'var(--accent-soft)' : 'var(--text-2)', borderColor: verPorFase ? 'var(--accent)' : 'var(--border-strong)' }}>
                <CalendarRange size={14} /> Por fase
              </button>
            )}
            <button onClick={() => { setLeadEditando(null); setNovoLead(true); setModalAberto(true) }} className="btn-afunda" style={btnPrimary}>
              <Plus size={15} strokeWidth={2.4} /> Novo lead
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: 220, flex: '1 1 260px', maxWidth: 360 }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
            <input style={{ ...inp, paddingLeft: 34 }} placeholder="Buscar por nome ou telefone" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
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
          <select style={sel} value={filtroAtendido} onChange={e => setFiltroAtendido(e.target.value as any)} title="Quem atende o lead">
            <option value="geral">Geral (IA + humano)</option>
            <option value="humano">Só humano</option>
            <option value="ia">Só IA</option>
          </select>
          {(busca || filtroTurma || filtroVendedor || filtroAtendido !== 'geral') && (
            <button onClick={() => { setBusca(''); setFiltroTurma(''); setFiltroVendedor(''); setFiltroAtendido('geral') }} style={btnSecondary}>Limpar</button>
          )}
        </div>

        {visao === 'kanban' && (
          <>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
              {colunasKanban.map((col) => {
                const leadsEtapa = col.leads
                return (
                <div key={col.id}
                  onDragOver={e => { if (dragLeadRef.current && col.dropEtapa) { e.preventDefault(); if (colunaAlvo !== col.id) setColunaAlvo(col.id) } }}
                  onDragLeave={() => { if (colunaAlvo === col.id) setColunaAlvo(null) }}
                  onDrop={async e => {
                    e.preventDefault()
                    const l = dragLeadRef.current
                    dragLeadRef.current = null
                    setColunaAlvo(null)
                    if (l && col.dropEtapa && l.etapa !== col.dropEtapa) { await moverEtapa(l, col.dropEtapa) }
                  }}
                  style={{ flex: '0 0 268px', minHeight: 400, borderRadius: 'var(--r-lg)', padding: 4, background: colunaAlvo === col.id ? 'var(--surface-2)' : 'transparent', outline: colunaAlvo === col.id ? `2px dashed ${col.cor}` : '2px dashed transparent', transition: 'outline-color 0.15s, background 0.15s' }}>
                  {/* o cabeçalho da coluna: a cor da etapa numa barrinha em cima, e a conta na fonte de números */}
                  <div style={{ background: col.bg, borderRadius: 'var(--r)', padding: '9px 12px', marginBottom: 8, boxShadow: `inset 0 3px 0 ${col.cor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: col.cor, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.label}</span>
                      <span className="display tnum" style={{ fontSize: 16, fontWeight: 800, color: col.cor }}>{leadsEtapa.length}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', paddingRight: 4 }}>
                    {leadsEtapa.map(lead => {
                      const dia = diaDoCiclo(lead.criado_em)
                      const cicloEstourou = dia > PRAZO_CICLO
                      const prazoEstourou = lead.prazo_prometido && new Date(lead.prazo_prometido) < new Date() && lead.etapa === 'aguardando_atendimento'
                      const tarefaAtrasada = lead.temTarefaAtrasada
                      const alerta = cicloEstourou || prazoEstourou || tarefaAtrasada
                      return (
                        <div key={lead.id}
                          draggable={!!col.dropEtapa}
                          onDragStart={e => { if (!col.dropEtapa) return; dragLeadRef.current = lead; e.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { dragLeadRef.current = null; setColunaAlvo(null) }}
                          onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                          className="card-hover"
                          style={{ ...card, padding: '11px 12px', cursor: col.dropEtapa ? 'grab' : 'pointer', border: alerta ? '1px solid var(--red)' : '1px solid var(--border)', boxShadow: alerta ? 'inset 3px 0 0 var(--red)' : 'var(--shadow-sm)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, lineHeight: 1.3 }}>{lead.nao_lida && <span title="Não lida" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', marginRight: 6, verticalAlign: 'middle', boxShadow: '0 0 0 3px var(--green-bg)' }} />}{lead.nome}</div>
                            <span className="tnum" title={`Dia ${dia} do ciclo`} style={{ fontSize: 10.5, color: alerta ? 'var(--red)' : 'var(--text-faint)', fontWeight: 700, flexShrink: 0 }}>D{dia}</span>
                          </div>
                          <div className="tnum" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{lead.whatsapp || '—'}</div>
                          {/* os estados em chips: cor pelo significado, ícone de traço, nunca emoji */}
                          {((lead as any).temperatura || lead.turmas || verPorFase || tarefaAtrasada || cicloEstourou || prazoEstourou) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                              {(lead as any).temperatura && (() => { const t = (lead as any).temperatura; return t === 'quente'
                                ? <Chip tom="atencao" icone={Flame} pequeno title="Temperatura: quente">quente</Chip>
                                : t === 'morno' ? <Chip tom="neutro" icone={Thermometer} pequeno title="Temperatura: morno">morno</Chip>
                                : <Chip tom="info" icone={Snowflake} pequeno title="Temperatura: frio">frio</Chip> })()}
                              {lead.turmas && <Chip tom="marca" pequeno>{lead.turmas.codigo || lead.turmas.produtos?.nome}</Chip>}
                              {verPorFase && (() => { const ei = etapaInfo(lead.etapa); return <span title="Etapa da negociação" style={{ fontSize: 11, fontWeight: 700, color: ei.cor, padding: '1px 7px', background: ei.bg, borderRadius: 'var(--r-pill)' }}>{ei.label}</span> })()}
                              {tarefaAtrasada && <Chip tom="ruim" icone={Clock} pequeno>tarefa atrasada</Chip>}
                              {cicloEstourou && <Chip tom="ruim" icone={AlertTriangle} pequeno>ciclo estourou</Chip>}
                              {prazoEstourou && <Chip tom="ruim" icone={AlertTriangle} pequeno>prazo venceu</Chip>}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 7 }}>{ORIGEM_LABEL[lead.origem] || lead.origem}</div>
                        </div>
                      )
                    })}
                    {leadsEtapa.length === 0 && (
                      <div style={{ padding: '22px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r)' }}>
                        Nenhum lead aqui
                      </div>
                    )}
                  </div>
                </div>
              ) })}
            </div>

            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <button onClick={() => setVerFinalizados(!verFinalizados)} style={btnSecondary}>
                  {verFinalizados ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {verFinalizados ? 'Esconder' : 'Mostrar'} finalizados
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Chip tom="bom">Ganho · {leadsGanho.length}</Chip>
                  <Chip tom="ruim">Perda · {leadsPerda.length}</Chip>
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
                          {lead.motivo_perda_id && motivoMap[lead.motivo_perda_id] && (
                            <span style={{ display: 'inline-block', marginTop: 5, fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 6px', ...corMotivo(motivoMap[lead.motivo_perda_id]) }}>{motivoMap[lead.motivo_perda_id]}</span>
                          )}
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
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    {['Nome', 'WhatsApp', 'Turma', 'Etapa', 'Dia', 'Origem', 'Criado em'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leadsFiltrados.map(lead => {
                    const etapa = etapasOrg.find(e => e.id === lead.etapa)
                    const dia = diaDoCiclo(lead.criado_em)
                    return (
                      <tr key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{lead.nao_lida && <span title="Não lida" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', marginRight: 6, verticalAlign: 'middle' }} />}{lead.nome}</td>
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
            agendarLigacao={agendarLigacao}
            etapas={etapasOrg}
            podeExcluir={meuPerfil?.papel === 'admin'}
            meuPerfil={meuPerfil}
            onFechar={() => { setModalAberto(false); setLeadEditando(null); setNovoLead(false); carregarLeads() }}
          />
        )}
      </div>
  )
}

