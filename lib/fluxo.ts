import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { SEQUENCIA_POR_ETAPA } from '@/lib/sequencia-tarefas'

// Fluxo comercial EDITÁVEL pela equipe (via Agente Interno). Guardado em webhook_logs origem='ia-fluxo'
// (o mais recente vale). Semeado com a cadência atual do código. É a "gaveta FLUXO" (etapas + tarefas + prazos).
// A "gaveta COMUNICAÇÃO" (tom, regras de decisão) continua nas ia-regra.

export type TarefaFluxo = { chave: string; titulo: string; dias: number; acao: string; descricao: string }
export type Fluxo = { cadencia: Record<string, TarefaFluxo[]>; regrasGerais: string }

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
  }
}

export async function getFluxo(): Promise<Fluxo> {
  try {
    const { data } = await sb.from('webhook_logs').select('payload').eq('origem', 'ia-fluxo').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
    const p = (data as any)?.payload
    if (p?.cadencia && Object.keys(p.cadencia).length) return { cadencia: p.cadencia, regrasGerais: p.regrasGerais || '' }
  } catch { /* usa default */ }
  return defaultFluxo()
}

export async function setFluxo(f: Fluxo, email: string) {
  await sb.from('webhook_logs').insert({ origem: 'ia-fluxo', evento: 'ativa', status: 'processado', payload: { cadencia: f.cadencia, regrasGerais: f.regrasGerais, criado_por: email } })
}

// Texto legível do fluxo — vai pro motor de vendas (produção + simulação) e pro agente ver com os HANDLES.
export function fluxoTexto(f: Fluxo, comHandles = false): string {
  let s = 'FLUXO COMERCIAL ATUAL (definido pela equipe — as TAREFAS de cada etapa são os follow-ups; siga ESTA cadência):\n'
  for (const [et, tarefas] of Object.entries(f.cadencia)) {
    s += `\n• ${TITULO_ETAPA[et] || et}${comHandles ? ` [etapa: ${et}]` : ''}:\n`
    for (const t of tarefas) s += `   - ${t.titulo} — D+${t.dias}, ação: ${t.acao}${comHandles ? ` [tarefa: ${t.chave}]` : ''}\n`
  }
  s += `\n${f.regrasGerais}`
  return s
}

// Aplica um patch estruturado (usado no executar, depois da confirmação).
export function aplicarPatch(f: Fluxo, patch: any): { fluxo: Fluxo; resumo: string } {
  const nf: Fluxo = JSON.parse(JSON.stringify(f))
  const et = patch.etapa
  if (patch.acao === 'editar_regras') { nf.regrasGerais = patch.texto || nf.regrasGerais; return { fluxo: nf, resumo: 'regras gerais do fluxo atualizadas' } }
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
