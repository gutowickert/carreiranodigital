import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { meuPerfil } from '@/lib/quem-eu-vejo'
import { CHEFES, ehChefe, acompanhada, lerObs, esperando } from '@/lib/acompanhamento'

// MINHA SEMANA — tudo que uma pessoa tem pra entregar, numa tela só.
//
// Nasceu pro Mateus (27/09/2026: Deu Venda + marketing da escola + aulas + o que o Rick pedir),
// mas serve pra qualquer um. ⚠️ ABERTA A TODOS de propósito (decisão do Nando): qualquer pessoa
// logada vê a semana de qualquer outra — é pra o time enxergar o que cada um está entregando.
//
//   GET  ?pessoa=<id>            → a semana (sem pessoa = a minha)
//   POST { acao: 'passo', id, indice, feito }   → risca um passo de uma tarefa
//   POST { acao: 'concluir', id }               → conclui a tarefa (marketing acompanhado: vira "esperando aprovação")
//   POST { acao: 'aprovar', id }                → um chefe confirma a entrega (aí fecha)
//   POST { acao: 'devolver', id, recado }       → um chefe devolve com recado
//   POST { acao: 'gravar', id }                 → pede ao Nando pra gravar (vira pedido de ajuda na agenda dele)

const NANDO = 'a37df4fd-f6f9-4603-a66a-e7258ad43004'
const TZ = 'America/Sao_Paulo'
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const mais = (dia: string, n: number) => new Date(new Date(dia + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10)

// os passos moram na descrição ("1. …\n2. …"); o que foi riscado, em observacoes
const passosDe = (desc: string | null) => (desc || '').split('\n').map(l => l.match(/^\s*\d+\.\s+(.+)$/)?.[1]).filter(Boolean) as string[]
const riscadosDe = (obs: string | null): boolean[] => { const o = lerObs(obs); return Array.isArray(o.passos) ? o.passos : [] }
const diaSP = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const diasEntre = (de: string, ate: string) => Math.round((new Date(ate + 'T12:00:00Z').getTime() - new Date(de + 'T12:00:00Z').getTime()) / 864e5)

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const eu = await meuPerfil(auth)
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })
  const org = await orgDaRequest(auth)
  const pessoa = new URL(req.url).searchParams.get('pessoa') || eu.id
  const hoje = hojeSP(), ate = mais(hoje, 14)

  const [{ data: pessoas }, { data: tarefas }, { data: eventos }, { data: projetos }] = await Promise.all([
    sb.from('usuarios_perfil').select('id, nome, ativo').eq('org_id', org).eq('ativo', true).order('nome'),
    sb.from('tarefas').select('id, titulo, descricao, observacoes, setor, data_prazo, status, criado_por_id, usuario_id')
      .eq('org_id', org).eq('status', 'pendente').or(`usuario_id.eq.${pessoa},responsavel_id.eq.${pessoa}`).lte('data_prazo', ate).order('data_prazo'),
    sb.from('agenda_eventos').select('id, titulo, descricao, inicio, fim, dia_todo, usuario_id, criado_por, ajuda_de')
      .eq('org_id', org).eq('concluido', false).or(`usuario_id.eq.${pessoa},ajuda_de.eq.${pessoa},participantes.cs.{${pessoa}}`)
      .gte('inicio', `${mais(hoje, -7)}T00:00:00-03:00`).lte('inicio', `${ate}T23:59:59-03:00`).order('inicio'),
    sb.from('projetos').select('id, cliente, produto, responsavel_id, participantes').eq('org_id', org).eq('status', 'ativo'),
  ])

  const nomeDe = (id: string | null) => (pessoas || []).find(p => p.id === id)?.nome || null
  const meusProjetos = (projetos || []).filter((p: any) => p.responsavel_id === pessoa || (p.participantes || []).includes(pessoa))
  const { data: marcos } = meusProjetos.length
    ? await sb.from('projeto_marcos').select('id, projeto_id, titulo, natureza, estado, data_prevista, data_combinada')
        .in('projeto_id', meusProjetos.map((p: any) => p.id)).not('estado', 'in', '(concluido,cancelado)')
        .in('natureza', ['encontro', 'marco']).lte('data_prevista', ate).order('data_prevista')
    : { data: [] as any[] }
  const cliente = Object.fromEntries(meusProjetos.map((p: any) => [p.id, p.cliente]))

  // "Esta semana" = vence nos próximos 7 dias (ou já venceu). Como o marketing vence toda sexta,
  // sempre cai exatamente uma sexta aqui — no domingo já é a da semana que começa.
  const marketing = (tarefas || []).filter((t: any) => t.setor === 'marketing').map((t: any) => {
    const passos = passosDe(t.descricao), o = lerObs(t.observacoes), riscados = Array.isArray(o.passos) ? o.passos : []
    const estado = esperando(o) ? 'esperando' : o.devolvida ? 'devolvida' : 'aberta'
    return {
      id: t.id, titulo: t.titulo, prazo: t.data_prazo, atrasada: t.data_prazo < hoje, faltam: diasEntre(hoje, t.data_prazo),
      semana: diasEntre(hoje, t.data_prazo) <= 6 ? 'esta' : 'proxima', resumo: (t.descricao || '').split('\n')[0],
      passos: passos.map((p, i) => ({ texto: p, feito: !!riscados[i] })), minimo: o.minimo || 0,
      acompanhada: acompanhada(t), estado, entregueEm: o.entrega?.em || null,
      devolvida: estado === 'devolvida' ? { por: nomeDe(o.devolvida!.por), recado: o.devolvida!.recado, em: o.devolvida!.em } : null,
    }
  })
  const deuVenda = (marcos || []).map((m: any) => ({
    id: m.id, projetoId: m.projeto_id, cliente: cliente[m.projeto_id], titulo: m.titulo, natureza: m.natureza,
    quando: m.data_combinada || m.data_prevista, combinado: !!m.data_combinada, atrasado: (m.data_combinada || m.data_prevista).slice(0, 10) < hoje,
  }))
  const aulas = (eventos || []).filter((e: any) => /^Aula /.test(e.titulo) && e.inicio.slice(0, 10) >= hoje)
    .map((e: any) => ({ id: e.id, titulo: e.titulo, inicio: e.inicio, fim: e.fim }))
  // pedido = o que OUTRA pessoa colocou no meu nome ou me chamou pra ajudar (tarefa de fora do marketing entra também)
  const pedidos = [
    ...(eventos || []).filter((e: any) => !/^Aula /.test(e.titulo) && (e.ajuda_de === pessoa || (e.criado_por && e.criado_por !== pessoa)))
      .map((e: any) => ({ id: e.id, fonte: 'agenda', titulo: e.titulo, quando: e.inicio, de: nomeDe(e.ajuda_de === pessoa ? e.usuario_id : e.criado_por), nota: e.descricao })),
    ...(tarefas || []).filter((t: any) => t.setor !== 'marketing')
      .map((t: any) => ({ id: t.id, fonte: 'tarefa', titulo: t.titulo, quando: t.data_prazo, de: nomeDe(t.criado_por_id), nota: t.descricao })),
  ].sort((a, b) => String(a.quando).localeCompare(String(b.quando)))

  // ACOMPANHAMENTO — só pros chefes: as entregas de marketing de quem é acompanhado, de todo mundo
  // (não só da pessoa que está na tela). Placar = das últimas 4 semanas, quantas entregou no prazo.
  let acompanhamento: any[] = []
  if (ehChefe(eu.id)) {
    const desde = mais(hoje, -28)
    const [{ data: abertas }, { data: fechadas }] = await Promise.all([
      sb.from('tarefas').select('id, titulo, data_prazo, status, observacoes, usuario_id, setor')
        .eq('org_id', org).eq('setor', 'marketing').eq('status', 'pendente').not('usuario_id', 'is', null).lte('data_prazo', ate),
      sb.from('tarefas').select('id, titulo, data_prazo, status, observacoes, usuario_id, setor')
        .eq('org_id', org).eq('setor', 'marketing').eq('status', 'concluida').not('usuario_id', 'is', null).gte('data_prazo', desde),
    ])
    const porPessoa = new Map<string, any>()
    for (const t of [...(abertas || []), ...(fechadas || [])] as any[]) {
      if (!acompanhada(t)) continue
      const o = lerObs(t.observacoes)
      if (t.status === 'concluida' && !o.aprovacao) continue   // fechada antes de existir aprovação
      const g = porPessoa.get(t.usuario_id) || { pessoa: t.usuario_id, nome: nomeDe(t.usuario_id), esperando: [], naoEntregou: [], aprovadas: [], placar: { noPrazo: 0, total: 0 } }
      const item = { id: t.id, titulo: t.titulo.replace(/\s*\(até [^)]+\)$/, ''), prazo: t.data_prazo, entregueEm: o.entrega?.em || null,
        noPrazo: !!o.entrega && diaSP(o.entrega.em) <= t.data_prazo, aprovadoPor: o.aprovacao ? nomeDe(o.aprovacao.por) : null,
        atraso: t.data_prazo < hoje ? diasEntre(t.data_prazo, hoje) : 0, devolvida: o.devolvida?.recado || null }
      if (t.status === 'concluida') g.aprovadas.push(item)
      else if (esperando(o)) g.esperando.push(item)
      else if (t.data_prazo < hoje) g.naoEntregou.push(item)
      if (t.data_prazo >= desde && t.data_prazo < hoje) { g.placar.total++; if (item.noPrazo) g.placar.noPrazo++ }
      porPessoa.set(t.usuario_id, g)
    }
    acompanhamento = [...porPessoa.values()].map(g => ({ ...g, aprovadas: g.aprovadas.sort((a: any, b: any) => b.prazo.localeCompare(a.prazo)) }))
  }

  return NextResponse.json({
    ok: true, eu: eu.id, pessoa, nome: nomeDe(pessoa), pessoas: (pessoas || []).map(p => ({ id: p.id, nome: p.nome })), hoje,
    marketing, deuVenda, aulas, pedidos, chefe: ehChefe(eu.id), chefes: CHEFES.map(id => (nomeDe(id) || '').split(' ')[0]).filter(Boolean), acompanhamento,
  })
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  const eu = await meuPerfil(auth)
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })
  const org = await orgDaRequest(auth)
  const b = await req.json().catch(() => ({} as any))
  const { data: t } = await sb.from('tarefas').select('id, titulo, descricao, observacoes, usuario_id, setor, status').eq('org_id', org).eq('id', b.id).maybeSingle()
  if (!t) return NextResponse.json({ ok: false, error: 'tarefa não encontrada' }, { status: 200 })
  const agora = new Date().toISOString()
  const o = lerObs(t.observacoes)
  const gravarObs = (mais: any) => sb.from('tarefas').update({ observacoes: JSON.stringify({ ...o, ...mais }), atualizado_em: agora, ...(mais.aprovacao ? { status: 'concluida', concluida_em: agora } : {}) }).eq('id', t.id)

  if (b.acao === 'passo') {
    const riscados = riscadosDe(t.observacoes)
    riscados[Number(b.indice)] = !!b.feito
    let obs: any = {}; try { obs = JSON.parse(t.observacoes || '{}') } catch { }
    await sb.from('tarefas').update({ observacoes: JSON.stringify({ ...obs, passos: riscados }), atualizado_em: new Date().toISOString() }).eq('id', t.id)
    return NextResponse.json({ ok: true })
  }
  if (b.acao === 'concluir' && acompanhada(t)) {
    const feitos = riscadosDe(t.observacoes).filter(Boolean).length
    if (o.minimo && feitos < o.minimo) return NextResponse.json({ ok: false, error: `Marca pelo menos ${o.minimo} antes de entregar (na Minha semana).` })
    if (esperando(o)) return NextResponse.json({ ok: true })
    const { error } = await gravarObs({ entrega: { em: agora, por: eu.id }, devolvida: null })
    return NextResponse.json(error ? { ok: false, error: error.message } : { ok: true, esperando: true })
  }
  if (b.acao === 'aprovar' || b.acao === 'devolver') {
    if (!ehChefe(eu.id)) return NextResponse.json({ ok: false, error: 'só o Nando, o Rick ou o Guto aprovam' }, { status: 403 })
    if (!esperando(o)) return NextResponse.json({ ok: false, error: 'essa entrega não está esperando aprovação' })
    if (b.acao === 'aprovar') {
      const { error } = await gravarObs({ aprovacao: { em: agora, por: eu.id } })
      return NextResponse.json(error ? { ok: false, error: error.message } : { ok: true })
    }
    const recado = String(b.recado || '').trim().slice(0, 1000)
    if (!recado) return NextResponse.json({ ok: false, error: 'escreve o recado pra ele saber o que ajustar' })
    const { error } = await gravarObs({ entrega: null, devolvida: { em: agora, por: eu.id, recado } })
    return NextResponse.json(error ? { ok: false, error: error.message } : { ok: true })
  }
  if (b.acao === 'concluir') {
    await sb.from('tarefas').update({ status: 'concluida', concluida_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', t.id)
    return NextResponse.json({ ok: true })
  }
  if (b.acao === 'gravar') {
    // vira pedido de ajuda na agenda: acende pro Nando, no dia útil seguinte, e ele combina a hora
    const amanha = mais(hojeSP(), 1)
    const { error } = await sb.from('agenda_eventos').insert({
      org_id: org, usuario_id: t.usuario_id || eu.id, criado_por: eu.id, ajuda_de: NANDO,
      ajuda_nota: `Gravar: ${t.titulo}`, ajuda_em: new Date().toISOString(),
      titulo: `Gravar com o Nando — ${t.titulo.replace(/\s*\(até [^)]+\)$/, '')}`, tipo: 'reuniao',
      inicio: `${amanha}T12:00:00Z`, dia_todo: true, publico: false, concluido: false,
      descricao: 'Pedido pela tela Minha semana. Combina a hora de gravar.',
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 200 })
}
