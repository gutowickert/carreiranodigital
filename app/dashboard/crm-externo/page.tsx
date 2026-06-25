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
  matricula_id: string
  criado_em: string
  usuarios_perfil?: { id: string; nome: string }
  turmas?: { id: string; codigo: string; produtos: { nome: string }; cidades: { nome: string } }
}

type Vendedor = { id: string; nome: string }
type Turma = { id: string; codigo: string; produtos: { nome: string }; cidades: { nome: string } }
type MotivoPerda = { id: string; nome: string }
type MatriculaDisponivel = { id: string; aluno_id: string; valor_pago: number; data_compra: string; aluno_nome?: string; aluno_cpf?: string }

const ETAPAS = [
  { id: 'tentativa_contato', label: 'Tentativa contato', cor: 'var(--text-faint)', bg: 'var(--surface-2)' },
  { id: 'ligacao_quente', label: 'Ligação quente', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  { id: 'ligacao_fria', label: 'Ligação fria', cor: 'var(--text-muted)', bg: 'var(--surface-2)' },
  { id: 'visita_quente', label: 'Visita quente', cor: 'var(--green)', bg: 'var(--green-bg)' },
  { id: 'visita_fria', label: 'Visita fria', cor: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  { id: 'whatsapp_quente', label: 'WhatsApp quente', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  { id: 'whatsapp_frio', label: 'WhatsApp frio', cor: 'var(--text-muted)', bg: 'var(--surface-2)' },
]

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const sel = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

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
      alert('Para marcar como ganho, abra a prospecção e use o botão "✓ Ganho".')
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
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>CRM Externo</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>{prospeccoesFiltradas.length} prospecção(ões) ativas</p>
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
          <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>⚠ Nenhum vendedor externo cadastrado</div>
            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>
              Cadastre usuários com setor "comercial_externo" em /dashboard/usuarios.
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
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.nome_contato}</div>
                      {p.empresa && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.empresa}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{p.whatsapp || p.cidade || '-'}</div>
                      {p.turmas && (
                        <div style={{ fontSize: 10, color: 'var(--accent-soft)', marginTop: 6, padding: '2px 6px', background: 'var(--accent-bg)', borderRadius: 4, display: 'inline-block' }}>
                          {p.turmas.codigo || p.turmas.produtos?.nome}
                        </div>
                      )}
                      {p.usuarios_perfil && (
                        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>👤 {p.usuarios_perfil.nome}</div>
                      )}
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', border: '1px dashed var(--border)', borderRadius: 8 }}>
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
              <p style={{ padding: 24, fontSize: 14, color: 'var(--text-faint)' }}>Nenhuma prospecção no funil.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    {['Contato', 'Empresa', 'Cidade', 'Vendedor', 'Turma', 'Etapa'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prospeccoesFiltradas.map(p => {
                    const etapa = ETAPAS.find(e => e.id === p.etapa)
                    return (
                      <tr key={p.id} onClick={() => { setEditando(p); setNovoModal(false); setModalAberto(true) }}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{p.nome_contato}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{p.empresa || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{p.cidade || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{p.usuarios_perfil?.nome || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{p.turmas?.codigo || p.turmas?.produtos?.nome || '-'}</td>
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

  const labelStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' as const }
  const turmaSelecionada = turmas.find(t => t.id === form.turma_id)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 580, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{novoModal ? 'Nova prospecção' : form.nome_contato}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 22, cursor: 'pointer' }}>x</button>
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
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Avançar funil</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ETAPAS.filter(e => e.id !== prospeccao.etapa).map(e => (
                  <button key={e.id} onClick={() => moverEtapa(prospeccao, e.id).then(onFechar)}
                    style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${e.cor}40`, background: e.bg, color: e.cor, fontSize: 11, cursor: 'pointer' }}>
                    → {e.label}
                  </button>
                ))}
                <button onClick={() => setMostrarGanho(!mostrarGanho)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--green-strong)', background: 'var(--green-bg)', color: 'var(--green-strong)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✓ Ganho
                </button>
                <button onClick={() => setMostrarPerda(!mostrarPerda)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✗ Perda
                </button>
              </div>

              {mostrarGanho && (
                <ModalGanhoVincularExterno prospeccao={prospeccao} turma={turmaSelecionada} onFechar={() => { setMostrarGanho(false); onFechar() }} />
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
                  <div key={a.id} style={{ padding: 10, background: 'var(--bg)', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--accent-bg)', color: 'var(--accent-soft)', textTransform: 'uppercase' }}>
                        {a.tipo || 'andamento'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{new Date(a.criado_em).toLocaleString('pt-BR')}</span>
                    </div>
                    <div style={{ color: 'var(--text-2)' }}>{a.observacao}</div>
                  </div>
                ))}
                {andamentos.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nenhum andamento registrado.</p>}
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

// ============ VINCULAR MATRÍCULA NO CRM EXTERNO ============

interface ModalGanhoVincularExternoProps {
  prospeccao: Prospeccao
  turma: Turma | undefined
  onFechar: () => void
}

function ModalGanhoVincularExterno({ prospeccao, turma, onFechar }: ModalGanhoVincularExternoProps) {
  const [matriculas, setMatriculas] = useState<MatriculaDisponivel[]>([])
  const [matriculaSelecionada, setMatriculaSelecionada] = useState<string>('')
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (turma) carregarMatriculas()
    else setCarregando(false)
  }, [turma])

  async function carregarMatriculas() {
    if (!turma) return
    setCarregando(true)
    
    const { data } = await supabase.from('matriculas')
      .select('id, aluno_id, valor_pago, data_compra, alunos(nome, cpf)')
      .eq('turma_id', turma.id)
      .order('data_compra', { ascending: false })
    
    if (data) {
      setMatriculas(data.map((m: any) => ({
        id: m.id, aluno_id: m.aluno_id, valor_pago: m.valor_pago,
        data_compra: m.data_compra, aluno_nome: m.alunos?.nome, aluno_cpf: m.alunos?.cpf,
      })))
    }
    setCarregando(false)
  }

  async function confirmar() {
    if (!matriculaSelecionada || !turma) return
    setSalvando(true); setMensagem('')

    const mat = matriculas.find(m => m.id === matriculaSelecionada)
    if (!mat) { setSalvando(false); return }

    // Vincula matrícula ao vendedor externo (e atualiza vendedor_id se ainda não tem)
    const { data: matAtual } = await supabase.from('matriculas')
      .select('vendedor_id').eq('id', matriculaSelecionada).single()
    
    const updatePayload: any = {}
    if (!matAtual?.vendedor_id) {
      updatePayload.vendedor_id = prospeccao.vendedor_id
    }

    if (Object.keys(updatePayload).length > 0) {
      await supabase.from('matriculas').update(updatePayload).eq('id', matriculaSelecionada)
    }

    // Atualiza prospecção para ganho
    await supabase.from('prospeccoes_externas').update({
      etapa: 'ganho',
      data_ganho: new Date().toISOString(),
      valor_venda: mat.valor_pago,
      matricula_id: matriculaSelecionada,
      atualizado_em: new Date().toISOString(),
    }).eq('id', prospeccao.id)

    await supabase.from('prospeccao_andamentos').insert({
      prospeccao_id: prospeccao.id, vendedor_id: prospeccao.vendedor_id,
      tipo: 'outro',
      etapa_anterior: prospeccao.etapa, etapa_nova: 'ganho',
      observacao: `Vinculado à matrícula de ${mat.aluno_nome} (R$ ${mat.valor_pago.toFixed(2)})`,
    })

    setMensagem('Prospecção marcada como ganho!')
    setTimeout(onFechar, 800)
  }

  return (
    <div style={{ marginTop: 12, padding: 16, background: 'var(--green-bg)', borderRadius: 8, border: '1px solid var(--green-strong)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-strong)', marginBottom: 12 }}>
        Vincular matrícula existente
      </div>

      {!turma && (
        <p style={{ fontSize: 12, color: 'var(--red)' }}>
          Esta prospecção não tem turma vinculada. Vincule uma turma primeiro.
        </p>
      )}

      {turma && carregando && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando matrículas...</p>
      )}

      {turma && !carregando && matriculas.length === 0 && (
        <div>
          <p style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 8 }}>
            Nenhuma matrícula disponível para esta turma ainda.
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Crie a matrícula primeiro em <strong>Turmas → {turma.produtos?.nome} → Nova venda</strong>, depois volte aqui para vincular.
          </p>
        </div>
      )}

      {turma && matriculas.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            Selecione a matrícula desta prospecção:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {matriculas.map(m => (
              <div key={m.id} onClick={() => setMatriculaSelecionada(m.id)}
                style={{
                  padding: 10, borderRadius: 6, cursor: 'pointer',
                  border: matriculaSelecionada === m.id ? '2px solid var(--green-strong)' : '1px solid var(--border)',
                  background: matriculaSelecionada === m.id ? 'var(--green-bg)' : 'var(--bg)',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{m.aluno_nome}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                      {m.aluno_cpf && `CPF: ${m.aluno_cpf} · `}
                      {new Date(m.data_compra).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
                    R$ {m.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {mensagem && (
            <p style={{ marginTop: 10, fontSize: 12, color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green)' }}>{mensagem}</p>
          )}

          <button onClick={confirmar} disabled={!matriculaSelecionada || salvando}
            style={{ ...btnPrimary, background: 'var(--green)', marginTop: 12, width: '100%', opacity: (matriculaSelecionada && !salvando) ? 1 : 0.5 }}>
            {salvando ? 'Vinculando...' : 'Confirmar vinculação'}
          </button>
        </>
      )}
    </div>
  )
}