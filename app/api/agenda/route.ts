import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'
import { balaoDe, horizonteISO } from '@/lib/agenda-balao'
import { ROTEIROS, situacaoMarco, type Produto } from '@/lib/entrega'

export const maxDuration = 60

// A AGENDA — quatro fontes num lugar só, com a hierarquia valendo.
//
// POR QUE ISTO É UMA ROTA DE SERVIDOR E NÃO CONSULTA DIRETA DA TELA
// `agenda_eventos` tem regra de linha no banco (16-hierarquia-e-agenda.sql): o subordinado não lê
// o compromisso privado do chefe nem se pedir direto pra API. Mas `tarefas` e `tarefas_lead` são
// antigas e continuam abertas pra empresa inteira. Se a hierarquia fosse aplicada só na tela, seria
// enfeite: a chave pública vai no navegador e qualquer um leria tudo por fora. Então a junção
// acontece aqui, onde dá pra conferir QUEM está pedindo antes de responder.
//
// O RETRATO DA ESCOLA EM 09/09/2026, que define o desenho:
//   • 1196 leads, ZERO com vendedor_id        → tarefa de lead não tem dono
//   • 90 tarefas de turma, todas vencidas     → dono é o SETOR, não a pessoa
//   • 10 eventos de agenda, todos com dono    → só esses são "de alguém"
// Ou seja: quase todo o trabalho real hoje não tem dono. Uma agenda que só mostrasse "o que é meu"
// abriria vazia pra quase todo mundo. Por isso item sem dono é do GRUPO e aparece pra todos — é o
// mural de onde se pega trabalho, e é o coração da tela.
//
// A QUARTA FONTE: os marcos de ENTREGA (projeto_marcos, módulo de Entregas). Entram só pra LEITURA:
// quem conclui, combina e remarca é a ficha da entrega, porque lá vale a regra de ouro — encontro
// não fecha sem marcar o próximo com o cliente. Um botão de concluir aqui pularia essa regra.

type Item = {
  id: string
  fonte: 'agenda' | 'turma' | 'lead' | 'entrega'
  titulo: string
  subtitulo?: string | null
  inicio: string
  fim?: string | null
  diaTodo: boolean
  tipo?: string | null
  donoId: string | null
  publico: boolean
  concluido: boolean
  leadId?: string | null
  turmaId?: string | null
  setor?: string | null
  prioridade?: string | null
  ajudaDe?: string | null
  ajudaNota?: string | null
  participantes?: string[]
  // só entrega
  projetoId?: string | null
  estado?: string | null
  situacao?: string | null
  cor?: string | null
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const org = await orgDaRequest(auth)

  // Sem sessão válida não devolvo nada. Uma agenda que responde a quem não se identificou é um
  // vazamento. A regra de quem enxerga quem mora em lib/quem-eu-vejo.ts — a mesma que a agenda de
  // entregas usa, pra as duas não divergirem.
  const quem = await quemEuVejo(auth, org)
  if (!quem) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const { eu, souDono, abaixo, visiveis, pessoas } = quem

  // Não existe corte pra trás: nada aberto é velho demais pra sumir da vista. O limite pra frente é
  // o mesmo do balão (lib/agenda-balao.ts) — se o balão contasse algo que a tela não mostra, a
  // pessoa não teria como apagar.
  const url = new URL(req.url)
  const ate = url.searchParams.get('ate') || horizonteISO()

  const [evs, tars, tlds, balao, marcos] = await Promise.all([
    // Só o que está EM ABERTO, e sem corte pra trás: um compromisso de junho que ninguém concluiu
    // continua sendo notícia hoje. (A escola tem 10 assim, de junho e julho — some todos se o
    // período começar em -30 dias.)
    // ⚠️ `participantes` vem do 21-participantes-na-agenda.sql. Sem a coluna no banco, esta
    // consulta inteira falha e a agenda perde TODOS os compromissos — não só os com participante.
    sb.from('agenda_eventos')
      .select('id,titulo,descricao,tipo,inicio,fim,dia_todo,publico,concluido,usuario_id,lead_id,ajuda_de,ajuda_nota,participantes')
      .eq('org_id', org).eq('concluido', false).lte('inicio', ate).order('inicio').limit(1000),
    // Vencida é notícia mais importante que futura, então tarefa aberta entra inteira, sem recorte
    // de período. São 90 hoje; se um dia virarem milhares, aí sim entra paginação.
    sb.from('tarefas')
      .select('id,titulo,descricao,tipo,setor,data_prazo,prioridade,status,usuario_id,responsavel_id,turma_id')
      .eq('org_id', org).eq('status', 'pendente').order('data_prazo').limit(1000),
    sb.from('tarefas_lead')
      .select('id,titulo,tipo,data_vencimento,lead_id,vendedor_id,leads(nome,etapa)')
      .eq('org_id', org).eq('concluida', false).eq('cancelada', false).order('data_vencimento').limit(1000),
    // O que acende o balão pra mim — a mesma regra do número no menu (lib/agenda-balao.ts), pra o
    // ponto vermelho na tela e o número do menu nunca discordarem.
    balaoDe(org, eu.id),
    // Marcos de entrega em aberto. A data combinada sempre acompanha a prevista (a ficha grava as
    // duas juntas), então o corte pra frente pela prevista não perde nada.
    sb.from('projeto_marcos')
      .select('id,projeto_id,titulo,natureza,estado,data_prevista,data_combinada,duracao_min,responsavel_id')
      .eq('org_id', org).not('estado', 'in', '(concluido,cancelado)').lte('data_prevista', ate.slice(0, 10))
      .order('data_prevista').limit(1000),
  ])

  const podeVer = (dono: string | null, publico: boolean, ajudaDe?: string | null, participantes?: string[] | null) =>
    !dono                       // sem dono = do grupo, todo mundo vê
    || publico                  // o chefe abriu de propósito
    || visiveis.has(dono)       // meu, ou de quem responde a mim
    || ajudaDe === eu.id        // me chamaram pra ajudar neste
    || (participantes || []).includes(eu.id)   // me chamaram pra reunião

  const itens: Item[] = []

  for (const e of evs.data || []) {
    if (!podeVer(e.usuario_id, !!e.publico, e.ajuda_de, e.participantes)) continue
    itens.push({
      id: e.id, fonte: 'agenda', titulo: e.titulo, subtitulo: e.descricao,
      inicio: e.inicio, fim: e.fim, diaTodo: !!e.dia_todo, tipo: e.tipo,
      donoId: e.usuario_id, publico: !!e.publico, concluido: !!e.concluido,
      leadId: e.lead_id, ajudaDe: e.ajuda_de, ajudaNota: e.ajuda_nota,
      participantes: e.participantes || [],
    })
  }

  for (const t of tars.data || []) {
    const dono = t.usuario_id || t.responsavel_id || null
    if (!podeVer(dono, false)) continue
    if (!t.data_prazo) continue
    itens.push({
      id: t.id, fonte: 'turma', titulo: t.titulo, subtitulo: t.descricao,
      inicio: t.data_prazo, fim: null, diaTodo: true, tipo: t.tipo,
      donoId: dono, publico: false, concluido: false,
      turmaId: t.turma_id, setor: t.setor, prioridade: t.prioridade,
    })
  }

  for (const t of (tlds.data || []) as any[]) {
    if (!podeVer(t.vendedor_id, false)) continue
    if (!t.data_vencimento) continue
    itens.push({
      id: t.id, fonte: 'lead', titulo: t.titulo || t.tipo,
      subtitulo: t.leads?.nome ? `${t.leads.nome}${t.leads.etapa ? ' · ' + t.leads.etapa : ''}` : null,
      inicio: t.data_vencimento, fim: null, diaTodo: true, tipo: t.tipo,
      donoId: t.vendedor_id, publico: false, concluido: false,
      leadId: t.lead_id,
    })
  }

  // ENTREGAS. O cliente e o roteiro vêm do projeto; projeto encerrado ou cancelado não entra.
  // Dono do marco é o responsável dele, e na falta, o do projeto — sem nenhum dos dois, é do grupo.
  const listaMarcos = (marcos.data || []) as any[]
  if (listaMarcos.length) {
    const ids = [...new Set(listaMarcos.map(m => m.projeto_id))]
    const { data: projetos } = await sb.from('projetos')
      .select('id,cliente,produto,status,responsavel_id').in('id', ids)
    const porId = new Map((projetos || []).map((p: any) => [p.id, p]))
    for (const m of listaMarcos) {
      const p: any = porId.get(m.projeto_id)
      if (!p || p.status === 'cancelado' || p.status === 'concluido') continue
      const dono = m.responsavel_id || p.responsavel_id || null
      if (!podeVer(dono, false)) continue
      const quando = m.data_combinada || m.data_prevista
      if (!quando) continue
      const r = ROTEIROS[p.produto as Produto]
      const fimCombinado = m.data_combinada && m.duracao_min
        ? new Date(new Date(m.data_combinada).getTime() + m.duracao_min * 60000).toISOString() : null
      itens.push({
        id: m.id, fonte: 'entrega', titulo: `${p.cliente} — ${m.titulo}`,
        subtitulo: r?.nome || p.produto,
        // Previsto = o roteiro calculou, ninguém combinou: vai como dia inteiro, sem hora — é
        // sombra na agenda, não reunião marcada.
        inicio: quando, fim: fimCombinado, diaTodo: !m.data_combinada, tipo: m.natureza,
        donoId: dono, publico: false, concluido: false,
        projetoId: m.projeto_id, estado: m.estado, situacao: situacaoMarco(m), cor: r?.cor || null,
      })
    }
  }

  itens.sort((a, b) => a.inicio.localeCompare(b.inicio))

  return NextResponse.json({
    eu: { id: eu.id, nome: eu.nome, papel: eu.papel, setor: eu.setor, souDono },
    // Só devolvo o nome de quem eu posso enxergar — a lista de pessoas da tela não pode virar um
    // atalho pra descobrir a estrutura que a agenda esconde. O `ativo` vai junto porque o nome de
    // quem saiu ainda é preciso pra rotular item antigo, mas não pode aparecer pra ser escolhido.
    pessoas: pessoas.filter(p => visiveis.has(p.id)).map(p => ({ id: p.id, nome: p.nome, papel: p.papel, setor: p.setor, ativo: p.ativo })),
    tenhoTime: abaixo.size > 0 || souDono,
    itens,
    balao: balao.chaves,
    balaoPronto: balao.pronto,
  })
}
