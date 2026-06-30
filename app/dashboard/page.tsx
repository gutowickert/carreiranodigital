'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }

// Etapas reais do funil (ordem + cor) — antes usava novo/sdr/closer que não existem
const FUNIL_ETAPAS = [
  { id: 'aguardando_atendimento', label: 'Aguardando atend.', cor: '#9ca3af' },
  { id: 'atendimento_inicial', label: 'Atendimento', cor: '#60a5fa' },
  { id: 'lote_preco_ok', label: 'Lote e preço ok', cor: '#34d399' },
  { id: 'nao_chegou_preco', label: 'Não chegou no preço', cor: '#fb923c' },
  { id: 'oferecer_bolsa', label: 'Oferecer bolsa', cor: '#a78bfa' },
  { id: 'pediu_prazo', label: 'Pediu prazo', cor: '#fbbf24' },
  { id: 'aguardando_pagamento', label: 'Aguard. pagamento', cor: '#06b6d4' },
  { id: 'agendado', label: 'Agendado', cor: '#22d3ee' },
  { id: 'proxima_turma', label: 'Próxima turma', cor: '#c084fc' },
  { id: 'ganho', label: 'Ganhos', cor: '#4ade80' },
  { id: 'perda', label: 'Perdas', cor: '#f87171' },
]
const fmtBRL = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Tooltip dos gráficos no estilo do tema
function TipChart({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--text)', boxShadow: 'var(--shadow)' }}>
      <div style={{ color: 'var(--text-faint)', marginBottom: 2 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ fontWeight: 700, color: p.color || 'var(--text)' }}>{money ? fmtBRL(p.value) : p.value}</div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [carregando, setCarregando] = useState(true)
  const [stats, setStats] = useState({
    receitaPrevistaMes: 0, receitaRealizadaMes: 0,
    margemPrevistaMes: 0, margemRealizadaMes: 0,
    turmasAtivas: 0, totalMatriculas: 0,
    tarefasAtrasadas: 0, tarefasUrgentes: 0,
    trafegoHoje: 0, alunosTotal: 0, leadsTotal: 0,
  })
  const [turmasAndamento, setTurmasAndamento] = useState<any[]>([])
  const [proximasAulas, setProximasAulas] = useState<any[]>([])
  const [tarefasUrgentes, setTarefasUrgentes] = useState<any[]>([])
  const [funilLeads, setFunilLeads] = useState<any[]>([])
  const [topAlunos, setTopAlunos] = useState<any[]>([])
  const [serie30, setSerie30] = useState<{ dia: string; matriculas: number; receita: number }[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [tarefasLead, setTarefasLead] = useState<any[]>([])
  const [leadsRaw, setLeadsRaw] = useState<any[]>([])

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    async function carregarPerfil() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: p } = await supabase.from('usuarios_perfil')
        .select('id, papel, leads_escopo, crm_interno, crm_externo').eq('id', session.user.id).single()
      if (!p) return
      setPerfil(p)
      if (p.papel !== 'admin') {
        let q = supabase.from('tarefas_lead')
          .select('id, titulo, data_vencimento, vendedor_id')
          .eq('concluida', false).eq('cancelada', false)
          .order('data_vencimento').limit(8)
        q = q.eq('vendedor_id', p.id)
        const { data: tl } = await q
        setTarefasLead(tl || [])
      }
    }
    carregarPerfil()
  }, [])

  async function carregar() {
    setCarregando(true)
    const hoje = new Date()
    const hojeStr = hoje.toISOString().split('T')[0]
    const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
    const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
    const fimMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(ultimoDiaMes).padStart(2, '0')}`
    const data30Atras = new Date(hoje); data30Atras.setDate(data30Atras.getDate() - 30)
    const data30Str = data30Atras.toISOString().split('T')[0]
    const data7Frente = new Date(hoje); data7Frente.setDate(data7Frente.getDate() + 7)
    const data7Str = data7Frente.toISOString().split('T')[0]

    const [
      lancMes, turmasResp, turmasProgressoResp, aulasResp,
      tarefasResp, leadsResp, alunosResp, lancTrafegoHoje,
      matriculasResp,
    ] = await Promise.all([
      supabase.from('lancamentos_empresa').select('*')
        .gte('data_vencimento', inicioMes).lte('data_vencimento', fimMes),
      supabase.from('turmas').select('id, status').in('status', ['planejada', 'em_vendas', 'confirmada']),
      supabase.from('turmas').select('id, data_inicio, data_fim, meta_matriculas, vagas, status, produtos(nome), cidades(nome)')
        .in('status', ['em_vendas', 'confirmada', 'planejada']).order('data_inicio', { ascending: true }).limit(5),
      supabase.from('agenda_aulas').select('id, titulo, inicio, fim, turmas(produtos(nome)), professores(nome), salas(nome)')
        .gte('inicio', hojeStr).lte('inicio', data7Str).order('inicio').limit(8),
      supabase.from('tarefas').select('id, titulo, setor, data_prazo, prioridade, status, turmas(produtos(nome))')
        .neq('status', 'concluida').order('data_prazo', { ascending: true }).limit(50),
      supabase.from('leads').select('id, etapa, vendedor_id'),
      supabase.from('alunos').select('id, nome, ltv').order('ltv', { ascending: false }).limit(5),
      supabase.from('lancamentos_empresa').select('valor').eq('categoria', 'marketing').eq('data_vencimento', hojeStr).eq('status', 'previsto'),
      supabase.from('matriculas').select('data_compra, valor_pago').gte('data_compra', data30Str),
    ])

    const lanc = lancMes.data || []
    const receitaPrev = lanc.filter(l => l.tipo === 'receita' && l.status === 'previsto').reduce((s, l) => s + (l.valor || 0), 0)
    const receitaReal = lanc.filter(l => l.tipo === 'receita' && l.status === 'realizado').reduce((s, l) => s + (l.valor || 0), 0)
    const custoPrev = lanc.filter(l => l.tipo === 'custo' && l.status === 'previsto').reduce((s, l) => s + (l.valor || 0), 0)
    const custoReal = lanc.filter(l => l.tipo === 'custo' && l.status === 'realizado').reduce((s, l) => s + (l.valor || 0), 0)

    const tarefas = tarefasResp.data || []
    const atrasadas = tarefas.filter(t => new Date(t.data_prazo + 'T23:59:59') < new Date()).length
    const urgentes = tarefas.filter(t => t.prioridade === 'urgente' && t.status !== 'concluida').length

    const matriculas = matriculasResp.data || []
    const trafegoTotal = (lancTrafegoHoje.data || []).reduce((s, l) => s + (l.valor || 0), 0)

    // série contínua de 30 dias (matrículas + receita por dia)
    const porDiaCount: Record<string, number> = {}
    const porDiaReceita: Record<string, number> = {}
    matriculas.forEach((m: any) => {
      const d = m.data_compra?.substring(0, 10)
      if (d) { porDiaCount[d] = (porDiaCount[d] || 0) + 1; porDiaReceita[d] = (porDiaReceita[d] || 0) + (m.valor_pago || 0) }
    })
    const serie: { dia: string; matriculas: number; receita: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(hoje); dt.setDate(dt.getDate() - i)
      const ds = dt.toISOString().split('T')[0]
      serie.push({ dia: `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`, matriculas: porDiaCount[ds] || 0, receita: porDiaReceita[ds] || 0 })
    }

    const leadsData = leadsResp.data || []
    setLeadsRaw(leadsData)
    const funil = FUNIL_ETAPAS.map(e => ({ etapa: e.label, count: leadsData.filter((l: any) => l.etapa === e.id).length, cor: e.cor }))

    setStats({
      receitaPrevistaMes: receitaPrev, receitaRealizadaMes: receitaReal,
      margemPrevistaMes: receitaPrev - custoPrev, margemRealizadaMes: receitaReal - custoReal,
      turmasAtivas: turmasResp.data?.length || 0,
      totalMatriculas: matriculas.length,
      tarefasAtrasadas: atrasadas, tarefasUrgentes: urgentes,
      trafegoHoje: trafegoTotal,
      alunosTotal: 0, leadsTotal: leadsData.length,
    })
    setTurmasAndamento(turmasProgressoResp.data || [])
    setProximasAulas(aulasResp.data || [])
    setTarefasUrgentes(tarefas.filter((t: any) => new Date(t.data_prazo + 'T23:59:59') < new Date() || t.prioridade === 'urgente').slice(0, 5))
    setFunilLeads(funil)
    setTopAlunos(alunosResp.data || [])
    setSerie30(serie)
    setCarregando(false)
  }

  function fmt(v: number) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  function diaSemana(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
  }

  const setorCor: Record<string, string> = {
    operacoes: 'var(--amber)', marketing: 'var(--red)', comercial: 'var(--blue)',
    financeiro: 'var(--green)', pos_venda: 'var(--green-strong)',
  }

  const etapaLabel: Record<string, string> = {
    novo: 'Novos', sdr: 'SDR', closer: 'Closer', ganho: 'Ganhos', perdido: 'Perdidos',
  }
  const etapaCor: Record<string, string> = {
    novo: 'var(--text-muted)', sdr: 'var(--blue)', closer: 'var(--accent-soft)', ganho: 'var(--green-strong)', perdido: 'var(--red)',
  }

  const ehAdmin = perfil?.papel === 'admin'
  const meusLeadsAtivos = !perfil?.crm_interno ? 0 : leadsRaw.filter(l =>
    !['ganho', 'perda', 'perdido'].includes(l.etapa) &&
    (perfil?.leads_escopo !== 'proprios' || l.vendedor_id === perfil?.id)
  ).length
  const tarefasLeadAtrasadas = tarefasLead.filter(t => new Date(t.data_vencimento) < new Date()).length
  const leadsAtivos = leadsRaw.filter(l => !['ganho', 'perda', 'perdido'].includes(l.etapa)).length
  const gTot = leadsRaw.filter(l => l.etapa === 'ganho').length
  const pTot = leadsRaw.filter(l => l.etapa === 'perda').length
  const conversaoGeral = (gTot + pTot) > 0 ? (gTot / (gTot + pTot) * 100) : 0
  if (carregando) return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-faint)', fontSize: '14px' }}>Carregando dashboard...</p>
    </div>
  )

  return (
    <div style={{ padding: '24px clamp(12px, 4vw, 40px)', minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>Painel</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-faint)', marginTop: '4px' }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {ehAdmin ? (
          <>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Receita do mês</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--green-strong)' }}>{fmt(stats.receitaRealizadaMes)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>Prevista: {fmt(stats.receitaPrevistaMes)}</div>
            </div>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Margem do mês</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: stats.margemRealizadaMes >= 0 ? 'var(--green-strong)' : 'var(--red)' }}>{fmt(stats.margemRealizadaMes)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>Prevista: {fmt(stats.margemPrevistaMes)}</div>
            </div>
          </>
        ) : (
          <>
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Meus leads ativos</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)' }}>{meusLeadsAtivos}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>no funil agora</div>
            </div>
            <div style={{ ...card, padding: '20px', backgroundColor: tarefasLeadAtrasadas > 0 ? 'var(--red-bg)' : 'var(--surface)', borderColor: tarefasLeadAtrasadas > 0 ? 'var(--red)' : 'var(--border)' }}>
              <div style={{ fontSize: '11px', color: tarefasLeadAtrasadas > 0 ? 'var(--red)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Tarefas de leads</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: tarefasLeadAtrasadas > 0 ? 'var(--red)' : 'var(--text)' }}>{tarefasLead.length}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>{tarefasLeadAtrasadas} atrasada(s)</div>
            </div>
          </>
        )}
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Turmas ativas</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)' }}>{stats.turmasAtivas}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>{stats.totalMatriculas} matrículas em 30 dias</div>
        </div>
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Leads ativos</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)' }}>{leadsAtivos}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>no funil agora</div>
        </div>
        {ehAdmin && (
          <div style={{ ...card, padding: '20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Conversão</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--accent-soft)' }}>{conversaoGeral.toFixed(0)}%</div>
            <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>{gTot} ganhos · {pTot} perdas</div>
          </div>
        )}
      </div>

      {ehAdmin && stats.trafegoHoje > 0 && (
        <div style={{ backgroundColor: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--blue)', fontWeight: '600' }}>📊 Investimento de tráfego previsto para hoje</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Soma de todas as turmas com tráfego rodando</div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)' }}>{fmt(stats.trafegoHoje)}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Turmas em andamento</span>
            <Link href="/dashboard/turmas" style={{ fontSize: '12px', color: 'var(--accent-soft)', textDecoration: 'none' }}>Ver todas →</Link>
          </div>
          {turmasAndamento.length === 0 ? (
            <p style={{ padding: '20px', fontSize: '13px', color: 'var(--text-faint)' }}>Nenhuma turma em andamento.</p>
          ) : (
            turmasAndamento.map((t: any) => (
              <Link key={t.id} href={`/dashboard/turmas/${t.id}`} style={{ display: 'block', padding: '14px 20px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{t.produtos?.nome}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {t.cidades?.nome} · {new Date(t.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', backgroundColor: 'var(--accent-bg)', color: 'var(--accent-soft)' }}>
                      {t.status.replace('_', ' ')}
                    </span>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>{t.vagas} vagas</div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Próximas aulas (7 dias)</span>
            <Link href="/dashboard/agenda/aulas" style={{ fontSize: '12px', color: 'var(--accent-soft)', textDecoration: 'none' }}>Ver agenda →</Link>
          </div>
          {proximasAulas.length === 0 ? (
            <p style={{ padding: '20px', fontSize: '13px', color: 'var(--text-faint)' }}>Nenhuma aula nos próximos 7 dias.</p>
          ) : (
            proximasAulas.map((a: any) => (
              <div key={a.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>{a.titulo}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {a.professores?.nome || '—'} · {a.salas?.nome || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: 'var(--accent-soft)', fontWeight: '500' }}>{diaSemana(a.inicio)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                      {new Date(a.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {!ehAdmin && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Minhas tarefas de leads</span>
            <Link href="/dashboard/tarefas/leads" style={{ fontSize: '12px', color: 'var(--accent-soft)', textDecoration: 'none' }}>Ver todas →</Link>
          </div>
          {tarefasLead.length === 0 ? (
            <p style={{ padding: '20px', fontSize: '13px', color: 'var(--text-faint)' }}>Nenhuma tarefa de lead pendente. 🎉</p>
          ) : (
            tarefasLead.map((t: any) => {
              const atrasada = new Date(t.data_vencimento) < new Date()
              return (
                <div key={t.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', backgroundColor: atrasada ? 'var(--red-bg)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>{t.titulo}</div>
                    <span style={{ fontSize: '11px', color: atrasada ? 'var(--red)' : 'var(--text-faint)', fontWeight: atrasada ? '600' : '400' }}>
                      {new Date(t.data_vencimento).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
        )}

        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Funil de leads ({stats.leadsTotal})</span>
            <Link href="/dashboard/crm" style={{ fontSize: '12px', color: 'var(--accent-soft)', textDecoration: 'none' }}>Ver CRM →</Link>
          </div>
          <div style={{ padding: '12px 12px 12px 0' }}>
            {funilLeads.every((f: any) => f.count === 0) ? (
              <p style={{ fontSize: '13px', color: 'var(--text-faint)', padding: 16 }}>Nenhum lead cadastrado ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={funilLeads} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="etapa" width={120} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<TipChart />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={15} label={{ position: 'right', fill: 'var(--text-2)', fontSize: 11, fontWeight: 600 }}>
                    {funilLeads.map((f: any, i: number) => <Cell key={i} fill={f.cor} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Receita — últimos 30 dias</div>
            <div style={{ fontSize: 15, color: 'var(--green-strong)', fontWeight: 700 }}>{fmtBRL(serie30.reduce((s, d) => s + d.receita, 0))}</div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={serie30} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gReceita" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} interval={6} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={46} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
              <Tooltip content={<TipChart money />} />
              <Area type="monotone" dataKey="receita" stroke="#a78bfa" strokeWidth={2.5} fill="url(#gReceita)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {ehAdmin && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Top alunos por LTV</span>
            <Link href="/dashboard/alunos" style={{ fontSize: '12px', color: 'var(--accent-soft)', textDecoration: 'none' }}>→</Link>
          </div>
          {topAlunos.length === 0 ? (
            <p style={{ padding: '20px', fontSize: '13px', color: 'var(--text-faint)' }}>Nenhum aluno ainda.</p>
          ) : (
            topAlunos.map((a: any, i) => (
              <div key={a.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-faint)', width: '16px' }}>#{i + 1}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nome}</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--green-strong)' }}>{fmt(a.ltv)}</span>
              </div>
            ))
          )}
        </div>
        )}
      </div>
    </div>
  )
}