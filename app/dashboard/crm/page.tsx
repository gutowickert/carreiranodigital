'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'
import { ModalLead } from '@/components/LeadCard'

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
  { id: 'atendimento_inicial', label: 'Atendimento inicial', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  { id: 'lote_preco_ok', label: 'Lote e preço ok', cor: 'var(--green)', bg: 'var(--green-bg)' },
  { id: 'oferecer_bolsa', label: 'Oferecer bolsa', cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
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

  const leadsPorEtapa = etapasKanban.map(e => ({
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
          <select style={sel} value={filtroAtendido} onChange={e => setFiltroAtendido(e.target.value as any)} title="Quem atende o lead">
            <option value="geral">Geral (IA + humano)</option>
            <option value="humano">👤 Só humano</option>
            <option value="ia">🤖 Só IA</option>
          </select>
          {(busca || filtroTurma || filtroVendedor || filtroAtendido !== 'geral') && (
            <button onClick={() => { setBusca(''); setFiltroTurma(''); setFiltroVendedor(''); setFiltroAtendido('geral') }} style={btnSecondary}>Limpar</button>
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
                      const prazoEstourou = lead.prazo_prometido && new Date(lead.prazo_prometido) < new Date() && lead.etapa === 'aguardando_atendimento'
                      const tarefaAtrasada = lead.temTarefaAtrasada
                      const alerta = cicloEstourou || prazoEstourou || tarefaAtrasada
                      return (
                        <div key={lead.id}
                          draggable
                          onDragStart={e => { dragLeadRef.current = lead; e.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { dragLeadRef.current = null; setColunaAlvo(null) }}
                          onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                          style={{ ...card, padding: 12, cursor: 'grab', border: alerta ? '1px solid var(--red)' : '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{lead.nao_lida && <span title="Não lida" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', marginRight: 6, verticalAlign: 'middle' }} />}{lead.nome}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {(lead as any).temperatura && (() => { const t = (lead as any).temperatura; const tc = t === 'quente' ? { c: '#ef4444', e: '🔥' } : t === 'morno' ? { c: 'var(--amber)', e: '🌡️' } : { c: '#60a5fa', e: '❄️' }; return <span title={`Temperatura: ${t}`} style={{ fontSize: 9, fontWeight: 700, color: tc.c, border: `1px solid ${tc.c}`, borderRadius: 20, padding: '1px 6px', whiteSpace: 'nowrap' }}>{tc.e} {t}</span> })()}
                              <div style={{ fontSize: 9, color: alerta ? 'var(--red)' : 'var(--text-faint)', fontWeight: 600 }}>D{dia}</div>
                            </div>
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
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    {['Nome', 'WhatsApp', 'Turma', 'Etapa', 'Dia', 'Origem', 'Criado em'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
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

