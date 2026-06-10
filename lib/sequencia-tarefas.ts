
// Sequência de tarefas automáticas por etapa do CRM
// Documento de referência: design-funil-v6-tarefas-revistas.md
 
export type SequenciaTarefa = {
  chave: string           // identificador único dentro da etapa
  titulo: string
  descricao: string
  diasAposEntrada: number // D+N a partir do momento que vendedor moveu pra esta etapa
  proximaChave: string | null  // qual tarefa criar quando essa for concluída (null = fim da sequência)
}
 
// Pra cada etapa, define a PRIMEIRA tarefa da sequência (a que é criada automaticamente ao entrar)
// E o mapa completo de tarefas possíveis daquela etapa.
 
export const SEQUENCIA_POR_ETAPA: Record<string, SequenciaTarefa[]> = {
  atendimento_inicial: [
    {
      chave: 'tentar_contato_d1',
      titulo: 'Tentar contato D+1',
      descricao: 'Tentar contato com o lead (1ª tentativa após mover pra Atendimento inicial)',
      diasAposEntrada: 1,
      proximaChave: 'tentar_contato_d2',
    },
    {
      chave: 'tentar_contato_d2',
      titulo: 'Tentar contato D+2',
      descricao: 'Tentar contato com o lead (2ª tentativa). Se não evoluir até D+3, mover para "Não chegou no preço"',
      diasAposEntrada: 2,
      proximaChave: null,
    },
  ],
 
  lote_preco_ok: [
    {
      chave: 'lote_fecha_hoje_d3',
      titulo: 'Lote fecha hoje — avisar lead',
      descricao: 'Lote vai virar hoje. Avisar lead pra decidir antes do preço subir',
      diasAposEntrada: 3,
      proximaChave: 'dar_andamento_d4',
    },
    {
      chave: 'dar_andamento_d4',
      titulo: 'Dar andamento no lead D+4',
      descricao: 'Lote já virou. Dar andamento — se não fechou, decidir entre Oferecer bolsa, Pediu prazo ou Perda',
      diasAposEntrada: 4,
      proximaChave: null,
    },
  ],
 
  nao_chegou_preco: [
    {
      chave: 'tentar_contato_d4',
      titulo: 'Tentar contato D+4',
      descricao: 'Tentar contato com o lead (1ª tentativa após mover pra Não chegou no preço)',
      diasAposEntrada: 4,
      proximaChave: 'tentar_contato_d6',
    },
    {
      chave: 'tentar_contato_d6',
      titulo: 'Tentar contato D+6',
      descricao: 'Tentar contato (2ª tentativa). Se não evoluir até D+7, mover para Perda',
      diasAposEntrada: 6,
      proximaChave: null,
    },
  ],
 
  oferecer_bolsa: [
    {
      chave: 'encerrar_lead_d2',
      titulo: 'Encerrar lead — D+2',
      descricao: 'Se o lead não fechou após a oferta de bolsa, decidir entre Ganho, Pediu prazo ou Perda',
      diasAposEntrada: 2,
      proximaChave: null,
    },
  ],
 
  // Pediu prazo e Aguardando pagamento têm DATA escolhida pelo vendedor no modal
  // Por isso não estão aqui — a tarefa é criada com data manual
  pediu_prazo: [],
  aguardando_pagamento: [],
 
  // Etapas sem tarefa automática:
  aguardando_atendimento: [],
  ganho: [],
  perda: [],
}
 
// Retorna a primeira tarefa da sequência de uma etapa (a que é criada ao entrar)
export function getPrimeiraTarefa(etapa: string): SequenciaTarefa | null {
  const seq = SEQUENCIA_POR_ETAPA[etapa]
  if (!seq || seq.length === 0) return null
  return seq[0]
}
 
// Retorna a próxima tarefa após concluir uma tarefa específica
export function getProximaTarefa(etapa: string, chaveAtual: string): SequenciaTarefa | null {
  const seq = SEQUENCIA_POR_ETAPA[etapa]
  if (!seq) return null
  const atual = seq.find(t => t.chave === chaveAtual)
  if (!atual || !atual.proximaChave) return null
  return seq.find(t => t.chave === atual.proximaChave) || null
}