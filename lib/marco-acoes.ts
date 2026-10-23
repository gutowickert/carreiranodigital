import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { diasAte, empurrarPosteriores, LOCAIS, REGIOES, conflitoDeRegiao, nomeDoLocal, type Local } from '@/lib/entrega'
import { isoBR } from '@/lib/periodos'

// COMBINAR / REMARCAR UM ENCONTRO. Um caminho só, usado pela ficha (rota do marco) e pelo
// assistente do WhatsApp ("marquei com a Natália a segunda sessão, segunda às 14h, sede de
// Lajeado"). Antes vivia só na rota, e o assistente caía em lembrete na agenda pessoal.
//
// O que faz: grava data, hora e lugar; zera a reconfirmação anterior; empurra os marcos
// seguintes pelo mesmo deslocamento (a âncora, o fim do contrato, não sai do lugar); avisa
// conflito de região no mesmo dia (não proíbe: quem chamou decide com `mesmoAssim`).

export type ResultadoCombinar =
  | { ok: true; aviso: string | null; quando: string; local: string }
  | { ok: false; error: string; precisa_confirmar_regiao?: boolean }

/**
 * O dia já tem atendimento na OUTRA região? Devolve o texto do aviso, ou null se está livre.
 * É a mesma conta pra combinar, remarcar e criar encontro novo — escrita uma vez só, senão uma
 * hora as telas divergem. `ignorar` = os marcos que não contam (o próprio que está sendo mexido).
 */
export async function avisoDeRegiao(org: string, dataISO: string, local: string, ignorar: string[] = []): Promise<string | null> {
  let q = sb.from('projeto_marcos').select('id, local, estado').eq('org_id', org).eq('data_prevista', dataISO)
  if (ignorar.length) q = q.not('id', 'in', `(${ignorar.join(',')})`)
  const { data: doDia } = await q
  const conf = conflitoDeRegiao(local as Local, (doDia || []) as any)
  if (!conf.conflito) return null
  return `Nesse dia já tem ${conf.quantos} atendimento${conf.quantos > 1 ? 's' : ''} em ${REGIOES[conf.outra!].nome}. Não dá tempo do deslocamento pra ${REGIOES[conf.regiao!].nome} no mesmo dia.`
}

export async function combinarMarco(org: string, marcoId: string, dataHora: string, local: string, opts: { acao?: 'combinar' | 'remarcar'; mesmoAssim?: boolean; autor?: string | null } = {}): Promise<ResultadoCombinar> {
  const acao = opts.acao || 'combinar'
  const nova = new Date(dataHora)
  if (isNaN(nova.getTime())) return { ok: false, error: 'data inválida' }
  if (!LOCAIS.some(l => l.chave === local)) return { ok: false, error: 'escolhe onde vai ser o encontro (sede ou região, Lajeado ou Porto Alegre)' }

  const { data: marco } = await sb.from('projeto_marcos').select('*').eq('org_id', org).eq('id', marcoId).maybeSingle()
  if (!marco) return { ok: false, error: 'marco não encontrado' }
  const { data: projeto } = await sb.from('projetos').select('data_inicio').eq('id', marco.projeto_id).maybeSingle()
  const { data: irmaos } = await sb.from('projeto_marcos').select('id, ordem, ancora, estado, data_prevista, natureza, titulo, data_combinada').eq('projeto_id', marco.projeto_id).order('ordem')

  const novaData = isoBR(nova)
  const inicio = String(projeto?.data_inicio || '').slice(0, 10)
  if (inicio && novaData < inicio) return { ok: false, error: `Essa data (${novaData.split('-').reverse().join('/')}) é antes do início do projeto (${inicio.split('-').reverse().join('/')}). Confere o dia.` }
  const antes = String(marco.data_combinada || marco.data_prevista || '').slice(0, 10)
  const desloc = antes ? diasAte(novaData, antes) : 0

  if (!opts.mesmoAssim) {
    const aviso = await avisoDeRegiao(org, novaData, local, [marcoId])
    if (aviso) return { ok: false, precisa_confirmar_regiao: true, error: aviso }
  }

  const agora = new Date().toISOString()
  await sb.from('projeto_marcos').update({
    local, reconfirmacao_enviada_em: null, reconfirmacao_2a_em: null, reconfirmacao_resposta: null, reconfirmacao_resposta_em: null,
    data_combinada: nova.toISOString(), data_prevista: novaData, estado: 'combinado', confirmado_em: null, atualizado_em: agora,
  }).eq('id', marcoId)

  let aviso: string | null = null
  if (desloc !== 0 && irmaos?.length) {
    const { mover, esbarrouNaAncora } = empurrarPosteriores(irmaos as any, marco.ordem, desloc)
    for (const m of mover) await sb.from('projeto_marcos').update({ data_prevista: m.data_prevista, atualizado_em: agora }).eq('id', m.id)
    if (esbarrouNaAncora) aviso = 'Um dos próximos passos bateu na data de fim do contrato e não foi empurrado. Vale olhar o prazo.'
  }

  const fmt = nova.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  await sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: marco.projeto_id, marco_id: marcoId, tipo: acao, observacao: `${acao === 'combinar' ? '📅 Combinado' : '🔄 Remarcado'}: ${marco.titulo} para ${fmt} — ${nomeDoLocal(local as Local)}${desloc ? ` (${desloc > 0 ? '+' : ''}${desloc} dias)` : ''}.`, autor: opts.autor || null })
  return { ok: true, aviso, quando: nova.toISOString(), local: nomeDoLocal(local as Local) || local }
}

// ─────────────────────────────────────────────────────── NOVO ENCONTRO
//
// Desde 23/10/2026 a entrega nasce só com o primeiro e o último encontro do roteiro; os do meio
// quem atende cria aqui, quando combina com o cliente. Usado pela ficha ("+ Novo encontro") e pelo
// concluir ("já cria o próximo encontro").
//
// Com data E hora, o encontro nasce combinado pelo MESMO caminho do combinar (combinarMarco): a
// conferência de região do dia vale igual. Só com a data, nasce previsto (sombra na agenda, sem hora).
// Entra na ordem pela data: antes do primeiro marco que vem depois dele — e, no mesmo dia do último
// encontro ou da âncora, antes deles (o fechamento continua sendo o fechamento).

export type DadosNovoEncontro = {
  titulo?: string | null
  data: string              // AAAA-MM-DD
  hora?: string | null      // HH:MM, hora de Brasília. Vazio = nasce só previsto
  local?: string | null
  duracao?: number | null   // minutos
  mesmoAssim?: boolean
  autor?: string | null
}
export type ResultadoNovoEncontro =
  | { ok: true; id: string; titulo: string; combinado: boolean; aviso: string | null }
  | { ok: false; error: string; precisa_confirmar_regiao?: boolean }

/** Data (de Brasília) que vale pra ordenar um marco: a combinada, senão a prevista. */
const dataDoMarco = (m: { data_combinada?: string | null; data_prevista?: string | null }) =>
  m.data_combinada ? isoBR(new Date(m.data_combinada)) : String(m.data_prevista || '').slice(0, 10)

/** "Encontro N": N = quantos encontros (fora os cancelados) ficam antes dele, sem contar o 1º. */
export function sugestaoTituloEncontro(marcos: { natureza: string; estado: string; ordem: number }[], ordemNova: number): string {
  const antes = marcos.filter(m => m.natureza === 'encontro' && m.estado !== 'cancelado' && m.ordem < ordemNova).length
  return `Encontro ${Math.max(1, antes)}`
}

/** Hora de Brasília → instante. O Brasil não tem horário de verão desde 2019: é sempre -03:00. */
export const instanteBR = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`)

/**
 * Confere os dados de um encontro novo SEM gravar nada. Devolve o erro (ou o aviso de região, com
 * `precisa_confirmar_regiao`) ou null se está tudo certo. O concluir usa isto pra conferir ANTES
 * de fechar o encontro de hoje — senão um aviso de região deixaria metade feita.
 */
export async function conferirNovoEncontro(org: string, dataInicio: string, d: DadosNovoEncontro): Promise<{ error: string; precisa_confirmar_regiao?: boolean } | null> {
  const data = String(d.data || '').slice(0, 10)
  const hora = String(d.hora || '').slice(0, 5)
  const local = String(d.local || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: 'informe a data do novo encontro' }
  if (hora && !/^\d{2}:\d{2}$/.test(hora)) return { error: 'hora inválida' }
  if (local && !LOCAIS.some(l => l.chave === local)) return { error: 'local inválido' }
  const inicio = String(dataInicio || '').slice(0, 10)
  if (inicio && data < inicio) return { error: `Essa data (${data.split('-').reverse().join('/')}) é antes do início do projeto (${inicio.split('-').reverse().join('/')}). Confere o dia.` }
  if (hora) {
    if (!local) return { error: 'Com hora marcada, escolhe onde vai ser o encontro (sede ou região, Lajeado ou Porto Alegre).' }
    if (isNaN(instanteBR(data, hora).getTime())) return { error: 'data ou hora inválida' }
    if (!d.mesmoAssim) {
      const aviso = await avisoDeRegiao(org, data, local)
      if (aviso) return { error: aviso, precisa_confirmar_regiao: true }
    }
  }
  return null
}

export async function novoEncontro(org: string, projetoId: string, d: DadosNovoEncontro): Promise<ResultadoNovoEncontro> {
  const { data: projeto } = await sb.from('projetos').select('id, data_inicio, status').eq('org_id', org).eq('id', projetoId).maybeSingle()
  if (!projeto) return { ok: false, error: 'projeto não encontrado' }
  if (projeto.status === 'cancelado') return { ok: false, error: 'esse projeto está cancelado' }

  const problema = await conferirNovoEncontro(org, projeto.data_inicio, d)
  if (problema) return { ok: false, ...problema }

  const data = String(d.data).slice(0, 10)
  const hora = String(d.hora || '').slice(0, 5)
  const local = String(d.local || '') || null

  // onde entra: antes do primeiro marco que vem DEPOIS dele (pela data); no mesmo dia do último
  // encontro ou da âncora, antes deles
  const { data: marcos } = await sb.from('projeto_marcos').select('id, ordem, natureza, estado, ancora, data_prevista, data_combinada').eq('projeto_id', projetoId).order('ordem')
  const lista = marcos || []
  const encontrosVivos = lista.filter(m => m.natureza === 'encontro' && m.estado !== 'cancelado')
  const ultimoEncontro = encontrosVivos[encontrosVivos.length - 1]
  const depois = lista.find(m => {
    const dm = dataDoMarco(m)
    if (!dm) return false
    if (dm > data) return true
    return dm === data && (m.ancora || m.id === ultimoEncontro?.id)
  })
  const ordemNova = depois ? depois.ordem : (lista.length ? Math.max(...lista.map(m => m.ordem)) + 1 : 0)

  // abre a vaga: quem estava dali pra frente anda uma casa (de trás pra frente)
  if (depois) {
    const mover = lista.filter(m => m.ordem >= ordemNova).sort((a, b) => b.ordem - a.ordem)
    for (const m of mover) await sb.from('projeto_marcos').update({ ordem: m.ordem + 1 }).eq('id', m.id)
  }

  const titulo = (String(d.titulo || '').trim() || sugestaoTituloEncontro(lista, ordemNova)).slice(0, 120)
  const inicio = String(projeto.data_inicio || '').slice(0, 10)
  const { data: novo, error } = await sb.from('projeto_marcos').insert({
    org_id: org, projeto_id: projetoId,
    chave: 'extra_' + Date.now().toString(36),   // fora do roteiro: não colide com as chaves dele
    titulo, natureza: 'encontro', ordem: ordemNova,
    dias_offset: inicio ? diasAte(data, inicio) : null,
    ancora: false, duracao_min: d.duracao && d.duracao > 0 ? Math.round(d.duracao) : 60,
    data_prevista: data, data_combinada: null, estado: 'previsto',
    local, lista: [], responsavel_id: null,
  }).select('id').single()
  if (error || !novo) return { ok: false, error: error?.message || 'não consegui criar o encontro' }

  await sb.from('projeto_andamentos').insert({
    org_id: org, projeto_id: projetoId, marco_id: novo.id, tipo: 'novo_encontro',
    observacao: `➕ Novo encontro: ${titulo} — ${hora ? 'em' : 'previsto para'} ${data.split('-').reverse().join('/')}${hora ? ' às ' + hora : ''}.`,
    autor: d.autor || null,
  })

  // com hora: vira combinado pelo mesmo caminho do combinar (a região já foi conferida acima)
  if (hora && local) {
    const r = await combinarMarco(org, novo.id, instanteBR(data, hora).toISOString(), local, { acao: 'combinar', mesmoAssim: true, autor: d.autor || null })
    if (!r.ok) return { ok: true, id: novo.id, titulo, combinado: false, aviso: 'O encontro foi criado, mas a hora não foi gravada: ' + r.error }
    return { ok: true, id: novo.id, titulo, combinado: true, aviso: r.aviso }
  }
  return { ok: true, id: novo.id, titulo, combinado: false, aviso: null }
}
