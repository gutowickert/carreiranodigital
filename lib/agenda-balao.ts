import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { ehChefe, acompanhada, lerObs, esperando } from '@/lib/acompanhamento'

// O BALÃO DA AGENDA — a regra de o que acende. Num lugar só: o menu (/api/agenda/balao), a tela
// (/api/agenda) e a gravação de leituras (/api/agenda/leituras) chamam isto, pra o número do menu e
// os pontos na tela nunca discordarem.
//
// Um item acende quando é MEU (sou o dono, me pediram ajuda, ou fui chamado pra reunião), está
// aberto, e:
//   • marquei como NÃO LIDO de propósito — acende na hora, qualquer data; ou
//   • nunca vi — e ele vence hoje/já venceu, OU é novidade (chegou pra mim em qualquer data); ou
//   • vence hoje/já venceu e eu vi ANTES do dia dele. O convite visto na semana passada acende de
//     novo uma vez, no próprio dia — e o follow-up que o sistema empurrou pra amanhã também.
//
// NOVIDADE é só compromisso, e só se foi OUTRA pessoa: me chamou pra reunião, criou no meu nome, ou
// me pediu ajuda. Se eu mesmo me marquei ou peguei do grupo, não é novidade pra mim. Tarefa e
// follow-up do mês que vem não acendem antes do dia — não há registro de quem os passou, e é isso
// que impede o balão de abrir com dezenas de coisas que ainda estão longe.
//
// ⚠️ DATAS EM SÃO PAULO. O servidor roda em UTC: com a data do servidor, "hoje" viraria às 21h e a
// tarefa de amanhã acenderia na noite anterior.

const TZ = 'America/Sao_Paulo'
const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
// Prazo sem hora ("2026-09-15") já é a data local; com hora, converte pra SP.
const diaDoItem = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : diaSP(new Date(s)))

// Até onde a agenda olha pra frente. Um só número pra tela e balão: se o balão contasse um convite
// de daqui a oito meses que a tela não mostra, a pessoa não teria como apagá-lo.
export const HORIZONTE_DIAS = 183
export const horizonteISO = () => new Date(Date.now() + HORIZONTE_DIAS * 864e5).toISOString()

export type FonteAgenda = 'agenda' | 'turma' | 'lead' | 'entrega'
export const chaveAgenda = (fonte: FonteAgenda, id: string) => `${fonte}:${id}`
export const CHAVE_VALIDA = /^(agenda|turma|lead|entrega):[0-9a-f-]{36}$/

// Tabela não existe (instalação que ainda não rodou o 22). Aí o balão fica ESCONDIDO em vez de
// mostrar tudo como não lido — um balão que ninguém consegue apagar é pior que nenhum.
const semTabela = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /agenda_leituras/.test(e.message || ''))

export type Balao = { pronto: boolean; chaves: string[] }

export async function balaoDe(org: string, euId: string): Promise<Balao> {
  const hoje = diaSP(new Date())
  const ate = horizonteISO()

  // Cada consulta de item que falhar vira lista vazia em vez de derrubar a agenda.
  const vazio = { data: [] as any[], error: null }
  const [evs, tars, tlds, leit, encs, entregues] = await Promise.all([
    sb.from('agenda_eventos').select('id,inicio,usuario_id,criado_por,ajuda_de,participantes')
      .eq('org_id', org).eq('concluido', false).lte('inicio', ate)
      .or(`usuario_id.eq.${euId},ajuda_de.eq.${euId},participantes.cs.{${euId}}`).limit(1000)
      .then(r => r.error ? vazio : r),
    sb.from('tarefas').select('id,data_prazo,usuario_id,responsavel_id,setor,observacoes')
      .eq('org_id', org).eq('status', 'pendente').or(`usuario_id.eq.${euId},responsavel_id.eq.${euId}`).limit(1000)
      .then(r => r.error ? vazio : r),
    sb.from('tarefas_lead').select('id,data_vencimento')
      .eq('org_id', org).eq('concluida', false).eq('cancelada', false).eq('vendedor_id', euId).limit(1000)
      .then(r => r.error ? vazio : r),
    sb.from('agenda_leituras').select('fonte,item_id,lido_em').eq('usuario_id', euId),
    // ENCONTRO DE ENTREGA COMBINADO (decisão do Nando, 27/09/2026): acende quando alguém combina
    // ou remarca um encontro de projeto em que eu estou, e de novo no dia. Previsto não acende —
    // são dezenas, e nenhum foi combinado com o cliente.
    sb.from('projeto_marcos').select('id,projeto_id,data_combinada,responsavel_id,atualizado_em')
      .eq('org_id', org).eq('natureza', 'encontro').in('estado', ['combinado', 'confirmado'])
      .not('data_combinada', 'is', null).lte('data_combinada', ate).limit(1000)
      .then(r => r.error ? vazio : r),
    // ENTREGA DE MARKETING ESPERANDO APROVAÇÃO (27/09/2026): acende pros chefes (lib/acompanhamento.ts).
    ehChefe(euId)
      ? sb.from('tarefas').select('id,usuario_id,setor,observacoes').eq('org_id', org).eq('setor', 'marketing').eq('status', 'pendente')
          .not('usuario_id', 'is', null).like('observacoes', '%"entrega":{%').limit(500).then(r => r.error ? vazio : r)
      : Promise.resolve(vazio),
  ])

  if (leit.error) return { pronto: !semTabela(leit.error), chaves: [] }

  type Candidato = { dia: string; novidade: boolean }
  const candidatos = new Map<string, Candidato>()
  // tarefa vista ANTES de uma mudança que importa (devolvida, entregue de novo) conta como nunca vista
  const tarefaVistaEm = new Map<string, string>()
  for (const l of leit.data || []) if (l.fonte === 'turma' && l.lido_em) tarefaVistaEm.set(l.item_id, l.lido_em)
  const mudouDepois = new Set<string>()
  const vistaAntes = (id: string, quando: string) => { const v = tarefaVistaEm.get(id); return !!v && new Date(v) < new Date(quando) }

  for (const e of evs.data || []) {
    if (!e.inicio) continue
    const participo = (e.participantes || []).includes(euId)
    const outraPessoa = e.criado_por !== euId   // criado_por vazio (itens antigos) conta como outra
    const novidade = e.ajuda_de === euId || (outraPessoa && (e.usuario_id === euId || participo))
    candidatos.set(chaveAgenda('agenda', e.id), { dia: diaDoItem(e.inicio), novidade })
  }
  // Dono de tarefa é `usuario_id`, e só se ele estiver vazio vale `responsavel_id` — a mesma conta
  // da rota da agenda. A consulta traz os dois; aqui fica só o que é meu de fato.
  for (const t of tars.data || []) {
    if ((t.usuario_id || t.responsavel_id) !== euId || !t.data_prazo) continue
    // Entregue e esperando aprovação: da parte dele está feita, não acende. Devolvida: acende como novidade.
    const o = acompanhada(t) ? lerObs(t.observacoes) : {}
    if (esperando(o)) continue
    const devolvida = o.devolvida?.em
    if (devolvida && vistaAntes(t.id, devolvida)) mudouDepois.add(chaveAgenda('turma', t.id))
    candidatos.set(chaveAgenda('turma', t.id), { dia: diaDoItem(t.data_prazo), novidade: !!devolvida })
  }
  for (const t of (entregues.data || []) as any[]) {
    const o = lerObs(t.observacoes)
    if (!acompanhada(t) || !esperando(o)) continue
    if (vistaAntes(t.id, o.entrega!.em)) mudouDepois.add(chaveAgenda('turma', t.id))
    candidatos.set(chaveAgenda('turma', t.id), { dia: diaSP(new Date(o.entrega!.em)), novidade: true })
  }
  for (const t of tlds.data || []) {
    if (!t.data_vencimento) continue
    candidatos.set(chaveAgenda('lead', t.id), { dia: diaDoItem(t.data_vencimento), novidade: false })
  }

  // undefined = nunca vi · null = marquei como não lido · 'AAAA-MM-DD' = vi nesse dia
  const leitura = new Map<string, string | null>()
  for (const l of leit.data || []) leitura.set(chaveAgenda(l.fonte, l.item_id), l.lido_em ? diaSP(new Date(l.lido_em)) : null)
  for (const k of mudouDepois) if (leitura.get(k) !== null) leitura.delete(k)

  // Os encontros de entrega: meus se sou o dono do marco (ou, sem dono, do projeto) ou se o projeto
  // me tem como "também responsável". Remarcado DEPOIS que eu vi conta como nunca visto — é assim
  // que a remarcação acende de novo.
  const listaEnc = (encs.data || []) as any[]
  if (listaEnc.length) {
    const { data: projs } = await sb.from('projetos').select('id,responsavel_id,participantes,status').in('id', [...new Set(listaEnc.map(m => m.projeto_id))])
    const porId = new Map((projs || []).map((p: any) => [p.id, p]))
    const vistoEm = new Map<string, string>()
    for (const l of leit.data || []) if (l.fonte === 'entrega' && l.lido_em) vistoEm.set(l.item_id, l.lido_em)
    for (const m of listaEnc) {
      const p: any = porId.get(m.projeto_id)
      if (!p || p.status === 'cancelado' || p.status === 'concluido') continue
      const meu = (m.responsavel_id || p.responsavel_id) === euId || (p.participantes || []).includes(euId)
      if (!meu) continue
      const k = chaveAgenda('entrega', m.id)
      const viu = vistoEm.get(m.id)
      if (viu && m.atualizado_em && new Date(m.atualizado_em) > new Date(viu)) leitura.delete(k)
      candidatos.set(k, { dia: diaDoItem(m.data_combinada), novidade: true })
    }
  }

  const chaves: string[] = []
  for (const [k, c] of candidatos) {
    const venceu = c.dia <= hoje
    const lido = leitura.get(k)
    if (lido === null) chaves.push(k)
    else if (lido === undefined) { if (venceu || c.novidade) chaves.push(k) }
    else if (venceu && lido < c.dia) chaves.push(k)
  }
  return { pronto: true, chaves }
}

// Grava "vi" ou "não lido" para uma lista de itens. Só o servidor chama (a tabela não tem regra de
// acesso pro navegador). Devolve o balão recalculado, pra quem pediu não precisar de outra ida.
export async function marcarLeituras(org: string, euId: string, chaves: string[], como: 'lido' | 'nao_lido'): Promise<Balao> {
  const validas = [...new Set(chaves)].filter(k => CHAVE_VALIDA.test(k)).slice(0, 500)
  if (validas.length) {
    const agora = new Date().toISOString()
    const linhas = validas.map(k => {
      const [fonte, item_id] = k.split(':')
      return { org_id: org, usuario_id: euId, fonte, item_id, lido_em: como === 'lido' ? agora : null }
    })
    const { error } = await sb.from('agenda_leituras').upsert(linhas, { onConflict: 'usuario_id,fonte,item_id' })
    if (error) return { pronto: !semTabela(error), chaves: [] }
  }
  return balaoDe(org, euId)
}
