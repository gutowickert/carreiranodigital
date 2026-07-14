import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { SEQUENCIA_POR_ETAPA } from '@/lib/sequencia-tarefas'

// Fluxo comercial EDITÁVEL pela equipe (via Agente Interno). Guardado em webhook_logs origem='ia-fluxo'
// (o mais recente vale). Semeado com a cadência atual do código. É a "gaveta FLUXO" (etapas + tarefas + prazos).
// A "gaveta COMUNICAÇÃO" (tom, regras de decisão) continua nas ia-regra.

export type TarefaFluxo = { chave: string; titulo: string; dias: number; acao: string; descricao: string }
export type Prioridade = {
  followupDias: number          // até quantos dias frios entram como follow-up (default 13)
  ordemQuente: 'recente' | 'esperando'   // quente: respondeu mais recente OU esperando há mais tempo
  ordemFollowup: 'mais_frio' | 'menos_frio'
  produtoPrioritario: 'FC' | 'ANL' | null // esse produto sobe no topo dentro de cada bloco
  incluirFaladoHoje: boolean     // inclui quem já foi falado hoje (default não)
}
export type Fluxo = { cadencia: Record<string, TarefaFluxo[]>; regrasGerais: string; prioridade: Prioridade }

export const PRIORIDADE_PADRAO: Prioridade = { followupDias: 13, ordemQuente: 'recente', ordemFollowup: 'mais_frio', produtoPrioritario: null, incluirFaladoHoje: false }

export const TITULO_ETAPA: Record<string, string> = {
  aguardando_atendimento: 'Chegada (Aguardando Atendimento)',
  atendimento_inicial: 'Atendimento Inicial',
  lote_preco_ok: 'Lote e Preço OK',
  nao_chegou_preco: 'Não chegou no preço',
  oferecer_bolsa: 'Oferecer Bolsa',
}

function defaultFluxo(): Fluxo {
  const cadencia: Record<string, TarefaFluxo[]> = {}
  for (const [et, tarefas] of Object.entries(SEQUENCIA_POR_ETAPA)) {
    if (!tarefas.length) continue
    cadencia[et] = tarefas.map(t => ({ chave: t.chave, titulo: t.titulo, dias: t.diasAposEntrada, acao: t.acao || 'mensagem', descricao: t.descricao }))
  }
  return {
    cadencia,
    regrasGerais: 'LIGAÇÃO (regra de ouro): quando couber ligação, SUGIRA ligação — lead pergunta "funciona pro MEU negócio?", negócio complexo, FC (ticket alto), várias objeções, ou hesitando → proponha ligação/conversa com especialista (vira Agendado) em vez de insistir no texto. QUEM FAZ: ligação = humano (Rick/Mateus); áudio/mensagem = IA sugere e humano envia (ou automático).',
    prioridade: { ...PRIORIDADE_PADRAO },
  }
}

export async function getFluxo(): Promise<Fluxo> {
  try {
    const { data } = await sb.from('webhook_logs').select('payload').eq('origem', 'ia-fluxo').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
    const p = (data as any)?.payload
    if (p?.cadencia && Object.keys(p.cadencia).length) return { cadencia: p.cadencia, regrasGerais: p.regrasGerais || '', prioridade: { ...PRIORIDADE_PADRAO, ...(p.prioridade || {}) } }
  } catch { /* usa default */ }
  return defaultFluxo()
}

export async function setFluxo(f: Fluxo, email: string) {
  await sb.from('webhook_logs').insert({ origem: 'ia-fluxo', evento: 'ativa', status: 'processado', payload: { cadencia: f.cadencia, regrasGerais: f.regrasGerais, prioridade: f.prioridade, criado_por: email } })
}

// Texto legível do fluxo — vai pro motor de vendas (produção + simulação) e pro agente ver com os HANDLES.
export function fluxoTexto(f: Fluxo, comHandles = false): string {
  let s = 'FLUXO COMERCIAL ATUAL (definido pela equipe — as TAREFAS de cada etapa são os follow-ups; siga ESTA cadência):\n'
  for (const [et, tarefas] of Object.entries(f.cadencia)) {
    s += `\n• ${TITULO_ETAPA[et] || et}${comHandles ? ` [etapa: ${et}]` : ''}:\n`
    for (const t of tarefas) s += `   - ${t.titulo} — D+${t.dias}, ação: ${t.acao}${comHandles ? ` [tarefa: ${t.chave}]` : ''}\n`
  }
  s += `\n${f.regrasGerais}`
  const p = f.prioridade
  if (p) s += `\n\nPRIORIDADE DA FILA/LOTE (ordem de atendimento): 1º quem RESPONDEU (${p.ordemQuente === 'recente' ? 'resposta mais recente primeiro' : 'esperando há mais tempo primeiro'}); depois FOLLOW-UPS frios até ${p.followupDias} dias (${p.ordemFollowup === 'mais_frio' ? 'mais frio primeiro' : 'menos frio primeiro'})${p.produtoPrioritario ? `; produto ${p.produtoPrioritario} sobe no topo` : ''}${p.incluirFaladoHoje ? '; inclui quem já foi falado hoje' : '; não inclui quem já foi falado hoje'}.`
  return s
}

export function primeiraTarefaFluxo(f: Fluxo, etapa: string): TarefaFluxo | null {
  const arr = f.cadencia[etapa]
  return (arr && arr[0]) || null
}
export function proximaTarefaFluxo(f: Fluxo, etapa: string, aposChave: string): TarefaFluxo | null {
  const arr = f.cadencia[etapa]
  if (!arr) return null
  const i = arr.findIndex(t => t.chave === aposChave)
  if (i < 0 || i + 1 >= arr.length) return null
  return arr[i + 1]
}
async function inserirTarefa(supabase: any, leadId: string, t: TarefaFluxo, leadNome: string, vendedorId?: string | null, dataRef?: Date) {
  const base = dataRef ? new Date(dataRef) : new Date()
  base.setDate(base.getDate() + (t.dias || 0))
  await supabase.from('tarefas_lead').insert({
    lead_id: leadId, vendedor_id: vendedorId ?? null, tipo: t.chave,
    titulo: `${t.titulo} — ${leadNome}`, descricao: t.descricao, data_vencimento: base.toISOString(),
  })
}
// Gera a 1ª tarefa da etapa (chegada/mudança de etapa) — lê o fluxo EDITÁVEL. Não lança.
export async function gerarPrimeira(supabase: any, leadId: string, etapa: string, leadNome: string, vendedorId?: string | null, dataRef?: Date) {
  try { const f = await getFluxo(); const t = primeiraTarefaFluxo(f, etapa); if (t) await inserirTarefa(supabase, leadId, t, leadNome, vendedorId, dataRef) } catch { /* não quebra */ }
}
// Gera a PRÓXIMA tarefa após concluir uma — lê o fluxo EDITÁVEL. Não lança.
export async function gerarProxima(supabase: any, leadId: string, etapa: string, aposChave: string, leadNome: string, vendedorId?: string | null, dataRef?: Date) {
  try { const f = await getFluxo(); const t = proximaTarefaFluxo(f, etapa, aposChave); if (t) await inserirTarefa(supabase, leadId, t, leadNome, vendedorId, dataRef) } catch { /* não quebra */ }
}

// Aplica um patch estruturado (usado no executar, depois da confirmação).
export function aplicarPatch(f: Fluxo, patch: any): { fluxo: Fluxo; resumo: string } {
  const nf: Fluxo = JSON.parse(JSON.stringify(f))
  const et = patch.etapa
  if (patch.acao === 'editar_regras') { nf.regrasGerais = patch.texto || nf.regrasGerais; return { fluxo: nf, resumo: 'regras gerais do fluxo atualizadas' } }
  if (patch.acao === 'editar_prioridade') {
    const c = patch.campos || {}
    nf.prioridade = { ...(nf.prioridade || PRIORIDADE_PADRAO) }
    if (c.followupDias != null) nf.prioridade.followupDias = Number(c.followupDias)
    if (c.ordemQuente) nf.prioridade.ordemQuente = c.ordemQuente
    if (c.ordemFollowup) nf.prioridade.ordemFollowup = c.ordemFollowup
    if (c.produtoPrioritario !== undefined) nf.prioridade.produtoPrioritario = c.produtoPrioritario || null
    if (c.incluirFaladoHoje != null) nf.prioridade.incluirFaladoHoje = !!c.incluirFaladoHoje
    return { fluxo: nf, resumo: `prioridade do atendimento atualizada (${JSON.stringify(nf.prioridade)})` }
  }
  if (!et) return { fluxo: nf, resumo: 'nada mudou (faltou etapa)' }
  nf.cadencia[et] = nf.cadencia[et] || []
  const arr = nf.cadencia[et]
  const nomeEt = TITULO_ETAPA[et] || et
  if (patch.acao === 'remover_tarefa') {
    nf.cadencia[et] = arr.filter(t => t.chave !== patch.tarefa)
    return { fluxo: nf, resumo: `removida a tarefa "${patch.tarefa}" da etapa ${nomeEt}` }
  }
  if (patch.acao === 'add_tarefa') {
    const chave = patch.tarefa || `t_${Object.keys(nf.cadencia).length}_${arr.length + 1}`
    arr.push({ chave, titulo: patch.campos?.titulo || 'Nova tarefa', dias: Number(patch.campos?.dias ?? 0), acao: patch.campos?.acao || 'mensagem', descricao: patch.campos?.descricao || '' })
    arr.sort((a, b) => a.dias - b.dias)
    return { fluxo: nf, resumo: `adicionada "${patch.campos?.titulo}" (D+${patch.campos?.dias ?? 0}) na etapa ${nomeEt}` }
  }
  if (patch.acao === 'editar_tarefa') {
    const t = arr.find(x => x.chave === patch.tarefa)
    if (!t) return { fluxo: nf, resumo: `tarefa "${patch.tarefa}" não encontrada em ${nomeEt}` }
    Object.assign(t, { ...(patch.campos?.titulo != null ? { titulo: patch.campos.titulo } : {}), ...(patch.campos?.dias != null ? { dias: Number(patch.campos.dias) } : {}), ...(patch.campos?.acao != null ? { acao: patch.campos.acao } : {}), ...(patch.campos?.descricao != null ? { descricao: patch.campos.descricao } : {}) })
    arr.sort((a, b) => a.dias - b.dias)
    return { fluxo: nf, resumo: `editada a tarefa "${t.titulo}" na etapa ${nomeEt}` }
  }
  return { fluxo: nf, resumo: 'ação de fluxo desconhecida' }
}
