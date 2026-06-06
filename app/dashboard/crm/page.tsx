'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

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
  mensagem_inicial: string
  valor_venda: number
  observacoes: string
  criado_em: string
  turmas?: { id: string; codigo: string; produtos: { nome: string }; cidades: { nome: string } }
}

type Turma = { id: string; codigo: string; data_inicio: string; preco_venda: number; produtos: { nome: string }; cidades: { nome: string } }
type Vendedor = { id: string; nome: string }
type MotivoPerda = { id: string; nome: string }
type Aluno = { id: string; nome: string; cpf: string; whatsapp: string; email: string }

const ETAPAS = [
  { id: 'atendimento_inicial', label: 'Atendimento inicial', cor: '#6b7280', bg: '#1f2937' },
  { id: 'em_atendimento', label: 'Em atendimento', cor: '#60a5fa', bg: '#172554' },
  { id: 'agendado', label: 'Agendado', cor: '#a78bfa', bg: '#2e1065' },
  { id: 'ligacao_quente', label: 'Ligação quente', cor: '#fb923c', bg: '#431407' },
  { id: 'ligacao_fria', label: 'Ligação fria', cor: '#94a3b8', bg: '#1e293b' },
  { id: 'whatsapp_quente', label: 'WhatsApp quente', cor: '#34d399', bg: '#052e16' },
  { id: 'whatsapp_frio', label: 'WhatsApp frio', cor: '#94a3b8', bg: '#1e293b' },
]

const ORIGEM_LABEL: Record<string, string> = {
  formulario: 'Formulário', whatsapp_site: 'WhatsApp', manual: 'Manual', outro: 'Outro',
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const sel = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

function addMonths(date: Date, months: number) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
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

  useEffect(() => { carregarTudo() }, [])

  async function carregarTudo() {
    await Promise.all([carregarLeads(), carregarTurmas(), carregarVendedores(), carregarMotivos()])
  }

  async function carregarLeads() {
    const { data } = await supabase.from('leads')
      .select('*, turmas(id, codigo, produtos(nome), cidades(nome))')
      .not('etapa', 'in', '(ganho,perdido)')
      .order('criado_em', { ascending: false })
    if (data) setLeads(data as any)
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

  async function moverEtapa(lead: Lead, novaEtapa: string, motivoId?: string) {
    if (novaEtapa === 'ganho') {
      // Ganho deve passar pelo modal de matrícula
      alert('Para marcar como ganho, use o botão "✓ Ganho" no modal do lead. É necessário criar a matrícula.')
      return
    }
    const payload: any = { etapa: novaEtapa, atualizado_em: new Date().toISOString() }
    if (novaEtapa === 'perdido') {
      payload.data_perda = new Date().toISOString()
      payload.motivo_perda_id = motivoId
    }
    await supabase.from('leads').update(payload).eq('id', lead.id)
    await supabase.from('lead_andamentos').insert({
      lead_id: lead.id, vendedor_id: lead.vendedor_id,
      etapa_anterior: lead.etapa, etapa_nova: novaEtapa,
      observacao: novaEtapa === 'perdido' ? 'Lead perdido' : `Movido para ${novaEtapa}`,
    })
    carregarLeads()
  }

  const leadsFiltrados = leads.filter(l => {
    if (filtroTurma && l.turma_id !== filtroTurma) return false
    if (filtroVendedor && l.vendedor_id !== filtroVendedor) return false
    return true
  })

  const leadsPorEtapa = ETAPAS.map(e => ({
    etapa: e,
    leads: leadsFiltrados.filter(l => l.etapa === e.id),
  }))

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>CRM</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{leadsFiltrados.length} lead(s) ativos no funil</p>
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
          <select style={sel} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
            <option value="">Todos vendedores</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
          {(filtroTurma || filtroVendedor) && (
            <button onClick={() => { setFiltroTurma(''); setFiltroVendedor('') }} style={btnSecondary}>Limpar</button>
          )}
        </div>

        {visao === 'kanban' && (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
            {leadsPorEtapa.map(({ etapa, leads: leadsEtapa }) => (
              <div key={etapa.id} style={{ flex: '0 0 280px', minHeight: 400 }}>
                <div style={{ background: etapa.bg, border: `1px solid ${etapa.cor}40`, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: etapa.cor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{etapa.label}</span>
                    <span style={{ fontSize: 12, color: etapa.cor }}>{leadsEtapa.length}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {leadsEtapa.map(lead => (
                    <div key={lead.id} onClick={() => { setLeadEditando(lead); setNovoLead(false); setModalAberto(true) }}
                      style={{ ...card, padding: 12, cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{lead.nome}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{lead.whatsapp || '-'}</div>
                      {lead.turmas && (
                        <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 6, padding: '2px 6px', background: '#2e1065', borderRadius: 4, display: 'inline-block' }}>
                          {lead.turmas.codigo || lead.turmas.produtos?.nome}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{ORIGEM_LABEL[lead.origem] || lead.origem}</div>
                    </div>
                  ))}
                  {leadsEtapa.length === 0 && (
                    <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 11, color: '#6b7280', border: '1px dashed #3a3a3c', borderRadius: 8 }}>
                      Vazio
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {visao === 'lista' && (
          <div style={{ ...card, overflow: 'hidden' }}>
            {leadsFiltrados.length === 0 ? (
              <p style={{ padding: 24, fontSize: 14, color: '#6b7280' }}>Nenhum lead no funil.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3c', background: '#1c1c1e' }}>
                    {['Nome', 'WhatsApp', 'Turma', 'Etapa', 'Origem', 'Criado em'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leadsFiltrados.map(lead => {
                    const etapa = ETAPAS.find(e => e.id === lead.etapa)
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
  moverEtapa: (lead: Lead, novaEtapa: string, motivoId?: string) => Promise<void>
  onFechar: () => void
}

function ModalLead({ aberto, lead, novoLead, turmas, vendedores, motivosPerda, aplicarRateio, moverEtapa, onFechar }: ModalLeadProps) {
  const [form, setForm] = useState<any>({ nome: '', whatsapp: '', email: '', turma_id: '', vendedor_id: '', etapa: 'atendimento_inicial', origem: 'manual', observacoes: '' })
  const [andamentos, setAndamentos] = useState<any[]>([])
  const [novoAndamento, setNovoAndamento] = useState('')
  const [motivoSelecionado, setMotivoSelecionado] = useState('')
  const [mostrarPerda, setMostrarPerda] = useState(false)
  const [mostrarGanho, setMostrarGanho] = useState(false)

  useEffect(() => {
    if (lead) {
      setForm({
        nome: lead.nome, whatsapp: lead.whatsapp || '', email: lead.email || '',
        turma_id: lead.turma_id || '', vendedor_id: lead.vendedor_id || '',
        etapa: lead.etapa, origem: lead.origem || 'manual',
        observacoes: lead.observacoes || '',
      })
      carregarAndamentos(lead.id)
    } else {
      setForm({ nome: '', whatsapp: '', email: '', turma_id: '', vendedor_id: '', etapa: 'atendimento_inicial', origem: 'manual', observacoes: '' })
      setAndamentos([])
    }
    setMostrarPerda(false); setMostrarGanho(false); setMotivoSelecionado('')
  }, [lead, aberto])

  async function carregarAndamentos(leadId: string) {
    const { data } = await supabase.from('lead_andamentos')
      .select('*').eq('lead_id', leadId).order('criado_em', { ascending: false })
    if (data) setAndamentos(data)
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
        vendedor_id: vendedorIdFinal || null, etapa: 'atendimento_inicial',
        origem: form.origem, observacoes: form.observacoes || null,
      })
    }
    onFechar()
  }

  async function adicionarAndamento() {
    if (!lead || !novoAndamento.trim()) return
    await supabase.from('lead_andamentos').insert({
      lead_id: lead.id, vendedor_id: lead.vendedor_id,
      observacao: novoAndamento, etapa_anterior: lead.etapa, etapa_nova: lead.etapa,
    })
    setNovoAndamento('')
    carregarAndamentos(lead.id)
  }

  async function confirmarPerda() {
    if (!lead || !motivoSelecionado) return
    await moverEtapa(lead, 'perdido', motivoSelecionado)
    onFechar()
  }

  if (!aberto) return null

  const labelStyle = { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' as const }
  const turmaSelecionada = turmas.find(t => t.id === form.turma_id)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 12, padding: 24, width: 560, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: '#fff', margin: 0 }}>{novoLead ? 'Novo lead' : form.nome}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>x</button>
        </div>

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
              <option value="whatsapp_site">WhatsApp do site</option>
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
          <>
            <div style={{ borderTop: '1px solid #3a3a3c', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Avançar funil</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ETAPAS.filter(e => e.id !== lead.etapa).map(e => (
                  <button key={e.id} onClick={() => moverEtapa(lead, e.id).then(onFechar)}
                    style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${e.cor}40`, background: e.bg, color: e.cor, fontSize: 11, cursor: 'pointer' }}>
                    → {e.label}
                  </button>
                ))}
                <button onClick={() => setMostrarGanho(!mostrarGanho)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #4ade8040', background: '#052e16', color: '#4ade80', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✓ Ganho (matrícula)
                </button>
                <button onClick={() => setMostrarPerda(!mostrarPerda)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #f8717140', background: '#450a0a', color: '#f87171', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✗ Perda
                </button>
              </div>

              {mostrarGanho && (
                <ModalGanho lead={lead} turma={turmaSelecionada} onFechar={() => { setMostrarGanho(false); onFechar() }} />
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

// ============ MODAL DE GANHO (MATRÍCULA) ============

interface ModalGanhoProps {
  lead: Lead
  turma: Turma | undefined
  onFechar: () => void
}

function ModalGanho({ lead, turma, onFechar }: ModalGanhoProps) {
  const [modo, setModo] = useState<'buscar' | 'novo'>('buscar')
  const [busca, setBusca] = useState('')
  const [alunosEncontrados, setAlunosEncontrados] = useState<Aluno[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null)
  
  // Novo aluno
  const [novoNome, setNovoNome] = useState(lead.nome)
  const [novoCpf, setNovoCpf] = useState('')
  const [novoEmail, setNovoEmail] = useState(lead.email || '')
  const [novoWhatsapp, setNovoWhatsapp] = useState(lead.whatsapp || '')
  
  // Matrícula
  const [valorVenda, setValorVenda] = useState(turma ? turma.preco_venda.toString() : '')
  const [formaPagamento, setFormaPagamento] = useState<'pix' | 'boleto' | 'cartao'>('pix')
  const [parcelas, setParcelas] = useState('1')
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    if (busca.length >= 3) buscarAlunos()
    else setAlunosEncontrados([])
  }, [busca])

  async function buscarAlunos() {
    const { data } = await supabase.from('alunos')
      .select('id, nome, cpf, whatsapp, email')
      .or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%,whatsapp.ilike.%${busca}%`)
      .limit(8)
    if (data) setAlunosEncontrados(data)
  }

  async function confirmar() {
    if (!turma) { setMensagem('Lead precisa estar vinculado a uma turma.'); return }
    if (!valorVenda) { setMensagem('Informe o valor da venda.'); return }
    
    let alunoId: string | null = null

    setSalvando(true); setMensagem('')

    // Cria ou usa aluno existente
    if (modo === 'novo') {
      if (!novoNome || !novoCpf) { setMensagem('Nome e CPF são obrigatórios.'); setSalvando(false); return }
      const { data: aluno, error } = await supabase.from('alunos').insert({
        nome: novoNome, cpf: novoCpf,
        email: novoEmail || `${novoCpf}@semEmail.com`,
        whatsapp: novoWhatsapp || null,
      }).select().single()
      if (error) { setMensagem('Erro ao criar aluno: ' + error.message); setSalvando(false); return }
      alunoId = aluno.id
    } else {
      if (!alunoSelecionado) { setMensagem('Selecione um aluno.'); setSalvando(false); return }
      alunoId = alunoSelecionado.id
    }

    // Cria matrícula
    const numParcelas = formaPagamento === 'cartao' ? 1 : parseInt(parcelas)
    const valorTotal = parseFloat(valorVenda)
    
    const { data: matricula, error: errMat } = await supabase.from('matriculas').insert({
      aluno_id: alunoId, turma_id: turma.id,
      vendedor_id: lead.vendedor_id || null,
      valor_pago: valorTotal,
      forma_pagamento: formaPagamento,
      parcelas: numParcelas,
      lead_id: lead.id,
      status: 'ativa',
      data_compra: new Date().toISOString(),
    }).select().single()

    if (errMat) { setMensagem('Erro ao criar matrícula: ' + errMat.message); setSalvando(false); return }

    // Cria lançamentos no financeiro (parcelas)
    const valorParcela = valorTotal / numParcelas
    const hoje = new Date()
    const lancamentos = []
    for (let i = 0; i < numParcelas; i++) {
      const dataVencimento = addMonths(hoje, i)
      lancamentos.push({
        tipo: 'receita', categoria: 'outro',
        descricao: `Matrícula ${novoNome || alunoSelecionado?.nome} — ${turma.produtos?.nome}${numParcelas > 1 ? ` (${i+1}/${numParcelas})` : ''}`,
        valor: valorParcela, unidade: 'geral',
        mes_referencia: dataVencimento.toISOString().substring(0, 7) + '-01',
        data_vencimento: dataVencimento.toISOString().split('T')[0],
        status: i === 0 ? 'realizado' : 'previsto',
        data_pagamento: i === 0 ? new Date().toISOString().split('T')[0] : null,
        turma_id: turma.id,
      })
    }
    await supabase.from('lancamentos_empresa').insert(lancamentos)

    // Atualiza financeiro_turma (receita_realizada += valorTotal)
    const { data: fin } = await supabase.from('financeiro_turma').select('receita_realizada').eq('turma_id', turma.id).single()
    if (fin) {
      await supabase.from('financeiro_turma').update({
        receita_realizada: (fin.receita_realizada || 0) + valorTotal,
      }).eq('turma_id', turma.id)
    }

    // Atualiza lead para ganho
    await supabase.from('leads').update({
      etapa: 'ganho', data_ganho: new Date().toISOString(),
      valor_venda: valorTotal, matricula_id: matricula.id,
      atualizado_em: new Date().toISOString(),
    }).eq('id', lead.id)

    await supabase.from('lead_andamentos').insert({
      lead_id: lead.id, vendedor_id: lead.vendedor_id,
      etapa_anterior: lead.etapa, etapa_nova: 'ganho',
      observacao: `Matrícula criada — ${formaPagamento} ${numParcelas}x R$ ${valorParcela.toFixed(2)}`,
    })

    setMensagem('Matrícula criada com sucesso!')
    setTimeout(onFechar, 1000)
  }

  const labelStyle = { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' as const }

  return (
    <div style={{ marginTop: 12, padding: 16, background: '#052e16', borderRadius: 8, border: '1px solid #4ade8040' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', marginBottom: 12 }}>Registrar matrícula (Ganho)</div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: '#1c1c1e', padding: 4, borderRadius: 6 }}>
        <button onClick={() => setModo('buscar')}
          style={{ flex: 1, padding: '6px 12px', borderRadius: 4, border: 'none', background: modo === 'buscar' ? '#7c3aed' : 'transparent', color: modo === 'buscar' ? '#fff' : '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
          Buscar aluno existente
        </button>
        <button onClick={() => setModo('novo')}
          style={{ flex: 1, padding: '6px 12px', borderRadius: 4, border: 'none', background: modo === 'novo' ? '#7c3aed' : 'transparent', color: modo === 'novo' ? '#fff' : '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
          Cadastrar novo aluno
        </button>
      </div>

      {modo === 'buscar' && (
        <div style={{ marginBottom: 12 }}>
          <input style={inp} placeholder="Buscar por nome, CPF ou WhatsApp..." value={busca} onChange={e => setBusca(e.target.value)} />
          {alunosEncontrados.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', background: '#1c1c1e', borderRadius: 6 }}>
              {alunosEncontrados.map(a => (
                <div key={a.id} onClick={() => setAlunoSelecionado(a)}
                  style={{ padding: 10, borderBottom: '1px solid #3a3a3c', cursor: 'pointer', background: alunoSelecionado?.id === a.id ? '#2e1065' : 'transparent' }}>
                  <div style={{ fontSize: 13, color: '#fff' }}>{a.nome}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {a.cpf && `CPF: ${a.cpf}`} {a.whatsapp && `· ${a.whatsapp}`}
                  </div>
                </div>
              ))}
            </div>
          )}
          {alunoSelecionado && (
            <div style={{ marginTop: 8, padding: 10, background: '#2e1065', borderRadius: 6, fontSize: 12, color: '#a78bfa' }}>
              ✓ Aluno selecionado: {alunoSelecionado.nome}
            </div>
          )}
        </div>
      )}

      {modo === 'novo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <input style={inp} placeholder="Nome completo *" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
            <input style={inp} placeholder="CPF *" value={novoCpf} onChange={e => setNovoCpf(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={inp} placeholder="Email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} />
            <input style={inp} placeholder="WhatsApp" value={novoWhatsapp} onChange={e => setNovoWhatsapp(e.target.value)} />
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid #4ade8040', paddingTop: 12 }}>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Pagamento</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={labelStyle}>Valor R$</label>
            <input type="number" step="0.01" style={inp} value={valorVenda} onChange={e => setValorVenda(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Forma</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={formaPagamento} onChange={e => setFormaPagamento(e.target.value as any)}>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
              <option value="cartao">Cartão (à vista)</option>
            </select>
          </div>
        </div>
        {formaPagamento !== 'cartao' && (
          <div>
            <label style={labelStyle}>Parcelas</label>
            <input type="number" min="1" max="12" style={inp} value={parcelas} onChange={e => setParcelas(e.target.value)} />
            {parseInt(parcelas) > 1 && valorVenda && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                {parcelas}x R$ {(parseFloat(valorVenda) / parseInt(parcelas)).toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>

      {mensagem && (
        <p style={{ marginTop: 10, fontSize: 12, color: mensagem.includes('Erro') ? '#f87171' : '#34d399' }}>{mensagem}</p>
      )}

      <button onClick={confirmar} disabled={salvando}
        style={{ ...btnPrimary, background: '#16a34a', marginTop: 12, width: '100%', opacity: salvando ? 0.5 : 1 }}>
        {salvando ? 'Criando matrícula...' : 'Confirmar matrícula'}
      </button>
    </div>
  )
}