'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type VendedorStats = {
  id: string
  nome: string
  setor: string
  matriculas_count: number
  total_vendido: number
  ticket_medio: number
  comissao_acumulada: number
  percentual: number
  leads_recebidos: number
  leads_ganhos: number
  leads_perdidos: number
  conversao: number
  matriculas_detalhes: any[]
  leads_detalhes: any[]
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const sel = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties

function calcularPctInterno(total: number): number {
  if (total <= 40000) return 8
  if (total <= 60000) return 9
  return 10
}

const ETAPA_LABELS: Record<string, string> = {
  atendimento_inicial: 'Atendimento', em_atendimento: 'Em atendimento', agendado: 'Agendado',
  ligacao_quente: 'Lig. quente', ligacao_fria: 'Lig. fria',
  whatsapp_quente: 'WP quente', whatsapp_frio: 'WP frio',
  visita_quente: 'Visita quente', visita_fria: 'Visita fria',
  tentativa_contato: 'Tentativa', ganho: 'Ganho', perdido: 'Perdido',
}

export default function DashboardVendedores() {
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7))
  const [filtroSetor, setFiltroSetor] = useState<'todos' | 'comercial' | 'comercial_externo'>('todos')
  const [vendedores, setVendedores] = useState<VendedorStats[]>([])
  const [carregando, setCarregando] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => { carregar() }, [mesFiltro, filtroSetor])

  async function carregar() {
    setCarregando(true)

    let queryUsuarios = supabase.from('usuarios_perfil')
      .select('id, nome, setor')
      .in('setor', ['comercial', 'comercial_externo'])
      .eq('ativo', true)
    
    if (filtroSetor !== 'todos') queryUsuarios = queryUsuarios.eq('setor', filtroSetor)

    const { data: usuarios } = await queryUsuarios

    if (!usuarios) { setVendedores([]); setCarregando(false); return }

    const [ano, mes] = mesFiltro.split('-').map(Number)
    const mesAlvo = mes - 1
    const dataInicio = `${mesFiltro}-01`
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dataFim = `${mesFiltro}-${String(ultimoDia).padStart(2, '0')}`

    const { data: matriculasData } = await supabase.from('matriculas')
      .select('id, vendedor_id, valor_pago, parcelas, data_compra, aluno_id, turma_id')
      .not('vendedor_id', 'is', null)
      .neq('status', 'cancelada')

    const alunoIds = [...new Set((matriculasData || []).map(m => m.aluno_id))]
    const turmaIds = [...new Set((matriculasData || []).map(m => m.turma_id))]
    const { data: alunosData } = await supabase.from('alunos').select('id, nome').in('id', alunoIds.length > 0 ? alunoIds : ['00000000-0000-0000-0000-000000000000'])
    const { data: turmasData } = await supabase.from('turmas').select('id, codigo, produtos(nome)').in('id', turmaIds.length > 0 ? turmaIds : ['00000000-0000-0000-0000-000000000000'])
    const alunosMap = new Map((alunosData || []).map(a => [a.id, a.nome]))
    const turmasMap = new Map((turmasData || []).map((t: any) => [t.id, `${t.produtos?.nome} ${t.codigo ? '— ' + t.codigo : ''}`]))

    const { data: leadsData } = await supabase.from('leads')
      .select('id, nome, vendedor_id, etapa, data_ganho, data_perda, criado_em, valor_venda')
      .not('vendedor_id', 'is', null)
      .gte('criado_em', dataInicio)
      .lte('criado_em', `${dataFim}T23:59:59`)

    const { data: prospeccoesData } = await supabase.from('prospeccoes_externas')
      .select('id, nome_contato, vendedor_id, etapa, data_ganho, data_perda, criado_em, valor_venda')
      .not('vendedor_id', 'is', null)
      .gte('criado_em', dataInicio)
      .lte('criado_em', `${dataFim}T23:59:59`)

    const resultado: VendedorStats[] = usuarios.map(u => {
      let totalVendido = 0
      let matriculasCount = 0
      const matriculasDetalhes: any[] = []

      for (const m of matriculasData || []) {
        if (m.vendedor_id !== u.id) continue
        const dataCompra = new Date(m.data_compra)
        const valorParcela = m.valor_pago / (m.parcelas || 1)
        
        for (let i = 0; i < (m.parcelas || 1); i++) {
          const dataParcela = new Date(dataCompra)
          dataParcela.setMonth(dataParcela.getMonth() + i)
          if (dataParcela.getFullYear() === ano && dataParcela.getMonth() === mesAlvo) {
            totalVendido += valorParcela
            matriculasCount += 1
            matriculasDetalhes.push({
              aluno: alunosMap.get(m.aluno_id) || '-',
              turma: turmasMap.get(m.turma_id) || '-',
              valor_parcela: valorParcela,
              parcela_num: i + 1,
              parcelas_total: m.parcelas || 1,
              data_compra: m.data_compra,
            })
          }
        }
      }

      const ticketMedio = matriculasCount > 0 ? totalVendido / matriculasCount : 0
      const pct = u.setor === 'comercial_externo' ? 10 : calcularPctInterno(totalVendido)
      const comissao = (totalVendido * pct) / 100

      const dadosCrm: any[] = u.setor === 'comercial_externo' ? (prospeccoesData || []) : (leadsData || [])
      const meusLeads = dadosCrm.filter(l => l.vendedor_id === u.id)
      const ganhos = meusLeads.filter(l => l.etapa === 'ganho').length
      const perdidos = meusLeads.filter(l => l.etapa === 'perdido').length
      const total = meusLeads.length
      const conversao = total > 0 ? (ganhos / total) * 100 : 0

      return {
        id: u.id, nome: u.nome, setor: u.setor,
        matriculas_count: matriculasCount,
        total_vendido: totalVendido,
        ticket_medio: ticketMedio,
        comissao_acumulada: comissao,
        percentual: pct,
        leads_recebidos: total,
        leads_ganhos: ganhos,
        leads_perdidos: perdidos,
        conversao,
        matriculas_detalhes: matriculasDetalhes,
        leads_detalhes: meusLeads,
      }
    }).sort((a, b) => b.total_vendido - a.total_vendido)

    setVendedores(resultado)
    setCarregando(false)
  }

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  const totalVendido = vendedores.reduce((s, v) => s + v.total_vendido, 0)
  const totalComissao = vendedores.reduce((s, v) => s + v.comissao_acumulada, 0)
  const totalMatriculas = vendedores.reduce((s, v) => s + v.matriculas_count, 0)
  const ticketGeral = totalMatriculas > 0 ? totalVendido / totalMatriculas : 0

  const medalhas = ['🥇', '🥈', '🥉']

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Dashboard de Vendedores</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Performance, ranking e comissões</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select style={sel} value={filtroSetor} onChange={e => setFiltroSetor(e.target.value as any)}>
              <option value="todos">Todos</option>
              <option value="comercial">Internos</option>
              <option value="comercial_externo">Externos</option>
            </select>
            <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total vendido</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#34d399' }}>{fmt(totalVendido)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Matrículas</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{totalMatriculas}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Ticket médio</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#60a5fa' }}>{fmt(ticketGeral)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total comissão</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#a78bfa' }}>{fmt(totalComissao)}</div>
          </div>
        </div>

        {carregando ? (
          <div style={{ ...card, padding: 24 }}>
            <p style={{ fontSize: 13, color: '#6b7280' }}>Calculando...</p>
          </div>
        ) : vendedores.length === 0 ? (
          <div style={{ ...card, padding: 24 }}>
            <p style={{ fontSize: 14, color: '#6b7280' }}>Nenhum vendedor encontrado.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vendedores.map((v, i) => (
              <div key={v.id} style={card}>
                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '60px 1fr repeat(5, auto)', gap: 24, alignItems: 'center' }}>
                  <div style={{ fontSize: 32, textAlign: 'center' }}>
                    {medalhas[i] || <span style={{ fontSize: 16, color: '#6b7280', fontWeight: 700 }}>#{i + 1}</span>}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{v.nome}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: v.setor === 'comercial_externo' ? '#431407' : '#172554',
                        color: v.setor === 'comercial_externo' ? '#fb923c' : '#60a5fa',
                        textTransform: 'uppercase', fontWeight: 600 }}>
                        {v.setor === 'comercial_externo' ? 'Externo' : 'Interno'}
                      </span>
                    </div>
                    <button onClick={() => setExpandido(expandido === v.id ? null : v.id)}
                      style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                      {expandido === v.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                    </button>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Vendido</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#34d399' }}>{fmt(v.total_vendido)}</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Matrículas</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{v.matriculas_count}</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Ticket médio</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa' }}>{fmt(v.ticket_medio)}</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Conversão CRM</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: v.conversao >= 30 ? '#34d399' : v.conversao >= 15 ? '#fbbf24' : '#f87171' }}>
                      {v.conversao.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>
                      {v.leads_ganhos}/{v.leads_recebidos}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Comissão {v.percentual}%</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#a78bfa' }}>{fmt(v.comissao_acumulada)}</div>
                  </div>
                </div>

                {expandido === v.id && (
                  <div style={{ borderTop: '1px solid #3a3a3c', padding: '16px 20px', background: '#1c1c1e' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                          Matrículas no mês ({v.matriculas_detalhes.length})
                        </div>
                        {v.matriculas_detalhes.length === 0 ? (
                          <p style={{ fontSize: 12, color: '#6b7280' }}>Nenhuma matrícula no período.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                            {v.matriculas_detalhes.map((d, idx) => (
                              <div key={idx} style={{ padding: 8, background: '#2c2c2e', borderRadius: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{d.aluno}</div>
                                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                      {d.turma}
                                      {d.parcelas_total > 1 && ` · ${d.parcela_num}/${d.parcelas_total}`}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>{fmt(d.valor_parcela)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                          {v.setor === 'comercial_externo' ? 'Prospecções' : 'Leads'} no mês ({v.leads_detalhes.length})
                        </div>
                        {v.leads_detalhes.length === 0 ? (
                          <p style={{ fontSize: 12, color: '#6b7280' }}>Nenhum {v.setor === 'comercial_externo' ? 'prospecção' : 'lead'} no período.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                            {v.leads_detalhes.map((l: any) => (
                              <div key={l.id} style={{ padding: 8, background: '#2c2c2e', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: 12, color: '#fff' }}>{l.nome || l.nome_contato}</div>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                  background: l.etapa === 'ganho' ? '#052e16' : l.etapa === 'perdido' ? '#450a0a' : '#1f2937',
                                  color: l.etapa === 'ganho' ? '#34d399' : l.etapa === 'perdido' ? '#f87171' : '#9ca3af',
                                  textTransform: 'uppercase', fontWeight: 600 }}>
                                  {ETAPA_LABELS[l.etapa] || l.etapa}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}