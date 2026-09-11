'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'
import Link from 'next/link'
import VendasDoMes from '@/components/VendasDoMes'
import { Card, CardNumero, Chip, Botao, CabecalhoPagina, Vazio } from '@/components/ui'
import { CalendarDays, Columns3, AlertTriangle, Clock, GraduationCap, Trophy, Megaphone, Sparkles } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts'

// O PAINEL — a tela que abre todo dia.
//
// ORDEM (direção visual de 11/09): primeiro o que PRECISA DE TI (atrasado, urgente), depois quanto
// vendeu, depois o resto. Os painéis são de vidro (ficam parados; a página rola por baixo); as
// listas dentro deles são curtas, de propósito. O único número em relevo é o principal da tela.
// A lógica de dados é a mesma de sempre — só o visual mudou.

// Etapas reais do funil (ordem + cor) — antes usava novo/sdr/closer que não existem
const FUNIL_ETAPAS = [
  { id: 'aguardando_atendimento', label: 'Ligação', cor: '#9ca3af' },
  { id: 'deu_venda', label: 'Deu Venda', cor: '#b87af0' },
  { id: 'atendimento_inicial', label: 'Atendimento', cor: '#60a5fa' },
  { id: 'lote_preco_ok', label: 'Lote e preço ok', cor: '#34d399' },
  { id: 'oferecer_bolsa', label: 'Oferecer bolsa', cor: '#a78bfa' },
  { id: 'aguardando_pagamento', label: 'Aguard. pagamento', cor: '#06b6d4' },
  { id: 'ligacao_boa', label: 'Ligação boa', cor: '#f59e0b' },
  { id: 'agendado', label: 'Agendado', cor: '#22d3ee' },
  { id: 'proxima_turma', label: 'Próxima turma', cor: '#c084fc' },
  { id: 'ganho', label: 'Ganhos', cor: '#4ade80' },
  { id: 'perda', label: 'Perdas', cor: '#f87171' },
]
const fmtBRL = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const num0 = (v: number) => Math.round(v || 0).toLocaleString('pt-BR')

// Tooltip dos gráficos no estilo do tema
function TipChart({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '8px 10px', fontSize: 12, color: 'var(--text)', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ color: 'var(--text-faint)', marginBottom: 2 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="tnum" style={{ fontWeight: 700, color: p.color || 'var(--text)' }}>{money ? fmtBRL(p.value) : p.value}</div>
      ))}
    </div>
  )
}

// Um painel: vidro, cabeçalho com título e um link, conteúdo por baixo.
function Painel({ titulo, href, hrefTexto = 'Ver todos →', children, pad = 0 }: { titulo: ReactNode; href?: string; hrefTexto?: string; children: ReactNode; pad?: number | string }) {
  return (
    <Card vidro pad={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--glass-border)', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
        <span>{titulo}</span>
        {href && <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-soft)', textDecoration: 'none' }}>{hrefTexto}</Link>}
      </div>
      <div style={{ padding: pad, position: 'relative', zIndex: 1 }}>{children}</div>
    </Card>
  )
}
const linha: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--glass-border)', textDecoration: 'none', color: 'inherit' }

// A SEMANA — os mesmos itens da tela Agenda (/api/agenda: compromissos, tarefas, follow-ups e
// entregas, já filtrados por quem enxerga o quê), só os dos próximos 7 dias.
type ItemAgenda = { id: string; fonte: 'agenda' | 'turma' | 'lead' | 'entrega'; titulo: string; inicio: string; diaTodo: boolean; donoId: string | null; concluido: boolean; participantes?: string[]; ajudaDe?: string | null }
const COR_FONTE: Record<ItemAgenda['fonte'], string> = { agenda: 'var(--accent)', turma: 'var(--amber)', lead: 'var(--blue)', entrega: 'var(--green)' }
// data sem hora ("2026-09-16") é dia LOCAL — `new Date()` leria como UTC e cairia no dia anterior
const paraData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 9) : new Date(s)
const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function rotuloDia(k: string) {
  const hoje = new Date(), amanha = new Date(); amanha.setDate(hoje.getDate() + 1)
  if (k === chaveDia(hoje)) return 'Hoje'
  if (k === chaveDia(amanha)) return 'Amanhã'
  const d = paraData(k)
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit' }).replace(/^./, c => c.toUpperCase())
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
  const [semana, setSemana] = useState<{ eu: string | null; itens: ItemAgenda[]; nomes: Record<string, string> }>({ eu: null, itens: [], nomes: {} })
  const [tarefasUrgentes, setTarefasUrgentes] = useState<any[]>([])
  const [funilLeads, setFunilLeads] = useState<any[]>([])
  const [topAlunos, setTopAlunos] = useState<any[]>([])
  const [serie30, setSerie30] = useState<{ dia: string; matriculas: number; receita: number }[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [tarefasLead, setTarefasLead] = useState<any[]>([])
  const [leadsRaw, setLeadsRaw] = useState<any[]>([])

  useEffect(() => { carregar() }, [])

  // a semana vem da rota da agenda — separada do resto pra não segurar o painel se ela demorar
  useEffect(() => {
    const ate = new Date(); ate.setDate(ate.getDate() + 7)
    fetchAuth(`/api/agenda?ate=${encodeURIComponent(ate.toISOString())}`).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      const hoje = chaveDia(new Date()), fim = chaveDia(ate)
      const itens = (d.itens as ItemAgenda[] || []).filter(i => { const k = chaveDia(paraData(i.inicio)); return !i.concluido && k >= hoje && k <= fim })
      const nomes: Record<string, string> = {}
      for (const p of d.pessoas || []) nomes[p.id] = p.nome
      setSemana({ eu: d.eu?.id || null, itens: itens.slice(0, 12), nomes })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    async function carregarPerfil() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: p } = await supabase.from('usuarios_perfil')
        .select('id, nome, papel, leads_escopo, crm_interno, crm_externo').eq('id', session.user.id).single()
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

    const [
      lancMes, turmasResp, turmasProgressoResp,
      tarefasResp, leadsResp, alunosResp, lancTrafegoHoje,
      matriculasResp,
    ] = await Promise.all([
      supabase.from('lancamentos_empresa').select('*')
        .gte('data_vencimento', inicioMes).lte('data_vencimento', fimMes),
      supabase.from('turmas').select('id, status').in('status', ['planejada', 'em_vendas', 'confirmada']),
      supabase.from('turmas').select('id, data_inicio, data_fim, meta_matriculas, vagas, status, produtos(nome), cidades(nome)')
        .in('status', ['em_vendas', 'confirmada', 'planejada']).order('data_inicio', { ascending: true }).limit(5),
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
    setTarefasUrgentes(tarefas.filter((t: any) => new Date(t.data_prazo + 'T23:59:59') < new Date() || t.prioridade === 'urgente').slice(0, 5))
    setFunilLeads(funil)
    setTopAlunos(alunosResp.data || [])
    setSerie30(serie)
    setCarregando(false)
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
  const receita30 = serie30.reduce((s, d) => s + d.receita, 0)
  const serieReceita = serie30.map(d => d.receita)

  // Saudação pela hora, com o primeiro nome — a tela fala com a pessoa, não com "Painel".
  const h = new Date().getHours()
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = (perfil?.nome || '').trim().split(' ')[0]
  const hojeLongo = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  // o que precisa de ti agora, em uma frase
  const pendencias: string[] = []
  if (ehAdmin && stats.tarefasAtrasadas) pendencias.push(`${stats.tarefasAtrasadas} tarefa${stats.tarefasAtrasadas > 1 ? 's' : ''} atrasada${stats.tarefasAtrasadas > 1 ? 's' : ''}`)
  if (ehAdmin && stats.tarefasUrgentes) pendencias.push(`${stats.tarefasUrgentes} urgente${stats.tarefasUrgentes > 1 ? 's' : ''}`)
  if (!ehAdmin && tarefasLeadAtrasadas) pendencias.push(`${tarefasLeadAtrasadas} follow-up${tarefasLeadAtrasadas > 1 ? 's' : ''} atrasado${tarefasLeadAtrasadas > 1 ? 's' : ''}`)

  if (carregando) return (
    <div style={{ padding: '32px clamp(16px, 4vw, 48px)', display: 'grid', gap: 18 }}>
      <div className="esqueleto" style={{ height: 34, width: 260 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {[0, 1, 2, 3].map(i => <div key={i} className="esqueleto" style={{ height: 118, borderRadius: 'var(--r-lg)' }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {[0, 1].map(i => <div key={i} className="esqueleto" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />)}
      </div>
    </div>
  )

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 48px) 40px', minHeight: '100vh', display: 'grid', gap: 18, alignContent: 'start' }}>
      <CabecalhoPagina
        titulo={primeiroNome ? `${saudacao}, ${primeiroNome}.` : `${saudacao}.`}
        sub={<>{hojeLongo.replace(/^./, c => c.toUpperCase())}{pendencias.length ? <> · <b style={{ color: 'var(--red)' }}>{pendencias.join(' · ')}</b></> : ' · nada atrasado'}</>}
        acoes={<>
          <Link href="/dashboard/agenda" style={{ textDecoration: 'none' }}><Botao tom="secundario" icone={CalendarDays}>Agenda</Botao></Link>
          <Link href="/dashboard/crm" style={{ textDecoration: 'none' }}><Botao tom="principal" icone={Columns3}>Abrir CRM</Botao></Link>
        </>}
      />

      {/* OS NÚMEROS — o principal em relevo; o que precisa de ti em vermelho */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {ehAdmin ? (
          <>
            <CardNumero vidro destaque rotulo="Receita do mês" prefixo="R$" valor={num0(stats.receitaRealizadaMes)} cor="var(--green-strong)"
              serie={serieReceita} rodape={<><span>Prevista: {fmtBRL(stats.receitaPrevistaMes)}</span><span>30 dias</span></>} />
            <CardNumero vidro rotulo="Margem do mês" prefixo="R$" valor={num0(stats.margemRealizadaMes)} cor={stats.margemRealizadaMes >= 0 ? 'var(--green-strong)' : 'var(--red)'}
              rodape={<span>Prevista: {fmtBRL(stats.margemPrevistaMes)}</span>} />
            <CardNumero vidro rotulo="Conversão" valor={conversaoGeral.toFixed(0)} sufixo="%" cor="var(--accent-soft)"
              rodape={<><span>{gTot} ganhos</span><span>{pTot} perdas</span></>} />
          </>
        ) : (
          <>
            <VendasDoMes />
            <CardNumero vidro rotulo="Meus leads ativos" valor={num0(meusLeadsAtivos)} rodape={<span>no funil agora</span>} />
            <CardNumero vidro alerta={tarefasLeadAtrasadas > 0} rotulo="Tarefas de leads" valor={num0(tarefasLead.length)}
              rodape={<span>{tarefasLeadAtrasadas ? `${tarefasLeadAtrasadas} atrasada${tarefasLeadAtrasadas > 1 ? 's' : ''} — precisa de ti` : 'nenhuma atrasada'}</span>} />
          </>
        )}
        <CardNumero vidro rotulo="Turmas ativas" valor={num0(stats.turmasAtivas)} rodape={<span>{stats.totalMatriculas} matrículas em 30 dias</span>} />
        <CardNumero vidro rotulo="Leads ativos" valor={num0(leadsAtivos)} rodape={<span>no funil agora</span>} />
        {ehAdmin && (
          <CardNumero vidro alerta={stats.tarefasAtrasadas > 0} rotulo="Tarefas atrasadas" valor={num0(stats.tarefasAtrasadas)}
            rodape={<span>{stats.tarefasUrgentes ? `${stats.tarefasUrgentes} urgente${stats.tarefasUrgentes > 1 ? 's' : ''}` : 'nenhuma urgente'}</span>} />
        )}
      </div>

      {ehAdmin && stats.trafegoHoje > 0 && (
        <Card vidro pad="12px 16px" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Chip tom="info" icone={Megaphone}>Tráfego hoje</Chip>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Investimento previsto pra hoje, somando todas as turmas com tráfego rodando</span>
          <span className="display tnum" style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 700 }}>{fmtBRL(stats.trafegoHoje)}</span>
        </Card>
      )}

      {/* O QUE PRECISA DE TI — antes dos gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {ehAdmin && (
          <Painel titulo="Precisa de ti" href="/dashboard/agenda" hrefTexto="Abrir agenda →">
            {tarefasUrgentes.length === 0
              ? <Vazio icone={Sparkles} titulo="Nada atrasado nem urgente" texto="Quando uma tarefa vencer ou virar urgente, ela aparece aqui." />
              : tarefasUrgentes.map((t: any) => {
                const atrasada = new Date(t.data_prazo + 'T23:59:59') < new Date()
                return (
                  <div key={t.id} style={linha}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{t.setor}{t.turmas?.produtos?.nome ? ` · ${t.turmas.produtos.nome}` : ''}</div>
                    </div>
                    {atrasada
                      ? <Chip tom="ruim" icone={Clock} pequeno>venceu {new Date(t.data_prazo + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</Chip>
                      : <Chip tom="atencao" icone={AlertTriangle} pequeno>urgente</Chip>}
                  </div>
                )
              })}
          </Painel>
        )}
        {!ehAdmin && (
          <Painel titulo="Minhas tarefas de leads" href="/dashboard/tarefas/leads" hrefTexto="Ver todas →">
            {tarefasLead.length === 0
              ? <Vazio icone={Sparkles} titulo="Nenhuma tarefa de lead pendente" />
              : tarefasLead.map((t: any) => {
                const atrasada = new Date(t.data_vencimento) < new Date()
                return (
                  <div key={t.id} style={linha}>
                    <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</div>
                    <Chip tom={atrasada ? 'ruim' : 'neutro'} icone={Clock} pequeno>
                      {new Date(t.data_vencimento).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Chip>
                  </div>
                )
              })}
          </Painel>
        )}
        <Painel titulo="Compromissos da semana" href="/dashboard/agenda" hrefTexto="Abrir agenda →">
          {semana.itens.length === 0
            ? <Vazio icone={CalendarDays} titulo="Nada marcado nos próximos 7 dias" texto="Compromissos, tarefas, follow-ups e entregas da semana aparecem aqui." />
            : (() => {
              // agrupa por dia; o rótulo do dia é uma linha fina entre os itens
              const porDia = new Map<string, ItemAgenda[]>()
              for (const i of semana.itens) { const k = chaveDia(paraData(i.inicio)); porDia.set(k, [...(porDia.get(k) || []), i]) }
              return [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, lista]) => (
                <div key={dia}>
                  <div style={{ padding: '8px 16px 2px', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: dia === chaveDia(new Date()) ? 'var(--accent-soft)' : 'var(--text-faint)' }}>{rotuloDia(dia)}</div>
                  {lista.map(i => {
                    const meu = i.donoId === semana.eu
                    const quem = !i.donoId ? (i.fonte === 'entrega' ? 'entrega' : 'do grupo') : meu ? 'seu' : (semana.nomes[i.donoId] || 'outra pessoa')
                    const chamado = !!semana.eu && !meu && (i.ajudaDe === semana.eu || i.participantes?.includes(semana.eu))
                    return (
                      <div key={i.fonte + i.id} style={{ ...linha, padding: '9px 16px', gap: 10 }}>
                        <span className="tnum" style={{ fontSize: 12, color: 'var(--text-muted)', width: 42, flexShrink: 0 }}>{i.diaTodo ? 'dia' : paraData(i.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ width: 3, height: 18, borderRadius: 2, background: COR_FONTE[i.fonte], flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.titulo}</span>
                        <span style={{ fontSize: 11.5, color: chamado ? 'var(--accent-soft)' : 'var(--text-faint)', flexShrink: 0, fontWeight: chamado ? 700 : 500 }}>{chamado ? 'te chamaram' : quem}</span>
                      </div>
                    )
                  })}
                </div>
              ))
            })()}
        </Painel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Painel titulo="Turmas em andamento" href="/dashboard/turmas" hrefTexto="Ver todas →">
          {turmasAndamento.length === 0
            ? <Vazio icone={GraduationCap} titulo="Nenhuma turma em andamento" texto="Criando uma turma, ela aparece aqui com vagas e status." />
            : turmasAndamento.map((t: any) => (
              <Link key={t.id} href={`/dashboard/turmas/${t.id}`} style={linha}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.produtos?.nome}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{t.cidades?.nome} · {new Date(t.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, display: 'grid', gap: 3, justifyItems: 'end' }}>
                  <Chip tom="marca" pequeno>{String(t.status).replace('_', ' ')}</Chip>
                  <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{t.vagas} vagas</span>
                </div>
              </Link>
            ))}
        </Painel>

        <Painel titulo={<>Funil de leads <span className="tnum" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>· {stats.leadsTotal}</span></>} href="/dashboard/crm" hrefTexto="Ver CRM →" pad="12px 12px 8px 0">
          {funilLeads.every((f: any) => f.count === 0) ? (
            <Vazio icone={Columns3} titulo="Nenhum lead cadastrado ainda" />
          ) : (
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={funilLeads} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="etapa" width={118} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)', opacity: .5 }} content={<TipChart />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={14} label={{ position: 'right', fill: 'var(--text-2)', fontSize: 12, fontWeight: 700 }}>
                  {funilLeads.map((f: any, i: number) => <Cell key={i} fill={f.cor} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Painel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: ehAdmin ? '2fr 1fr' : '1fr', gap: 14 }}>
        <Card vidro pad="18px 18px 10px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Receita · últimos 30 dias</div>
            <div className="display tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--green-strong)' }}>{fmtBRL(receita30)}</div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={serie30} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gReceita" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} interval={6} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={46} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
              <Tooltip content={<TipChart money />} />
              <Area type="monotone" dataKey="receita" stroke="var(--accent-soft)" strokeWidth={2.5} fill="url(#gReceita)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {ehAdmin && (
          <Painel titulo="Top alunos por LTV" href="/dashboard/alunos" hrefTexto="Ver alunos →">
            {topAlunos.length === 0
              ? <Vazio icone={Trophy} titulo="Nenhum aluno ainda" />
              : topAlunos.map((a: any, i) => (
                <div key={a.id} style={linha}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <span className="display tnum" style={{ fontSize: 15, fontWeight: 800, color: i === 0 ? 'var(--accent-soft)' : 'var(--text-faint)', width: 22 }}>{i + 1}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nome}</span>
                  </div>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--green-strong)' }}>{fmtBRL(a.ltv)}</span>
                </div>
              ))}
          </Painel>
        )}
      </div>
    </div>
  )
}
