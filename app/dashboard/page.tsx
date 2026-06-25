'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }

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
  const [matriculasUltimos30, setMatriculasUltimos30] = useState<{ data: string; count: number }[]>([])
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

    const porDia: Record<string, number> = {}
    matriculas.forEach((m: any) => {
      const d = m.data_compra?.substring(0, 10)
      if (d) porDia[d] = (porDia[d] || 0) + 1
    })
    const matriculasGrafico = Object.entries(porDia)
      .map(([data, count]) => ({ data, count }))
      .sort((a, b) => a.data.localeCompare(b.data))

    const leadsData = leadsResp.data || []
    setLeadsRaw(leadsData)
    const etapas = ['novo', 'sdr', 'closer', 'ganho', 'perdido']
    const funil = etapas.map(e => ({ etapa: e, count: leadsData.filter((l: any) => l.etapa === e).length }))

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
    setMatriculasUltimos30(matriculasGrafico)
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

  const maxMatricula = Math.max(...matriculasUltimos30.map(m => m.count), 1)
  const ehAdmin = perfil?.papel === 'admin'
  const meusLeadsAtivos = !perfil?.crm_interno ? 0 : leadsRaw.filter(l =>
    !['ganho', 'perda', 'perdido'].includes(l.etapa) &&
    (perfil?.leads_escopo !== 'proprios' || l.vendedor_id === perfil?.id)
  ).length
  const tarefasLeadAtrasadas = tarefasLead.filter(t => new Date(t.data_vencimento) < new Date()).length
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
        <div style={{ ...card, padding: '20px', backgroundColor: stats.tarefasAtrasadas > 0 ? 'var(--red-bg)' : 'var(--surface)', borderColor: stats.tarefasAtrasadas > 0 ? 'var(--red)' : 'var(--border)' }}>
          <div style={{ fontSize: '11px', color: stats.tarefasAtrasadas > 0 ? 'var(--red)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Tarefas atrasadas</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: stats.tarefasAtrasadas > 0 ? 'var(--red)' : 'var(--text)' }}>{stats.tarefasAtrasadas}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>{stats.tarefasUrgentes} marcadas como urgentes</div>
        </div>
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
        {ehAdmin ? (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Tarefas que precisam atenção</span>
            <Link href="/dashboard/tarefas" style={{ fontSize: '12px', color: 'var(--accent-soft)', textDecoration: 'none' }}>Ver todas →</Link>
          </div>
          {tarefasUrgentes.length === 0 ? (
            <p style={{ padding: '20px', fontSize: '13px', color: 'var(--text-faint)' }}>Tudo em dia! Nenhuma tarefa urgente ou atrasada.</p>
          ) : (
            tarefasUrgentes.map((t: any) => {
              const atrasada = new Date(t.data_prazo + 'T23:59:59') < new Date()
              return (
                <div key={t.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', backgroundColor: atrasada ? 'var(--red-bg)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>{t.titulo}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {t.turmas?.produtos?.nome || 'Avulsa'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', backgroundColor: 'var(--bg)', color: setorCor[t.setor] || 'var(--text-muted)' }}>
                        {t.setor}
                      </span>
                      <span style={{ fontSize: '11px', color: atrasada ? 'var(--red)' : 'var(--text-faint)', fontWeight: atrasada ? '600' : '400' }}>
                        {new Date(t.data_prazo + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        ) : (
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
            <Link href="/dashboard/leads" style={{ fontSize: '12px', color: 'var(--accent-soft)', textDecoration: 'none' }}>Ver CRM →</Link>
          </div>
          <div style={{ padding: '20px' }}>
            {funilLeads.every(f => f.count === 0) ? (
              <p style={{ fontSize: '13px', color: 'var(--text-faint)' }}>Nenhum lead cadastrado ainda.</p>
            ) : (
              funilLeads.map(f => {
                const max = Math.max(...funilLeads.map(x => x.count), 1)
                const pct = (f.count / max) * 100
                return (
                  <div key={f.etapa} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: etapaCor[f.etapa] }}>{etapaLabel[f.etapa]}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: '600' }}>{f.count}</span>
                    </div>
                    <div style={{ backgroundColor: 'var(--surface-2)', borderRadius: '20px', height: '6px', overflow: 'hidden' }}>
                      <div style={{ height: '6px', borderRadius: '20px', backgroundColor: etapaCor[f.etapa], width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '16px' }}>
            Matrículas nos últimos 30 dias
          </div>
          {matriculasUltimos30.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-faint)' }}>Nenhuma matrícula nos últimos 30 dias.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '120px' }}>
              {matriculasUltimos30.map(m => (
                <div key={m.data} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    width: '100%', backgroundColor: 'var(--accent)', borderRadius: '4px 4px 0 0',
                    height: `${(m.count / maxMatricula) * 100}%`, minHeight: '4px',
                  }} title={`${m.count} matrículas em ${new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')}`} />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-faint)', marginTop: '8px' }}>
            <span>30 dias atrás</span>
            <span>hoje</span>
          </div>
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