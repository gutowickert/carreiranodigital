'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'
import { ModalLead } from '@/components/LeadCard'
import { LABEL_FASE, ORDEM_FASE } from '@/lib/lote-core'
import { Plus, Search, CalendarRange, ChevronDown, ChevronRight } from 'lucide-react'

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

// Os campos que o funil e o cartão do lead leem. Tudo de `leads` MENOS resumo_ia (pesado; o cartão
// busca o dele), resposta_formulario e os cookies fbc/fbp. ⚠️ Coluna nova em `leads` que alguma tela
// do funil precise ler tem que entrar aqui — senão chega vazia.
const CAMPOS_LEAD = 'id,nome,whatsapp,email,origem,campanha,utm_source,utm_campaign,utm_medium,utm_content,turma_id,codigo_turma,vendedor_id,etapa,motivo_perda_id,mensagem_inicial,matricula_id,valor_venda,data_ganho,data_perda,observacoes,criado_em,atualizado_em,motivo_ganho,fbclid,prazo_prometido,tamanho_equipe,investimento_marketing,gera_leads_digital,maior_problema,negocio,qualificacao,nao_lida,resumo_ia_em,atendido_por,org_id,handoff_motivo,handoff_em,ajuda_de,ajuda_nota,ajuda_em'

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
  // propostas publicadas por lead (vem da rota: as tabelas de orçamento são fechadas pro navegador).
  // Só acende chip no card; se falhar, o funil segue igual — por isso o catch silencioso.
  const [propostas, setPropostas] = useState<Record<string, any>>({})
  const [meuPerfil, setMeuPerfil] = useState<any>(null)
  // etapas do funil DA ORG (fallback: as hardcoded, pra CnD nunca quebrar)
  const [etapasOrg, setEtapasOrg] = useState<any[]>(ETAPAS)
  useEffect(() => {
    fetchAuth('/api/etapas').then(r => r.json()).then(j => {
      if (j?.ok && j.etapas?.length) setEtapasOrg(j.etapas.filter((e: any) => e.ativo !== false).map((e: any) => ({ id: e.chave, label: e.label, cor: e.cor || 'var(--text-muted)', bg: e.cor ? e.cor + '22' : 'var(--surface-2)', papel: e.papel, funil: e.funil || null })))
    }).catch(() => { })
  }, [])
  const etapasKanban = etapasOrg.filter(e => (e.papel ? (e.papel !== 'ganho' && e.papel !== 'perda') : (e.id !== 'ganho' && e.id !== 'perda')))
  // fase de cada turma (só as com lote) — pro board "Ver por Fase"
  useEffect(() => { fetchAuth('/api/turmas/fases').then(r => r.json()).then(j => { if (j?.ok) setFasesPorTurma(j.fases || {}) }).catch(() => { }) }, [])
  useEffect(() => { fetchAuth('/api/orcamentos/por-lead').then(r => r.json()).then(j => { if (j?.ok) setPropostas(j.porLead || {}) }).catch(() => { }) }, [])

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

  // Cada carga ganha um número: se o funil recarregar no meio (mudou etapa, salvou lead), a carga
  // velha que terminar depois não sobrescreve a nova.
  const cargaAtual = useRef(0)

  async function carregarLeads() {
    const carga = ++cargaAtual.current
    // FUNIL LEVE (28/09/2026 — a tela levava 4s e baixava 2,7 MB):
    //  1. Só os campos que alguma tela lê. Ficam de fora o resumo da IA (877 KB — o cartão busca o
    //     dele em /api/lead/resumo), as respostas cruas do formulário e os cookies fbc/fbp do
    //     Facebook (o fbclid fica: o cartão mostra "fbclid ✓").
    //  2. Em duas levas: primeiro os ATIVOS (as colunas aparecem e o time já trabalha), depois os
    //     finalizados (ganho/perda, ~3/4 da base) — que só aparecem em "Mostrar finalizados", na busca
    //     e nos contadores, e chegam um instante depois.
    const buscar = async (finalizados: boolean) => {
      // O banco devolve no máximo 1000 linhas por consulta, e não avisa. Sem paginar, quando a base passou
      // de 1000 os leads mais antigos sumiam do funil e da busca dele (caso do Adrian, 16/09/2026).
      // `id` desempata a ordem, pra nenhum lead repetir ou pular entre uma página e outra.
      const data: any[] = []
      for (let de = 0; ; de += 1000) {
        let q = supabase.from('leads').select(`${CAMPOS_LEAD}, turmas(id, codigo, produtos(nome), cidades(nome))`)
        q = finalizados ? q.in('etapa', ['ganho', 'perda']) : q.not('etapa', 'in', '(ganho,perda)')
        const { data: pagina } = await q.order('criado_em', { ascending: false }).order('id', { ascending: true }).range(de, de + 999)
        if (!pagina) { if (!data.length) return null; break }
        data.push(...pagina)
        if (pagina.length < 1000) break
      }
      // Pra cada lead, verifica se tem tarefa atrasada — em blocos: a lista inteira de ids não cabe numa consulta
      const leadIds = data.map((l: any) => l.id)
      const blocos: string[][] = []
      for (let i = 0; i < leadIds.length; i += 200) blocos.push(leadIds.slice(i, i + 200))
      const tarefasAtrasadas = (await Promise.all(blocos.map(ids => supabase.from('tarefas_lead')
        .select('lead_id')
        .in('lead_id', ids)
        .eq('concluida', false)
        .eq('cancelada', false)
        .lt('data_vencimento', new Date().toISOString())
        .then(r => r.data || []))))
        .flat()
      const leadsComTarefaAtrasada = new Set(tarefasAtrasadas?.map((t: any) => t.lead_id) || [])
      return data.map((l: any) => ({ ...l, temTarefaAtrasada: leadsComTarefaAtrasada.has(l.id) }))
    }
    const ordem = (a: any, b: any) => (b.criado_em || '').localeCompare(a.criado_em || '') || (a.id < b.id ? -1 : 1)

    const ativos = await buscar(false)
    if (!ativos || carga !== cargaAtual.current) return
    setLeads(prev => {
      // mantém os finalizados que já estavam na tela até a segunda leva chegar (numa recarga, a
      // coluna "finalizados" não pisca vazia)
      const fins = prev.filter((l: any) => l.etapa === 'ganho' || l.etapa === 'perda')
      return [...ativos, ...fins].sort(ordem) as any
    })
    const fins = await buscar(true)
    if (!fins || carga !== cargaAtual.current) return
    setLeads([...ativos, ...fins].sort(ordem) as any)
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

  // ===================== FUNIL NOVO (24/11/2026, desenho aprovado pelo Nando) =====================
  // Em cima: de onde veio quem está no funil (clica e filtra tudo) e a régua de etapas com a curva
  // (número grande = agora; "passaram" = quantos cartões já entraram ali, de lead_etapas). Embaixo, as
  // colunas de sempre. Cada funil (etapas.funil) vira uma aba; Ganho e Perda são de todos.
  const [funilAtivo, setFunilAtivo] = useState<string>('')
  const [origemSel, setOrigemSel] = useState<string | null>(null)
  const [etapaFoco, setEtapaFoco] = useState<string | null>(null)
  const [soAtrasados, setSoAtrasados] = useState(false)
  const [verFiltros, setVerFiltros] = useState(false)
  const [passaram, setPassaram] = useState<Record<string, number>>({})
  const [telsAlunos, setTelsAlunos] = useState<Set<string>>(new Set())
  const [telsDisparo, setTelsDisparo] = useState<Set<string>>(new Set())
  useEffect(() => {
    // tudo aqui é só pra contar: se falhar (permissão, tabela), o funil segue funcionando sem esse número
    supabase.rpc('funil_passaram').then(({ data }) => {
      if (Array.isArray(data)) setPassaram(Object.fromEntries(data.map((r: any) => [r.etapa, Number(r.qtd) || 0])))
    }, () => { })
    ;(async () => {
      const fim8 = (t: string) => (t || '').replace(/\D/g, '').slice(-8)
      const al: string[] = []
      for (let de = 0; de < 20000; de += 1000) {
        const { data } = await supabase.from('alunos').select('whatsapp').range(de, de + 999)
        if (!data) break
        al.push(...data.map((a: any) => fim8(a.whatsapp)).filter(Boolean))
        if (data.length < 1000) break
      }
      setTelsAlunos(new Set(al))
      // quem respondeu a algum disparo nos últimos 120 dias = "voltou pelo disparo"
      const desde = new Date(Date.now() - 120 * 86400000).toISOString()
      const dp: string[] = []
      for (let de = 0; de < 30000; de += 1000) {
        const { data } = await supabase.from('wa_disparo_envios').select('telefone').not('respondeu_em', 'is', null).gte('respondeu_em', desde).range(de, de + 999)
        if (!data) break
        dp.push(...data.map((a: any) => fim8(a.telefone)).filter(Boolean))
        if (data.length < 1000) break
      }
      setTelsDisparo(new Set(dp))
    })().catch(() => { })
  }, [])

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

  // ---------- funis e a qual funil cada lead pertence ----------
  const funis: string[] = Array.from(new Set(etapasOrg.map((e: any) => e.funil).filter(Boolean))) as string[]
  const funilAtual = funis.includes(funilAtivo) ? funilAtivo : (funis[0] || '')
  const ehMaia = (l: any) => l.codigo_turma === 'maiaquiz' || l.qualificacao?.produto === 'Maia'
  const funilDoLead = (l: any): string => {
    const e: any = etapasOrg.find((x: any) => x.id === l.etapa)
    if (e?.funil) return e.funil
    // Ganho/Perda (sem funil): o lead da Maia conta no funil da Maia, o resto no primeiro (a escola)
    if (ehMaia(l) && funis.some(f => /maia/i.test(f))) return funis.find(f => /maia/i.test(f))!
    return funis[0] || ''
  }
  const noFunil = (l: any) => !funis.length || funilDoLead(l) === funilAtual
  const etapasDoFunil = etapasKanban.filter((e: any) => !funis.length || !e.funil || e.funil === funilAtual)
  const funilMaia = /maia/i.test(funilAtual)

  // ---------- de onde veio (uma origem por lead, nesta ordem) ----------
  const fim8 = (t: string) => (t || '').replace(/\D/g, '').slice(-8)
  const telsGanho = new Set(leads.filter(l => l.etapa === 'ganho').map(l => fim8(l.whatsapp)))
  const ORIGENS: { k: string; nome: string; cor: string; de: (l: any) => boolean }[] = funilMaia ? [
    { k: 'oficina', nome: 'Quiz Oficina', cor: 'var(--fn-o1)', de: l => /oficina/i.test(l.qualificacao?.nicho || '') },
    { k: 'otica', nome: 'Quiz Ótica', cor: 'var(--fn-o2)', de: l => /otica|ótica/i.test(l.qualificacao?.nicho || '') },
    { k: 'wa', nome: 'Direto no WhatsApp da Maia', cor: 'var(--fn-o3)', de: l => l.qualificacao?.origem === 'whatsapp_maia' },
    { k: 'outro', nome: 'Outros', cor: 'var(--fn-o4)', de: () => true },
  ] : [
    { k: 'cliente', nome: 'Já é aluno', cor: 'var(--fn-o3)', de: l => telsAlunos.has(fim8(l.whatsapp)) || (l.etapa !== 'ganho' && telsGanho.has(fim8(l.whatsapp))) },
    { k: 'disparo', nome: 'Voltou pelo disparo', cor: 'var(--fn-o2)', de: l => l.origem === 'disparo' || telsDisparo.has(fim8(l.whatsapp)) },
    { k: 'trafego', nome: 'Tráfego novo', cor: 'var(--fn-o1)', de: l => !!l.fbclid || /^(ig|fb|instagram|facebook|meta|an|msg)$/i.test(l.utm_source || '') || /paid|cpc|anuncio/i.test(l.utm_medium || '') },
    { k: 'organico', nome: 'Orgânico e indicação', cor: 'var(--fn-o4)', de: () => true },
  ]
  const ORDEM_EXIBE = funilMaia ? ['oficina', 'otica', 'wa', 'outro'] : ['trafego', 'disparo', 'cliente', 'organico']
  const origemDe = (l: any) => (ORIGENS.find(o => o.de(l)) || ORIGENS[ORIGENS.length - 1]).k
  const alertaDe = (l: any) => !!l.temTarefaAtrasada || diaDoCiclo(l.criado_em) > PRAZO_CICLO || (!!l.prazo_prometido && new Date(l.prazo_prometido) < new Date() && l.etapa === 'aguardando_atendimento')

  // ---------- números ----------
  const mesAtual = new Date().toISOString().slice(0, 7)
  const doFunil = leadsFiltrados.filter(noFunil)
  const ativosFunil = doFunil.filter(l => l.etapa !== 'ganho' && l.etapa !== 'perda' && (!soAtrasados || alertaDe(l)))
  const ativosVisiveis = ativosFunil.filter(l => !origemSel || origemDe(l) === origemSel)
  const ganhosMes = doFunil.filter((l: any) => l.etapa === 'ganho' && (l.data_ganho || '').slice(0, 7) === mesAtual)
  const perdasMes = doFunil.filter((l: any) => l.etapa === 'perda' && (l.data_perda || '').slice(0, 7) === mesAtual)
  const entraramMes = doFunil.filter(l => (l.criado_em || '').slice(0, 7) === mesAtual).length
  const faturadoMes = ganhosMes.reduce((s, l) => s + (Number(l.valor_venda) || 0), 0)
  const conversao = entraramMes ? Math.round(ganhosMes.length / entraramMes * 100) : 0
  const origensVis = ORDEM_EXIBE.map(k => ORIGENS.find(o => o.k === k)!).map(o => ({
    ...o, qtd: ativosFunil.filter(l => origemDe(l) === o.k).length, vendas: ganhosMes.filter(l => origemDe(l) === o.k).length,
  })).filter(o => o.qtd || o.vendas || !funilMaia || o.k !== 'outro')
  const totOrig = ativosFunil.length || 1
  const nomeMes = new Date().toLocaleDateString('pt-BR', { month: 'long' })
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  // cor de cada etapa: uma escala de um tom só (do claro ao fundo); etapa de espera fica cinza
  const ativasDoFunil = etapasDoFunil.filter((e: any) => e.papel !== 'parking')
  const corEtapa = (e: any) => e.papel === 'parking' ? 'var(--fn-espera)' : `color-mix(in oklch, var(--fn-r0), var(--fn-r1) ${Math.round(ativasDoFunil.indexOf(e) / Math.max(1, ativasDoFunil.length - 1) * 100)}%)`
  const qtdEtapa = etapasDoFunil.map((e: any) => ativosVisiveis.filter(l => l.etapa === e.id).length)

  // a curva: passa pelo centro de cada etapa, altura = quantos estão nela agora
  const curva = (() => {
    const N = qtdEtapa.length
    if (!N) return { d: '', area: '', pts: [] as number[][] }
    const max = Math.max(1, ...qtdEtapa), W = 1000, H = 100, topo = 14
    const P = qtdEtapa.map((v, i) => [(i + .5) / N * W, H - (v / max) * (H - topo) - 2])
    let d = `M0,${P[0][1]} L${P[0][0]},${P[0][1]}`
    for (let i = 0; i < N - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2
      d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`
    }
    d += ` L${W},${P[N - 1][1]}`
    return { d, area: `${d} L${W},${H} L0,${H} Z`, pts: P }
  })()

  const colunas = (verPorFase && !funilMaia)
    ? colunasFase.map(c => ({ ...c, cor: c.cor, leads: c.leads.filter(l => noFunil(l) && (!origemSel || origemDe(l) === origemSel) && (!soAtrasados || alertaDe(l))) }))
    : etapasDoFunil.map((e: any) => ({ id: e.id, label: e.label, cor: corEtapa(e), bg: '', dropEtapa: e.id as string | null, leads: ativosVisiveis.filter(l => l.etapa === e.id) }))
  const ganhoF = leadsGanho.filter(noFunil), perdaF = leadsPerda.filter(noFunil)
  const filtrosLigados = !!(busca || filtroTurma || filtroVendedor || filtroAtendido !== 'geral' || origemSel || etapaFoco || soAtrasados)
  const limparTudo = () => { setBusca(''); setFiltroTurma(''); setFiltroVendedor(''); setFiltroAtendido('geral'); setOrigemSel(null); setEtapaFoco(null); setSoAtrasados(false) }
  const abrir = (lead: Lead) => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }

  return (
      <div className="fn" style={{ padding: '28px clamp(12px, 4vw, 40px)' }}>
        <style>{FN_CSS}</style>
        <div className="fn-topo">
          <div className="fn-topo-esq">
            <h1 className="display relevo-titulo">Funil</h1>
            {funis.length > 1 && (
              <div className="fn-seg" role="tablist" aria-label="Funis">
                {funis.map(f => (
                  <button key={f} role="tab" aria-selected={f === funilAtual} onClick={() => { setFunilAtivo(f); setOrigemSel(null); setEtapaFoco(null) }}>{f}</button>
                ))}
              </div>
            )}
          </div>
          <div className="fn-kpis">
            <div className="fn-kpi"><span>Vendas em {nomeMes}</span><b className="fn-pos">{ganhosMes.length}</b></div>
            <div className="fn-kpi"><span>Faturado</span><b>{brl(faturadoMes)}</b></div>
            <div className="fn-kpi"><span>Conversão</span><b>{conversao}%</b></div>
            {!funilMaia && (
              <button className="fn-ghost" aria-pressed={verPorFase} onClick={() => setVerPorFase(v => !v)} title="Colunas pela FASE da turma (calendário) em vez da etapa">
                <CalendarRange size={14} /> Por fase
              </button>
            )}
            <button className="fn-prim" onClick={() => { setLeadEditando(null); setNovoLead(true); setModalAberto(true) }}>
              <Plus size={14} strokeWidth={2.4} /> Novo lead
            </button>
          </div>
        </div>

        {/* de onde veio quem está no funil */}
        <section className="fn-sec">
          <div className="fn-sec-cab"><span>{funilMaia ? 'De onde vieram' : 'De onde vieram'} · {ativosFunil.length} no funil</span><small>clica numa origem pra filtrar a tela</small></div>
          <div className={'fn-barra' + (origemSel ? ' focada' : '')} aria-hidden="true">
            {origensVis.filter(o => o.qtd).map(o => <i key={o.k} className={origemSel === o.k ? 'on' : ''} style={{ ['--pc' as any]: o.cor, flexGrow: o.qtd }} />)}
          </div>
          <div className={'fn-legenda' + (origemSel ? ' focada' : '')} style={{ ['--n' as any]: Math.max(origensVis.length, 3) }}>
            {origensVis.map(o => (
              <button key={o.k} className="fn-lg" aria-pressed={origemSel === o.k} onClick={() => setOrigemSel(origemSel === o.k ? null : o.k)} style={{ ['--pc' as any]: o.cor }}>
                <span className="nome"><span className="fn-dot" />{o.nome}</span>
                <span className="ln"><span className="num tnum">{o.qtd}</span><span className="pct">{Math.round(o.qtd / totOrig * 100)}%</span></span>
                <span className="sub">{o.vendas} {o.vendas === 1 ? 'venda' : 'vendas'} no mês</span>
              </button>
            ))}
          </div>
        </section>

        {/* onde cada um está */}
        {!(verPorFase && !funilMaia) && (
          <section className="fn-sec">
            <div className="fn-sec-cab"><span>Onde cada um está</span><small>embaixo do número: quantos já passaram pela etapa</small></div>
            <div className="fn-etapas-bloco vidro">
              <div className="fn-etapas-area">
                <div className="fn-etapas" style={{ ['--n' as any]: etapasDoFunil.length }}>
                  {etapasDoFunil.map((e: any, i: number) => (
                    <button key={e.id} className="fn-et" aria-pressed={etapaFoco === e.id} style={{ ['--c' as any]: corEtapa(e) }}
                      onClick={() => { const nova = etapaFoco === e.id ? null : e.id; setEtapaFoco(nova); if (nova) document.getElementById('fn-col-' + nova)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) }}>
                      <span className="nome"><span className="fn-dot" />{e.label}</span>
                      <span className="num tnum">{qtdEtapa[i]}</span>
                      <span className="sub">{passaram[e.id] != null ? `passaram ${passaram[e.id].toLocaleString('pt-BR')}` : ' '}</span>
                      <span className="esp" />
                    </button>
                  ))}
                </div>
                <div className="fn-curva" aria-hidden="true">
                  <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
                    <defs><linearGradient id="fn-gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
                    <path d={curva.area} fill="url(#fn-gf)" />
                    <path d={curva.d} fill="none" stroke="var(--fn-linha-ac)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {curva.pts.map((p, i) => <span key={i} className={'pt' + (etapasDoFunil[i]?.id === etapaFoco ? ' on' : '')} style={{ left: `${p[0] / 10}%`, top: `${p[1]}%` }} />)}
                </div>
              </div>
              <div className="fn-fins">
                <div className="fn-fim"><span className="nome">Ganho</span><span className="num tnum fn-pos">{ganhosMes.length}</span><span className="sub">no mês</span></div>
                <div className="fn-fim"><span className="nome">Perdido</span><span className="num tnum fn-neg">{perdasMes.length}</span><span className="sub">no mês</span></div>
              </div>
            </div>
          </section>
        )}

        {/* busca e filtros */}
        <div className="fn-ferr">
          <label className="fn-busca">
            <Search size={14} />
            <input placeholder="Buscar nome ou telefone" value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
          <button className="fn-ghost" aria-pressed={soAtrasados} onClick={() => setSoAtrasados(v => !v)} data-tom="neg">
            <span className="fn-pt" /> Atrasados · {doFunil.filter(l => l.etapa !== 'ganho' && l.etapa !== 'perda' && alertaDe(l)).length}
          </button>
          <button className="fn-ghost" aria-pressed={verFiltros || !!(filtroTurma || filtroVendedor || filtroAtendido !== 'geral')} onClick={() => setVerFiltros(v => !v)}>Filtros</button>
          {filtrosLigados && <button className="fn-link" onClick={limparTudo}>Limpar</button>}
        </div>
        {verFiltros && (
          <div className="fn-filtros">
            <select value={filtroTurma} onChange={e => setFiltroTurma(e.target.value)} aria-label="Turma">
              <option value="">Todas as turmas</option>
              {turmas.map(t => <option key={t.id} value={t.id}>{t.produtos?.nome} — {t.cidades?.nome} {t.codigo ? '(' + t.codigo + ')' : ''}</option>)}
            </select>
            {!soProprios && (
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} aria-label="Vendedor">
                <option value="">Todos os vendedores</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            )}
            <select value={filtroAtendido} onChange={e => setFiltroAtendido(e.target.value as any)} aria-label="Quem atende">
              <option value="geral">IA e time</option>
              <option value="humano">Só o time</option>
              <option value="ia">Só a IA</option>
            </select>
          </div>
        )}

        {/* as colunas */}
        <div className="fn-quadro-wrap">
          <div className="fn-quadro">
            {colunas.map(col => (
              <div key={col.id} id={'fn-col-' + col.id}
                className={'fn-pista' + (etapaFoco && etapaFoco !== col.id ? ' apagada' : '') + (colunaAlvo === col.id ? ' alvo' : '')}
                style={{ ['--c' as any]: col.cor }}
                onDragOver={e => { if (dragLeadRef.current && col.dropEtapa) { e.preventDefault(); if (colunaAlvo !== col.id) setColunaAlvo(col.id) } }}
                onDragLeave={() => { if (colunaAlvo === col.id) setColunaAlvo(null) }}
                onDrop={async e => {
                  e.preventDefault()
                  const l = dragLeadRef.current
                  dragLeadRef.current = null
                  setColunaAlvo(null)
                  if (l && col.dropEtapa && l.etapa !== col.dropEtapa) { await moverEtapa(l, col.dropEtapa) }
                }}>
                <div className="fn-pista-cab"><span className="fn-dot" /><span className="t">{col.label}</span><b className="tnum">{col.leads.length}</b></div>
                <div className="fn-lista">
                  {col.leads.map(lead => {
                    const dia = diaDoCiclo(lead.criado_em)
                    const alerta = alertaDe(lead)
                    const p = propostas[lead.id]
                    const t = (lead as any).temperatura
                    const q: any = (lead as any).qualificacao || {}
                    const partes: React.ReactNode[] = []
                    if (lead.temTarefaAtrasada) partes.push(<span key="ta" className="ruim">Tarefa atrasada</span>)
                    if (dia > PRAZO_CICLO && !lead.temTarefaAtrasada) partes.push(<span key="ce" className="ruim">Ciclo estourou</span>)
                    if (t === 'quente') partes.push(<span key="tq" className="q">Quente</span>)
                    else if (t === 'frio') partes.push(<span key="tf">Frio</span>)
                    if (p?.aceito_em) partes.push(<span key="pa" className="ok">Aceitou a proposta</span>)
                    else if (p && p.aberturas > 0) partes.push(<span key="pb" className="ok">Abriu a proposta</span>)
                    else if (p) partes.push(<span key="pe">Proposta enviada</span>)
                    if (verPorFase) partes.push(<span key="et">{etapaInfo(lead.etapa).label}</span>)
                    if (lead.turmas?.codigo && lead.codigo_turma !== 'maiaquiz') partes.push(<span key="tu">{lead.turmas.codigo}</span>)
                    const o = ORIGENS.find(x => x.k === origemDe(lead))
                    return (
                      <article key={lead.id} className={'fn-card' + (alerta ? ' alerta' : '')}
                        draggable={!!col.dropEtapa}
                        onDragStart={e => { if (!col.dropEtapa) return; dragLeadRef.current = lead; e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { dragLeadRef.current = null; setColunaAlvo(null) }}
                        onClick={() => abrir(lead)}>
                        <div className="l1">
                          <span className="nm">{lead.nao_lida && <span className="nl" title="Mensagem não lida" />}{lead.nome}</span>
                          <span className="d mono" title={`Dia ${dia} do ciclo`}>D{dia}</span>
                        </div>
                        <div className="tel mono">{lead.whatsapp || '—'}</div>
                        <div className="meta">
                          <span className="txt">{partes.length ? partes.reduce((acc: React.ReactNode[], x, i) => i ? [...acc, <span key={'s' + i} className="sep">·</span>, x] : [x], []) : <span className="vago">Sem novidade</span>}</span>
                          {o && <span className="fn-dot pequeno" style={{ ['--pc' as any]: o.cor }} title={o.nome} />}
                        </div>
                        {funilMaia && (q.negocio || q.cidade) && (
                          <div className="diag">
                            <span><b>{q.negocio || q.nicho}</b>{q.cidade ? ` em ${q.cidade}` : ''}</span>
                            {lead.maior_problema && <span>Ponto principal: {lead.maior_problema}</span>}
                          </div>
                        )}
                      </article>
                    )
                  })}
                  {col.leads.length === 0 && <div className="fn-vazio">Nenhum lead aqui</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* finalizados */}
        <div className="fn-finais">
          <button className="fn-link" onClick={() => setVerFinalizados(!verFinalizados)}>
            {verFinalizados ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {verFinalizados ? 'Esconder' : 'Mostrar'} finalizados
          </button>
          <span className="fn-pos">Ganho · {ganhoF.length}</span>
          <span className="fn-neg">Perda · {perdaF.length}</span>
        </div>
        {verFinalizados && (
          <div className="fn-fin-grade">
            {([['Ganho', ganhoF, 'fn-pos'], ['Perda', perdaF, 'fn-neg']] as const).map(([titulo, lista, cls]) => (
              <div key={titulo}>
                <div className={'fn-fin-tit ' + cls}>{titulo} ({lista.length})</div>
                <div className="fn-fin-lista">
                  {lista.map(lead => (
                    <div key={lead.id} className="fn-card" onClick={() => abrir(lead)}>
                      <div className="l1"><span className="nm">{lead.nome}</span>
                        {titulo === 'Ganho' ? <span className="mono fn-pos">{brl(Number(lead.valor_venda) || 0)}</span> : null}</div>
                      {titulo === 'Perda' && lead.motivo_perda_id && motivoMap[lead.motivo_perda_id] && (
                        <span className="fn-motivo" style={corMotivo(motivoMap[lead.motivo_perda_id])}>{motivoMap[lead.motivo_perda_id]}</span>
                      )}
                    </div>
                  ))}
                  {lista.length === 0 && <p className="fn-vazio">Nenhum.</p>}
                </div>
              </div>
            ))}
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

// O visual do Funil novo. Cor só pelos tokens do tema (claro e escuro), linhas de 1px com transparência.
// ⚠️ Sem vidro nas colunas nem nos cartões (centenas de elementos que rolam: trava notebook). Vidro só na
// régua de etapas, que fica parada.
const FN_CSS = `
.fn{--fn-line:color-mix(in srgb,var(--text) 9%,transparent);--fn-line2:color-mix(in srgb,var(--text) 15%,transparent);
  --fn-lane:color-mix(in srgb,var(--text) 3.5%,transparent);--fn-dim:color-mix(in srgb,var(--accent) 13%,transparent);
  --fn-linha-ac:color-mix(in srgb,var(--accent) 60%,transparent);
  --fn-r0:color-mix(in oklch,var(--accent) 38%,#fff);--fn-r1:var(--accent);--fn-espera:color-mix(in srgb,var(--text) 40%,transparent);
  --fn-o1:var(--accent);--fn-o2:var(--amber);--fn-o3:var(--green);--fn-o4:color-mix(in srgb,var(--text) 38%,transparent);
  display:flex;flex-direction:column;gap:30px;letter-spacing:-.005em}
.fn .mono{font-family:var(--f-mono,ui-monospace),ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px;letter-spacing:0;font-variant-numeric:tabular-nums}
.fn .tnum{font-variant-numeric:tabular-nums}
:where(.fn) button{font:inherit;color:inherit;letter-spacing:inherit}
.fn-pos{color:var(--green)}.fn-neg{color:var(--red)}
.fn-topo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 26px}
.fn-topo-esq{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.fn-topo h1{font-size:28px;font-weight:600;letter-spacing:-.035em;line-height:1;margin:0;color:var(--text)}
.fn-seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--fn-lane);border:1px solid var(--fn-line)}
.fn-seg button{border:0;background:none;border-radius:7px;padding:5px 12px;font-size:13px;font-weight:500;color:var(--text-muted);cursor:pointer;white-space:nowrap}
.fn-seg button[aria-selected="true"]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--fn-line2)}
.fn-kpis{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.fn-kpi{display:flex;flex-direction:column;gap:2px}
.fn-kpi span{font-size:11.5px;color:var(--text-faint)}
.fn-kpi b{font-size:17px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--text)}
.fn-kpi b.fn-pos{color:var(--green)}
.fn-prim{border:0;background:var(--text);color:var(--bg);border-radius:9px;padding:8px 14px;font-weight:500;font-size:13px;cursor:pointer;display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
.fn-ghost{border:1px solid var(--fn-line);background:none;border-radius:10px;padding:7px 12px;font-size:13px;font-weight:500;color:var(--text-muted);cursor:pointer;display:inline-flex;gap:8px;align-items:center;white-space:nowrap}
.fn-ghost:hover{border-color:var(--fn-line2);color:var(--text)}
.fn-ghost[aria-pressed="true"]{border-color:var(--fn-line2);color:var(--text);background:var(--fn-lane)}
.fn-ghost[data-tom="neg"][aria-pressed="true"]{border-color:color-mix(in srgb,var(--red) 50%,transparent);color:var(--red);background:none}
.fn-pt{width:6px;height:6px;border-radius:50%;background:var(--red)}
.fn-link{border:0;background:none;color:var(--accent-soft);font-size:13px;font-weight:500;cursor:pointer;padding:0;display:inline-flex;gap:4px;align-items:center}
.fn-sec{display:flex;flex-direction:column;gap:16px}
.fn-sec-cab{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.fn-sec-cab span{font-size:12.5px;font-weight:500;color:var(--text-muted)}
.fn-sec-cab small{font-size:12px;color:var(--text-faint)}
.fn-dot{width:8px;height:8px;border-radius:50%;background:var(--pc,var(--c));flex:0 0 8px;display:inline-block}
.fn-dot.pequeno{width:6px;height:6px;flex-basis:6px}
.fn-barra{display:flex;gap:4px;height:7px}
.fn-barra i{display:block;height:100%;border-radius:999px;background:var(--pc);transition:opacity .25s}
.fn-barra.focada i:not(.on){opacity:.18}
.fn-legenda{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:12px}
.fn-lg{border:0;background:none;text-align:left;cursor:pointer;padding:0;display:flex;flex-direction:column;gap:7px;min-width:0;transition:opacity .25s}
.fn-legenda.focada .fn-lg:not([aria-pressed="true"]){opacity:.38}
.fn-lg .nome{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fn-lg .ln{display:flex;align-items:baseline;gap:9px}
.fn-lg .num{font-size:32px;font-weight:500;line-height:1;letter-spacing:-.04em;color:var(--text)}
.fn-lg .pct{font-size:12.5px;color:var(--text-faint);font-variant-numeric:tabular-nums}
.fn-lg .sub{font-size:12px;color:var(--text-faint)}
.fn-etapas-bloco{display:grid;grid-template-columns:minmax(0,1fr) auto;overflow:hidden;padding:0}
.fn-etapas-area{position:relative;min-width:0}
.fn-etapas{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr))}
.fn-et{border:0;background:none;cursor:pointer;text-align:left;padding:16px 12px 0;display:flex;flex-direction:column;gap:5px;min-width:0;position:relative}
.fn-et + .fn-et::before{content:"";position:absolute;left:0;top:16px;bottom:0;width:1px;background:linear-gradient(var(--fn-line),transparent 92%)}
.fn-et:hover,.fn-et[aria-pressed="true"]{background:linear-gradient(var(--fn-dim),transparent)}
.fn-et .nome{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fn-et .fn-dot{width:7px;height:7px;flex-basis:7px}
.fn-et .num{font-size:28px;font-weight:500;line-height:1.05;letter-spacing:-.04em;color:var(--text)}
.fn-et[aria-pressed="true"] .num{color:var(--accent-soft)}
.fn-et .sub{font-size:11.5px;color:var(--text-faint);white-space:nowrap}
.fn-et .esp{height:62px}
.fn-curva{position:absolute;left:0;right:0;bottom:0;height:62px;pointer-events:none}
.fn-curva svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fn-curva .pt{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:var(--surface);box-shadow:0 0 0 1.5px var(--fn-linha-ac);transition:transform .2s}
.fn-curva .pt.on{transform:scale(1.6);background:var(--accent);box-shadow:0 0 0 4px var(--fn-dim)}
.fn-fins{display:flex;border-left:1px solid var(--fn-line)}
.fn-fim{padding:16px 20px;display:flex;flex-direction:column;gap:5px;min-width:104px}
.fn-fim + .fn-fim{border-left:1px solid var(--fn-line)}
.fn-fim .nome{font-size:12px;color:var(--text-muted)}
.fn-fim .num{font-size:28px;font-weight:500;line-height:1.05;letter-spacing:-.04em}
.fn-fim .sub{font-size:11.5px;color:var(--text-faint)}
.fn-ferr{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:-14px}
.fn-busca{flex:0 1 340px;min-width:0;display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--fn-line);border-radius:10px;padding:0 10px;color:var(--text-faint)}
.fn-busca input{flex:1;min-width:0;border:0;background:none;outline:none;padding:8px 0;color:var(--text);font-size:13px}
.fn-filtros{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:-14px}
.fn-filtros select{background:var(--surface);border:1px solid var(--fn-line);border-radius:10px;padding:7px 10px;font-size:13px;color:var(--text);min-width:0;max-width:300px}
.fn-quadro-wrap{overflow-x:auto;padding-bottom:10px}
.fn-quadro{display:flex;gap:10px;min-width:max-content;align-items:flex-start}
.fn-pista{flex:0 0 268px;width:268px;background:var(--fn-lane);border:1px solid var(--fn-line);border-radius:16px;padding:6px;position:relative;transition:opacity .25s,outline-color .15s;outline:2px dashed transparent;outline-offset:-2px}
.fn-pista.apagada{opacity:.3}
.fn-pista.alvo{outline-color:var(--c)}
.fn-pista::before{content:"";position:absolute;left:18px;right:18px;top:-1px;height:1px;background:linear-gradient(90deg,transparent,var(--c),transparent)}
.fn-pista-cab{display:flex;align-items:center;gap:8px;padding:10px 10px 12px}
.fn-pista-cab .fn-dot{background:var(--c);width:7px;height:7px;flex-basis:7px}
.fn-pista-cab .t{font-size:13px;font-weight:500;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
.fn-pista-cab b{font-size:12px;font-weight:500;color:var(--text-faint)}
.fn-lista{display:flex;flex-direction:column;gap:6px;max-height:max(460px,calc(100dvh - 330px));overflow-y:auto;padding:0 1px 28px;
  -webkit-mask-image:linear-gradient(#000 calc(100% - 40px),transparent);mask-image:linear-gradient(#000 calc(100% - 40px),transparent)}
.fn-card{background:var(--surface);border:1px solid var(--fn-line);border-radius:12px;padding:11px 12px 10px;position:relative;cursor:pointer;transition:border-color .2s,transform .2s}
.fn-card[draggable="true"]{cursor:grab}
.fn-card:hover{border-color:var(--fn-line2);transform:translateY(-1px)}
.fn-card.alerta::after{content:"";position:absolute;left:-1px;top:12px;bottom:12px;width:2px;border-radius:2px;background:var(--red)}
.fn-card .l1{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.fn-card .nm{font-size:13.5px;font-weight:500;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:7px;color:var(--text)}
.fn-card .nl{width:6px;height:6px;border-radius:50%;background:var(--green);flex:0 0 6px}
.fn-card .d{color:var(--text-faint);flex-shrink:0}
.fn-card.alerta .d{color:var(--red)}
.fn-card .tel{color:var(--text-faint);margin-top:2px}
.fn-card .meta{display:flex;align-items:center;gap:6px;margin-top:9px;font-size:12px;color:var(--text-muted);min-width:0}
.fn-card .meta .txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.fn-card .meta .sep{color:var(--text-faint);margin:0 4px}
.fn-card .meta .q{color:var(--amber)}.fn-card .meta .ok{color:var(--green)}.fn-card .meta .ruim{color:var(--red)}
.fn-card .meta .vago{color:var(--text-faint)}
.fn-card .diag{margin-top:8px;padding-top:8px;border-top:1px dashed var(--fn-line2);font-size:12px;color:var(--text-muted);display:flex;flex-direction:column;gap:2px}
.fn-card .diag b{font-weight:500;color:var(--text)}
.fn-vazio{padding:24px 8px;text-align:center;font-size:12px;color:var(--text-faint)}
.fn-finais{display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:13px;margin-top:-10px}
.fn-fin-grade{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fn-fin-tit{font-size:12.5px;font-weight:500;margin-bottom:8px}
.fn-fin-lista{display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto}
.fn-motivo{display:inline-block;margin-top:6px;font-size:11px;font-weight:600;border-radius:5px;padding:1px 7px}
@media (max-width:1100px){
  .fn-etapas-bloco{grid-template-columns:1fr}
  .fn-fins{border-left:0;border-top:1px solid var(--fn-line)}
  .fn-etapas{grid-template-columns:repeat(4,minmax(0,1fr));row-gap:6px}
  .fn-et .esp,.fn-curva{display:none}
  .fn-et{padding-bottom:12px}
  .fn-fim{flex:1}
}
@media (max-width:640px){
  .fn-legenda{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:18px}
  .fn-etapas{grid-template-columns:repeat(2,minmax(0,1fr))}
  .fn-pista{flex-basis:244px;width:244px}
  .fn-fin-grade{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){.fn *{transition:none!important}}
`
