import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { meuPerfil } from '@/lib/quem-eu-vejo'

// MINHA SEMANA — tudo que uma pessoa tem pra entregar, numa tela só.
//
// Nasceu pro Mateus (27/09/2026: Deu Venda + marketing da escola + aulas + o que o Rick pedir),
// mas serve pra qualquer um. ⚠️ ABERTA A TODOS de propósito (decisão do Nando): qualquer pessoa
// logada vê a semana de qualquer outra — é pra o time enxergar o que cada um está entregando.
//
//   GET  ?pessoa=<id>            → a semana (sem pessoa = a minha)
//   POST { acao: 'passo', id, indice, feito }   → risca um passo de uma tarefa
//   POST { acao: 'concluir', id }               → conclui a tarefa
//   POST { acao: 'gravar', id }                 → pede ao Nando pra gravar (vira pedido de ajuda na agenda dele)

const NANDO = 'a37df4fd-f6f9-4603-a66a-e7258ad43004'
const TZ = 'America/Sao_Paulo'
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const mais = (dia: string, n: number) => new Date(new Date(dia + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10)

// os passos moram na descrição ("1. …\n2. …"); o que foi riscado, em observacoes
const passosDe = (desc: string | null) => (desc || '').split('\n').map(l => l.match(/^\s*\d+\.\s+(.+)$/)?.[1]).filter(Boolean) as string[]
const riscadosDe = (obs: string | null): boolean[] => { try { const o = JSON.parse(obs || '{}'); return Array.isArray(o.passos) ? o.passos : [] } catch { return [] } }

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const eu = await meuPerfil(auth)
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })
  const org = await orgDaRequest(auth)
  const pessoa = new URL(req.url).searchParams.get('pessoa') || eu.id
  const hoje = hojeSP(), ate = mais(hoje, 14)

  const [{ data: pessoas }, { data: tarefas }, { data: eventos }, { data: projetos }] = await Promise.all([
    sb.from('usuarios_perfil').select('id, nome, ativo').eq('org_id', org).eq('ativo', true).order('nome'),
    sb.from('tarefas').select('id, titulo, descricao, observacoes, setor, data_prazo, status, criado_por_id')
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

  const marketing = (tarefas || []).filter((t: any) => t.setor === 'marketing').map((t: any) => {
    const passos = passosDe(t.descricao), riscados = riscadosDe(t.observacoes)
    return { id: t.id, titulo: t.titulo, prazo: t.data_prazo, atrasada: t.data_prazo < hoje, resumo: (t.descricao || '').split('\n')[0], passos: passos.map((p, i) => ({ texto: p, feito: !!riscados[i] })) }
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

  return NextResponse.json({ ok: true, eu: eu.id, pessoa, nome: nomeDe(pessoa), pessoas: (pessoas || []).map(p => ({ id: p.id, nome: p.nome })), hoje, marketing, deuVenda, aulas, pedidos })
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  const eu = await meuPerfil(auth)
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })
  const org = await orgDaRequest(auth)
  const b = await req.json().catch(() => ({} as any))
  const { data: t } = await sb.from('tarefas').select('id, titulo, descricao, observacoes, usuario_id').eq('org_id', org).eq('id', b.id).maybeSingle()
  if (!t) return NextResponse.json({ ok: false, error: 'tarefa não encontrada' }, { status: 200 })

  if (b.acao === 'passo') {
    const riscados = riscadosDe(t.observacoes)
    riscados[Number(b.indice)] = !!b.feito
    let obs: any = {}; try { obs = JSON.parse(t.observacoes || '{}') } catch { }
    await sb.from('tarefas').update({ observacoes: JSON.stringify({ ...obs, passos: riscados }), atualizado_em: new Date().toISOString() }).eq('id', t.id)
    return NextResponse.json({ ok: true })
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
