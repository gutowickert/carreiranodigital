'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Lead = {
  id: string
  nome: string
  email: string
  whatsapp: string
  cidade: string
  origem: string
  status: string
  agendamento_em: string
  negocio?: string
  tamanho_equipe?: string
  investimento_marketing?: string
  gera_contatos_digital?: string
  problema_principal?: string
  melhor_turno?: string
  criado_em: string
  produtos: { nome: string } | null
}

type Produto = { id: string; nome: string }

const statusFunil = [
  { key: 'aguardando_atendimento', label: 'Aguardando', resp: 'SDR', bg: 'var(--blue-bg)', cor: 'var(--blue)' },
  { key: 'atendimento_inicial', label: 'Atendimento', resp: 'SDR', bg: 'var(--amber-bg)', cor: 'var(--amber)' },
  { key: 'nao_agendou', label: 'Não Agendou', resp: 'SDR', bg: 'var(--red-bg)', cor: 'var(--red)' },
  { key: 'agendado', label: 'Agendado', resp: 'SDR', bg: 'var(--green-bg)', cor: 'var(--green-strong)' },
  { key: 'nao_atendeu', label: 'Não Atendeu', resp: 'SDR', bg: 'var(--amber-bg)', cor: 'var(--text-muted)' },
  { key: 'ligacao_quente', label: 'Quente 🔥', resp: 'Closer', bg: 'var(--amber-bg)', cor: 'var(--amber)' },
  { key: 'ligacao_fria', label: 'Fria ❄️', resp: 'Closer', bg: 'var(--accent-bg)', cor: 'var(--accent-soft)' },
  { key: 'venda_ganha', label: 'Venda Ganha', resp: '—', bg: 'var(--green-bg)', cor: 'var(--green)' },
  { key: 'venda_perdida', label: 'Venda Perdida', resp: '—', bg: 'var(--red-bg)', cor: 'var(--red)' },
]

const turnoBg: Record<string, { bg: string; color: string }> = {
  manha: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  tarde: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  noite: { bg: 'var(--accent-bg)', color: 'var(--accent-soft)' },
}

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const input = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const select = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [selecionado, setSelecionado] = useState<Lead | null>(null)
  const [contatos, setContatos] = useState<any[]>([])
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [carregando, setCarregando] = useState(true)
  const [novoLead, setNovoLead] = useState(false)
  const [novoContato, setNovoContato] = useState(false)
  const [mostrarPerda, setMostrarPerda] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [agendamentoEm, setAgendamentoEm] = useState('')
  const [motivoPerda, setMotivoPerda] = useState('')

  const [lNome, setLNome] = useState('')
  const [lWhatsapp, setLWhatsapp] = useState('')
  const [lEmail, setLEmail] = useState('')
  const [lCidade, setLCidade] = useState('')
  const [lNegocio, setLNegocio] = useState('')
  const [lEquipe, setLEquipe] = useState('')
  const [lInvestimento, setLInvestimento] = useState('')
  const [lGeraContatos, setLGeraContatos] = useState('')
  const [lProblema, setLProblema] = useState('')
  const [lTurno, setLTurno] = useState('')
  const [lOrigem, setLOrigem] = useState('formulario')
  const [lProdutoId, setLProdutoId] = useState('')
  const [cCanal, setCCanal] = useState('whatsapp')
  const [cDescricao, setCDescricao] = useState('')
  const [cResultado, setCResultado] = useState('respondeu')

  useEffect(() => { carregarLeads(); carregarProdutos() }, [])
  useEffect(() => { if (selecionado) carregarContatos(selecionado.id) }, [selecionado])

  async function carregarLeads() {
    setCarregando(true)
    const { data } = await supabase.from('leads').select('*, produtos:produto_interesse_id(nome)').order('criado_em', { ascending: false })
    if (data) setLeads(data)
    setCarregando(false)
  }

  async function carregarProdutos() {
    const { data } = await supabase.from('produtos').select('id, nome').eq('ativo', true).order('nome')
    if (data) setProdutos(data)
  }

  async function carregarContatos(leadId: string) {
    const { data } = await supabase.from('contatos_lead').select('*').eq('lead_id', leadId).order('criado_em', { ascending: false })
    if (data) setContatos(data)
  }

  async function salvarLead(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true)
    const { error } = await supabase.from('leads').insert({ nome: lNome, whatsapp: lWhatsapp, email: lEmail, cidade: lCidade, origem: lOrigem, produto_interesse_id: lProdutoId || null, status: 'aguardando_atendimento', negocio: lNegocio, tamanho_equipe: lEquipe, investimento_marketing: lInvestimento, gera_contatos_digital: lGeraContatos, problema_principal: lProblema, melhor_turno: lTurno })
    if (!error) { setNovoLead(false); setLNome(''); setLWhatsapp(''); setLEmail(''); setLCidade(''); setLNegocio(''); setLEquipe(''); setLInvestimento(''); setLGeraContatos(''); setLProblema(''); setLTurno(''); carregarLeads() }
    setSalvando(false)
  }

  async function salvarContato(e: React.FormEvent) {
    e.preventDefault(); if (!selecionado) return; setSalvando(true)
    await supabase.from('contatos_lead').insert({ lead_id: selecionado.id, canal: cCanal, descricao: cDescricao, resultado: cResultado })
    setCDescricao(''); setNovoContato(false); carregarContatos(selecionado.id); setSalvando(false)
  }

  async function atualizarStatus(leadId: string, novoStatus: string) {
    const updates: any = { status: novoStatus }
    if (novoStatus === 'agendado' && agendamentoEm) updates.agendamento_em = agendamentoEm
    if (novoStatus === 'venda_perdida' && motivoPerda) updates.motivo_perda = motivoPerda
    await supabase.from('leads').update(updates).eq('id', leadId)
    setMostrarPerda(false); setAgendamentoEm(''); carregarLeads()
    setSelecionado(prev => prev ? { ...prev, status: novoStatus, ...updates } : null)
  }

  const leadsFiltrados = leads.filter(l => filtroStatus === 'todos' || l.status === filtroStatus)
  const contagemPorStatus = statusFunil.reduce((acc, s) => { acc[s.key] = leads.filter(l => l.status === s.key).length; return acc }, {} as Record<string, number>)
  const statusInfo = (key: string) => statusFunil.find(s => s.key === key)

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)' }}>CRM Comercial</h1>
        <button onClick={() => setNovoLead(!novoLead)} style={btnPrimary}>+ Novo lead</button>
      </div>

      {/* Funil */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px', marginBottom: '24px' }}>
        {statusFunil.map(s => (
          <div key={s.key} onClick={() => setFiltroStatus(filtroStatus === s.key ? 'todos' : s.key)}
            style={{ backgroundColor: s.bg, border: `1px solid ${s.cor}33`, borderRadius: '10px', padding: '12px', cursor: 'pointer', outline: filtroStatus === s.key ? `2px solid ${s.cor}` : 'none' }}>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.cor }}>{contagemPorStatus[s.key] || 0}</div>
            <div style={{ fontSize: '11px', fontWeight: '500', color: s.cor, marginTop: '4px', lineHeight: '1.3' }}>{s.label}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '2px' }}>{s.resp}</div>
          </div>
        ))}
      </div>

      {/* Form novo lead */}
      {novoLead && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px' }}>Cadastrar novo lead</div>
          <form onSubmit={salvarLead}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', marginBottom: '12px' }}>
              <input value={lNome} onChange={e => setLNome(e.target.value)} placeholder="Nome completo *" required style={input} />
              <input value={lWhatsapp} onChange={e => setLWhatsapp(e.target.value)} placeholder="WhatsApp" style={{ ...input, width: '160px' }} />
              <input value={lEmail} onChange={e => setLEmail(e.target.value)} placeholder="E-mail" type="email" style={{ ...input, width: '200px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input value={lCidade} onChange={e => setLCidade(e.target.value)} placeholder="Cidade" style={input} />
              <input value={lNegocio} onChange={e => setLNegocio(e.target.value)} placeholder="Seu negócio" style={input} />
              <select value={lEquipe} onChange={e => setLEquipe(e.target.value)} style={select}>
                <option value="">Tamanho da equipe</option>
                <option value="solo">Só eu</option>
                <option value="2_5">2 a 5</option>
                <option value="6_20">6 a 20</option>
                <option value="20+">Mais de 20</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <select value={lInvestimento} onChange={e => setLInvestimento(e.target.value)} style={select}>
                <option value="">Investimento em marketing</option>
                <option value="nao_investe">Não invisto</option>
                <option value="ate_500">Até R$ 500</option>
                <option value="500_2000">R$ 500 a R$ 2.000</option>
                <option value="2000_5000">R$ 2.000 a R$ 5.000</option>
                <option value="5000+">Acima de R$ 5.000</option>
              </select>
              <select value={lGeraContatos} onChange={e => setLGeraContatos(e.target.value)} style={select}>
                <option value="">Gera contatos pelo digital?</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
                <option value="pouco">Um pouco</option>
              </select>
              <select value={lTurno} onChange={e => setLTurno(e.target.value)} style={select}>
                <option value="">Melhor turno</option>
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </div>
            <textarea value={lProblema} onChange={e => setLProblema(e.target.value)} placeholder="Maior problema com marketing digital..."
              rows={2} style={{ ...input, resize: 'none', marginBottom: '12px' } as React.CSSProperties} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <select value={lOrigem} onChange={e => setLOrigem(e.target.value)} style={select}>
                <option value="formulario">Formulário</option>
                <option value="anuncio_meta">Meta Ads</option>
                <option value="anuncio_google">Google Ads</option>
                <option value="indicacao">Indicação</option>
                <option value="organico">Orgânico</option>
                <option value="outro">Outro</option>
              </select>
              <select value={lProdutoId} onChange={e => setLProdutoId(e.target.value)} style={select}>
                <option value="">Produto de interesse</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setNovoLead(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={salvando} style={btnPrimary}>{salvando ? 'Salvando...' : 'Cadastrar'}</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Lista */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {['todos', ...statusFunil.map(s => s.key)].map(s => {
              const info = statusFunil.find(x => x.key === s)
              return (
                <button key={s} onClick={() => setFiltroStatus(s)} style={{
                  fontSize: '12px', padding: '5px 12px', borderRadius: '20px', cursor: 'pointer', border: 'none',
                  backgroundColor: filtroStatus === s ? 'var(--accent)' : 'var(--surface-2)',
                  color: filtroStatus === s ? 'var(--on-accent)' : 'var(--text-muted)',
                }}>
                  {s === 'todos' ? 'Todos' : info?.label}
                </button>
              )
            })}
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{leadsFiltrados.length} lead{leadsFiltrados.length !== 1 ? 's' : ''}</span>
            </div>
            {carregando ? <p style={{ padding: '24px', fontSize: '14px', color: 'var(--text-faint)' }}>Carregando...</p>
              : leadsFiltrados.length === 0 ? <p style={{ padding: '24px', fontSize: '14px', color: 'var(--text-faint)' }}>Nenhum lead encontrado.</p>
              : leadsFiltrados.map(l => {
                const info = statusInfo(l.status)
                const turno = turnoBg[l.melhor_turno]
                return (
                  <div key={l.id} onClick={() => setSelecionado(l)}
                    style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', cursor: 'pointer', backgroundColor: selecionado?.id === l.id ? 'var(--surface-sel)' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{l.nome}</span>
                          {turno && <span style={{ fontSize: '11px', backgroundColor: turno.bg, color: turno.color, padding: '2px 8px', borderRadius: '20px' }}>{l.melhor_turno}</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {l.whatsapp && <span>📱 {l.whatsapp}</span>}
                          {l.cidade && <span>📍 {l.cidade}</span>}
                          {l.negocio && <span>🏢 {l.negocio}</span>}
                          {l.produtos && <span style={{ color: 'var(--accent-soft)' }}>📚 {l.produtos.nome}</span>}
                        </div>
                      </div>
                      {info && (
                        <span style={{ fontSize: '11px', backgroundColor: info.bg, color: info.cor, padding: '3px 10px', borderRadius: '20px', flexShrink: 0, marginLeft: '12px' }}>
                          {info.label}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Painel lead */}
        {selecionado && (
          <div style={{ width: '300px', flexShrink: 0 }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)' }}>{selecionado.nome}</div>
                {selecionado.produtos && <div style={{ fontSize: '12px', color: 'var(--accent-soft)', marginTop: '2px' }}>{selecionado.produtos.nome}</div>}
                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selecionado.whatsapp && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📱 {selecionado.whatsapp}</span>
                      <a href={`https://wa.me/55${selecionado.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: '11px', color: 'var(--green-strong)', textDecoration: 'none' }}>Abrir ↗</a>
                    </div>
                  )}
                  {selecionado.email && <div>✉️ {selecionado.email}</div>}
                  {selecionado.cidade && <div>📍 {selecionado.cidade}</div>}
                  {selecionado.negocio && <div>🏢 {selecionado.negocio}</div>}
                  {selecionado.tamanho_equipe && <div>👥 Equipe: {selecionado.tamanho_equipe}</div>}
                  {selecionado.investimento_marketing && <div>💰 {selecionado.investimento_marketing}</div>}
                </div>
                {selecionado.problema_principal && (
                  <div style={{ marginTop: '10px', backgroundColor: 'var(--surface-2)', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '4px' }}>Problema principal</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>{selecionado.problema_principal}</div>
                  </div>
                )}
              </div>

              {/* Mover no funil */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '8px' }}>Mover no funil</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {statusFunil.map(s => (
                    <button key={s.key} onClick={() => { if (s.key === 'venda_perdida') setMostrarPerda(true); else atualizarStatus(selecionado.id, s.key) }}
                      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', backgroundColor: selecionado.status === s.key ? s.bg : 'transparent', color: selecionado.status === s.key ? s.cor : 'var(--text-muted)', fontSize: '12px', fontWeight: selecionado.status === s.key ? '600' : '400', outline: selecionado.status === s.key ? `1px solid ${s.cor}44` : 'none' }}>
                      <span>{s.label}</span>
                      <span style={{ color: 'var(--text-faint)' }}>{s.resp}</span>
                    </button>
                  ))}
                </div>

                {selecionado.status === 'agendado' && (
                  <div style={{ marginTop: '8px' }}>
                    <input type="datetime-local" value={agendamentoEm} onChange={e => setAgendamentoEm(e.target.value)} style={input} />
                    {agendamentoEm && <button onClick={() => atualizarStatus(selecionado.id, 'agendado')} style={{ ...btnPrimary, width: '100%', marginTop: '6px' }}>Salvar horário</button>}
                  </div>
                )}

                {mostrarPerda && (
                  <div style={{ marginTop: '8px' }}>
                    <textarea value={motivoPerda} onChange={e => setMotivoPerda(e.target.value)} placeholder="Motivo da perda *" rows={2}
                      style={{ ...input, resize: 'none', marginBottom: '6px' } as React.CSSProperties} />
                    <button onClick={() => atualizarStatus(selecionado.id, 'venda_perdida')} style={{ ...btnPrimary, backgroundColor: 'var(--red)', width: '100%' }}>Confirmar perda</button>
                  </div>
                )}
              </div>

              {/* Histórico */}
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Histórico</span>
                  <button onClick={() => setNovoContato(!novoContato)} style={{ fontSize: '12px', color: 'var(--accent-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Registrar</button>
                </div>

                {novoContato && (
                  <form onSubmit={salvarContato} style={{ backgroundColor: 'var(--surface-2)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <select value={cCanal} onChange={e => setCCanal(e.target.value)} style={{ ...select, fontSize: '12px', padding: '6px 10px' }}>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="telefone">Telefone</option>
                        <option value="email">E-mail</option>
                        <option value="presencial">Presencial</option>
                      </select>
                      <select value={cResultado} onChange={e => setCResultado(e.target.value)} style={{ ...select, fontSize: '12px', padding: '6px 10px' }}>
                        <option value="sem_resposta">Sem resposta</option>
                        <option value="respondeu">Respondeu</option>
                        <option value="interessado">Interessado</option>
                        <option value="nao_interessado">Não interessado</option>
                        <option value="fechou">Fechou</option>
                      </select>
                    </div>
                    <textarea value={cDescricao} onChange={e => setCDescricao(e.target.value)} placeholder="O que foi conversado..." required rows={2}
                      style={{ ...input, resize: 'none', marginBottom: '8px', fontSize: '12px' } as React.CSSProperties} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" onClick={() => setNovoContato(false)} style={{ ...btnSecondary, flex: 1, fontSize: '12px', padding: '6px' }}>Cancelar</button>
                      <button type="submit" disabled={salvando} style={{ ...btnPrimary, flex: 1, fontSize: '12px', padding: '6px' }}>Salvar</button>
                    </div>
                  </form>
                )}

                {contatos.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Nenhum contato registrado.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                      {contatos.map(c => (
                        <div key={c.id} style={{ backgroundColor: 'var(--surface-2)', borderRadius: '8px', padding: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-2)', textTransform: 'capitalize' }}>{c.canal}</span>
                            <span style={{ fontSize: '11px', color: c.resultado === 'fechou' ? 'var(--green-strong)' : c.resultado === 'interessado' ? 'var(--accent-soft)' : 'var(--text-muted)' }}>
                              {c.resultado?.replace('_', ' ')}
                            </span>
                          </div>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{c.descricao}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '4px 0 0' }}>{new Date(c.criado_em).toLocaleString('pt-BR')}</p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}