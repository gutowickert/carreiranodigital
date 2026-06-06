'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type Prospeccao = {
  id: string
  vendedor_id: string
  nome_contato: string
  empresa: string
  whatsapp: string
  email: string
  cidade: string
  etapa: string
  motivo_perda_id: string
  turma_id: string
  valor_venda: number
  data_ganho: string
  data_perda: string
  observacoes: string
  criado_em: string
  usuarios_perfil?: { id: string; nome: string }
  turmas?: { id: string; codigo: string; produtos: { nome: string }; cidades: { nome: string } }
}

type Vendedor = { id: string; nome: string }
type Turma = { id: string; codigo: string; produtos: { nome: string }; cidades: { nome: string } }
type MotivoPerda = { id: string; nome: string }

const ETAPAS = [
  { id: 'tentativa_contato', label: 'Tentativa contato', cor: '#6b7280', bg: '#1f2937' },
  { id: 'ligacao_quente', label: 'Ligação quente', cor: '#fb923c', bg: '#431407' },
  { id: 'ligacao_fria', label: 'Ligação fria', cor: '#94a3b8', bg: '#1e293b' },
  { id: 'visita_quente', label: 'Visita quente', cor: '#34d399', bg: '#052e16' },
  { id: 'visita_fria', label: 'Visita fria', cor: '#a78bfa', bg: '#2e1065' },
  { id: 'whatsapp_quente', label: 'WhatsApp quente', cor: '#60a5fa', bg: '#172554' },
  { id: 'whatsapp_frio', label: 'WhatsApp frio', cor: '#94a3b8', bg: '#1e293b' },
]

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const sel = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function CRMExterno() {
  const [prospeccoes, setProspeccoes] = useState<Prospeccao[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [motivosPerda, setMotivosPerda] = useState<MotivoPerda[]>([])
  const [visao, setVisao] = useState<'kanban' | 'lista'>('kanban')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroTurma, setFiltroTurma] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Prospeccao | null>(null)
  const [novoModal, setNovoModal] = useState(false)

  useEffect(() => { carregarTudo() }, [])

  async function carregarTudo() {
    await Promise.all([carregarProspeccoes(), carregarVendedores(), carregarTurmas(), carregarMotivos()])
  }

  async function carregarProspeccoes() {
    const { data } = await supabase.from('prospeccoes_externas')
      .select('*, usuarios_perfil(id, nome), turmas(id, codigo, produtos(nome), cidades(nome))')
      .not('etapa', 'in', '(ganho,perdido)')
      .order('criado_em', { ascending: false })
    if (data) setProspeccoes(data as any)
  }

  async function carregarVendedores() {
    const { data } = await supabase.from('usuarios_perfil')
      .select('id, nome').eq('setor', 'comercial_externo').eq('ativo', true).order('nome')
    if (data) setVendedores(data)
  }

  async function carregarTurmas() {
    const { data } = await supabase.from('turmas')
      .select('id, codigo, produtos(nome), cidades(nome)')
      .in('status', ['planejada', 'em_vendas', 'confirmada'])
      .order('data_inicio', { ascending: false })
    if (data) setTurmas(data as any)
  }

  async function carregarMotivos() {
    const { data } = await supabase.from('motivos_perda').select('id, nome').eq('ativo', true).order('nome')
    if (data) setMotivosPerda(data)
  }

  async function moverEtapa(p: Prospeccao, novaEtapa: string, motivoId?: string) {
    if (novaEtapa === 'ganho') {
      alert('Para marcar como ganho, abra a prospecção e use o botão "Ganho" (precisa registrar matrícula).')
      return
    }
    const payload: any = { etapa: novaEtapa, atualizado_em: new Date().toISOString() }
    if (novaEtapa === 'perdido') {
      payload.data_perda = new Date().toISOString()
      payload.motivo_perda_id = motivoId
    }
    await supabase.from('prospeccoes_externas').update(payload).eq('id', p.id)
    await supabase.from('prospeccao_andamentos').insert({
      prospeccao_id: p.id, vendedor_id: p.vendedor_id,
      etapa_anterior: p.etapa, etapa_nova: novaEtapa,
      observacao: `Movido para ${novaEtapa}`,
    })
    carregarProspeccoes()
  }

  const prospeccoesFiltradas = prospeccoes.filter(p => {
    if (filtroVendedor && p.vendedor_id !== filtroVendedor) return false
    if (filtroTurma && p.turma_id !== filtroTurma) return false
    return true
  })

  const prospeccoesPorEtapa = ETAPAS.map(e => ({
    etapa: e,
    items: prospeccoesFiltradas.filter(p => p.etapa === e.id),
  }))

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>CRM Externo</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{prospeccoesFiltradas.length} prospecção(ões) ativas</p>
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
            <button onClick={() => { setEditando(null); setNovoModal(true); setModalAberto(true) }} style={btnPrimary}>
              + Nova prospecção
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <select style={sel} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
            <option value="">Todos vendedores externos</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
          <select style={sel} value={filtroTurma} onChange={e => setFiltroTurma(e.target.value)}>
            <option value="">Todas as turmas</option>
            {turmas.map(t => (
              <option key={t.id} value={t.id}>
                {t.produtos?.nome} — {t.cidades?.nome} {t.codigo ? '(' + t.codigo + ')' : ''}
              </option>
            ))}
          </select>
          {(filtroVendedor || filtroTurma) && (
            <button onClick={() => { setFiltroVendedor(''); setFiltroTurma('') }} style={btnSecondary}>Limpar</button>
          )}
        </div>

        {vendedores.length === 0 && (
          <div style={{ background: '#431407', border: '1px solid #fb923c40', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#fb923c', fontWeight: 600 }}>⚠ Nenhum vendedor externo cadastrado</div>
            <div style={{ fontSize: 12, color: '#fdba74', marginTop: 4 }}>
              Cadastre usuários com setor "comercial_externo" em /dashboard/usuarios para começar a usar.
            </div>
          </div>
        )}

        {visao === 'kanban' && (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
            {prospeccoesPorEtapa.map(({ etapa, items }) => (
              <div key={etapa.id} style={{ flex: '0 0 280px', minHeight: 400 }}>
                <div style={{ background: etapa.bg, border: `1px solid ${etapa.cor}40`, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: etapa.cor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{etapa.label}</span>
                    <span style={{ fontSize: 12, color: etapa.cor }}>{items.length}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map(p => (
                    <div key={p.id} onClick={() => { setEditando(p); setNovoModal(false); setModalAberto(true) }}
                      style={{ ...card, padding: 12, cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{p.nome_contato}</div>
                      {p.empresa && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{p.empresa}</div>}
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{p.whatsapp || p.cidade || '-'}</div>
                      {p.turmas && (
                        <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 6, padding: '2px 6px', background: '#2e1065', borderRadius: 4, display: 'inline-block' }}>
                          {p.turmas.codigo || p.turmas.produtos?.nome}
                        </div>
                      )}
                      {p.usuarios_perfil && (
                        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>👤 {p.usuarios_perfil.nome}</div>
                      )}
                    </div>
                  ))}
                  {items.length === 0 && (
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
            {prospeccoesFiltradas.length === 0 ? (
              <p style={{ padding: 24, fontSize: 14, color: '#6b7280' }}>Nenhuma prospecção no funil.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3c', background: '#1c1c1e' }}>
                    {['Contato', 'Empresa', 'Cidade', 'Vendedor', 'Turma', 'Etapa'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prospeccoesFiltradas.map(p => {
                    const etapa = ETAPAS.find(e => e.id === p.etapa)
                    return (
                      <tr key={p.id} onClick={() => { setEditando(p); setNovoModal(false); setModalAberto(true) }}
                        style={{ borderBottom: '1px solid #3a3a3c', cursor: 'pointer' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#fff', fontWeight: 500 }}>{p.nome_contato}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{p.empresa || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{p.cidade || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{p.usuarios_perfil?.nome || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{p.turmas?.codigo || p.turmas?.produtos?.nome || '-'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: etapa?.bg, color: etapa?.cor, fontWeight: 500 }}>
                            {etapa?.label || p.etapa}
                          </span>
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
          <ModalProspeccao
            aberto={modalAberto}
            prospeccao={editando}
            novoModal={novoModal}
            vendedores={vendedores}
            turmas={turmas}
            motivosPerda={motivosPerda}
            moverEtapa={moverEtapa}
            onFechar={() => { setModalAberto(false); setEditando(null); setNovoModal(false); carregarProspeccoes() }}
          />
        )}
      </div>
    </Layout>
  )
}

interface ModalProspeccaoProps {
  aberto: boolean; prospeccao: Prospeccao | null; novoModal: boolean
  vendedores: Vendedor[]; turmas: Turma[]; motivosPerda: MotivoPerda[]
  moverEtapa: (p: Prospeccao, novaEtapa: string, motivoId?: string) => Promise<void>
  onFechar: () => void
}

function ModalProspeccao({ aberto, prospeccao, novoModal, vendedores, turmas, motivosPerda, moverEtapa, onFechar }: ModalProspeccaoProps) {
  const [form, setForm] = useState<any>({
    nome_contato: '', empresa: '', whatsapp: '', email: '', cidade: '',
    vendedor_id: '', turma_id: '', observacoes: '',
  })
  const [andamentos, setAndamentos] = useState<any[]>([])
  const [tipoAndamento, setTipoAndamento] = useState('ligacao')
  const [obsAndamento, setObsAndamento] = useState('')
  const [motivoSelecionado, setMotivoSelecionado] = useState('')
  const [mostrarPerda, setMostrarPerda] = useState(false)
  const [mostrarGanho, setMostrarGanho] = useState(false)

  useEffect(() => {
    if (prospeccao) {
      setForm({
        nome_contato: prospeccao.nome_contato, empresa: prospeccao.empresa || '',
        whatsapp: prospeccao.whatsapp || '', email: prospeccao.email || '',
        cidade: prospeccao.cidade || '', vendedor_id: prospeccao.vendedor_id || '',
        turma_id: prospeccao.turma_id || '', observacoes: prospeccao.observacoes || '',
      })
      carregarAndamentos(prospeccao.id)
    } else {
      setForm({
        nome_contato: '', empresa: '', whatsapp: '', email: '', cidade: '',
        vendedor_id: '', turma_id: '', observacoes: '',
      })
      setAndamentos([])
    }
    setMostrarPerda(false); setMostrarGanho(false); setMotivoSelecionado('')
  }, [prospeccao, aberto])

  async function carregarAndamentos(prospId: string) {
    const { data } = await supabase.from('prospeccao_andamentos')
      .select('*').eq('prospeccao_id', prospId).order('criado_em', { ascending: false })
    if (data) setAndamentos(data)
  }

  async function salvar() {
    if (prospeccao) {
      await supabase.from('prospeccoes_externas').update({
        nome_contato: form.nome_contato, empresa: form.empresa || null,
        whatsapp: form.whatsapp || null, email: form.email || null,
        cidade: form.cidade || null, vendedor_id: form.vendedor_id || null,
        turma_id: form.turma_id || null, observacoes: form.observacoes || null,
        atualizado_em: new Date().toISOString(),
      }).eq('id', prospeccao.id)
    } else {
      await supabase.from('prospeccoes_externas').insert({
        nome_contato: form.nome_contato, empresa: form.empresa || null,
        whatsapp: form.whatsapp || null, email: form.email || null,
        cidade: form.cidade || null, vendedor_id: form.vendedor_id || null,
        turma_id: form.turma_id || null, etapa: 'tentativa_contato',
        observacoes: form.observacoes || null,
      })
    }
    onFechar()
  }

  async function adicionarAndamento() {
    if (!prospeccao || !obsAndamento.trim()) return
    await supabase.from('prospeccao_andamentos').insert({
      prospeccao_id: prospeccao.id, vendedor_id: prospeccao.vendedor_id,
      tipo: tipoAndamento, observacao: obsAndamento,
      etapa_anterior: prospeccao.etapa, etapa_nova: prospeccao.etapa,
    })
    setObsAndamento('')
    carregarAndamentos(prospeccao.id)
  }

  async function confirmarPerda() {
    if (!prospeccao || !motivoSelecionado) return
    await moverEtapa(prospeccao, 'perdido', motivoSelecionado)
    onFechar()
  }

  if (!aberto) return null

  const labelStyle = { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' as const }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 12, padding: 24, width: 580, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: '#fff', margin: 0 }}>{novoModal ? 'Nova prospecção' : form.nome_contato}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>x</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Nome do contato *</label>
            <input style={inp} value={form.nome_contato} onChange={e => setForm((f: any) => ({ ...f, nome_contato: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Empresa</label>
            <input style={inp} value={form.empresa} onChange={e => setForm((f: any) => ({ ...f, empresa: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>WhatsApp</label>
            <input style={inp} value={form.whatsapp} onChange={e => setForm((f: any) => ({ ...f, whatsapp: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inp} value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Cidade</label>
            <input style={inp} value={form.cidade} onChange={e => setForm((f: any) => ({ ...f, cidade: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Vendedor externo</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.vendedor_id} onChange={e => setForm((f: any) => ({ ...f, vendedor_id: e.target.value }))}>
              <option value="">—</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Turma de interesse</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.turma_id} onChange={e => setForm((f: any) => ({ ...f, turma_id: e.target.value }))}>
              <option value="">—</option>
              {turmas.map(t => (
                <option key={t.id} value={t.id}>
                  {t.produtos?.nome} — {t.cidades?.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Observações</label>
          <textarea style={{ ...inp, resize: 'none', minHeight: 60 } as React.CSSProperties} rows={2}
            value={form.observacoes} onChange={e => setForm((f: any) => ({ ...f, observacoes: e.target.value }))} />
        </div>

        {!novoModal && prospeccao && (
          <>
            <div style={{ borderTop: '1px solid #3a3a3c', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Avançar funil</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ETAPAS.filter(e => e.id !== prospeccao.etapa).map(e => (
                  <button key={e.id} onClick={() => moverEtapa(prospeccao, e.id).then(onFechar)}
                    style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${e.cor}40`, background: e.bg, color: e.cor, fontSize: 11, cursor: 'pointer' }}>
                    → {e.label}
                  </button>
                ))}
                <button onClick={() => setMostrarGanho(!mostrarGanho)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #4ade8040', background: '#052e16', color: '#4ade80', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✓ Ganho
                </button>
                <button onClick={() => setMostrarPerda(!mostrarPerda)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #f8717140', background: '#450a0a', color: '#f87171', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✗ Perda
                </button>
              </div>

              {mostrarGanho && (
                <div style={{ marginTop: 12, padding: 12, background: '#052e16', borderRadius: 8, border: '1px solid #4ade8040' }}>
                  <p style={{ fontSize: 12, color: '#4ade80', marginBottom: 8 }}>
                    Para marcar como ganho, vá em <strong>Turmas → [turma] → Nova venda</strong>, crie a matrícula e o vendedor externo será comissionado.
                  </p>
                  <p style={{ fontSize: 11, color: '#9ca3af' }}>
                    Esta funcionalidade será automatizada em breve.
                  </p>
                </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, marginBottom: 12 }}>
                <select style={{ ...inp, cursor: 'pointer' }} value={tipoAndamento} onChange={e => setTipoAndamento(e.target.value)}>
                  <option value="ligacao">Ligação</option>
                  <option value="visita">Visita</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="outro">Outro</option>
                </select>
                <input style={inp} placeholder="O que aconteceu?" value={obsAndamento} onChange={e => setObsAndamento(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') adicionarAndamento() }} />
                <button onClick={adicionarAndamento} style={btnPrimary}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {andamentos.map(a => (
                  <div key={a.id} style={{ padding: 10, background: '#1c1c1e', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#2e1065', color: '#a78bfa', textTransform: 'uppercase' }}>
                        {a.tipo || 'andamento'}
                      </span>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>{new Date(a.criado_em).toLocaleString('pt-BR')}</span>
                    </div>
                    <div style={{ color: '#d1d1d1' }}>{a.observacao}</div>
                  </div>
                ))}
                {andamentos.length === 0 && <p style={{ fontSize: 12, color: '#6b7280' }}>Nenhum andamento registrado.</p>}
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onFechar} style={btnSecondary}>Cancelar</button>
          <button onClick={salvar} disabled={!form.nome_contato} style={{ ...btnPrimary, opacity: form.nome_contato ? 1 : 0.5 }}>
            {novoModal ? 'Criar prospecção' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}