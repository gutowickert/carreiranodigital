
// Sequência de tarefas automáticas por etapa do CRM — as tarefas SÃO os follow-ups.
// Cada etapa gera a sua cadência; ao concluir uma tarefa, nasce a próxima (proximaChave).
// acao indica o QUE fazer e QUEM: ligacao = humano (Rick/Mateus); audio/mensagem = IA sugere e humano envia (ou auto).

export type SequenciaTarefa = {
  chave: string           // identificador único dentro da etapa
  titulo: string
  descricao: string
  diasAposEntrada: number // D+N a partir do momento que o lead entrou nesta etapa
  proximaChave: string | null  // qual tarefa criar quando essa for concluída (null = fim)
  acao?: 'ligacao' | 'audio' | 'mensagem' | 'decisao'
}

export const SEQUENCIA_POR_ETAPA: Record<string, SequenciaTarefa[]> = {
  // CHEGADA: liga 2x no MESMO dia; se não atende na 2ª, na hora manda áudio de apresentação + tenta marcar ligação;
  // no dia seguinte, se não respondeu, oferece continuar o atendimento pelo WhatsApp.
  aguardando_atendimento: [
    {
      chave: 'ligar_1',
      titulo: 'Ligar — 1ª tentativa',
      descricao: 'Assim que o lead chega, primeira ligação.',
      diasAposEntrada: 0,
      proximaChave: 'ligar_2_audio',
      acao: 'ligacao',
    },
    {
      chave: 'ligar_2_audio',
      titulo: 'Ligar — 2ª tentativa (e áudio se não atender)',
      descricao: 'Segunda ligação no MESMO dia. Se não atender, na hora envie o áudio de apresentação e tente marcar uma ligação.',
      diasAposEntrada: 0,
      proximaChave: 'oferecer_whatsapp',
      acao: 'ligacao',
    },
    {
      chave: 'oferecer_whatsapp',
      titulo: 'Oferecer atendimento pelo WhatsApp',
      descricao: 'Dia seguinte: se não respondeu o áudio, ofereça continuar o atendimento por aqui, pelo WhatsApp.',
      diasAposEntrada: 1,
      proximaChave: null,
      acao: 'mensagem',
    },
  ],

  // ATENDIMENTO INICIAL: apresenta curso + preço + lote; áudio de reforço; mensagem com validade.
  atendimento_inicial: [
    {
      chave: 'apresentar_curso',
      titulo: 'Apresentar curso + preço + lote',
      descricao: 'Apresenta o curso, entende o lead e informa preço + lote.',
      diasAposEntrada: 1,
      proximaChave: 'audio_valor',
      acao: 'mensagem',
    },
    {
      chave: 'audio_valor',
      titulo: 'Áudio: conteúdo + valor + lote',
      descricao: 'Se não respondeu, áudio reforçando conteúdo, valor e o lote atual.',
      diasAposEntrada: 2,
      proximaChave: 'msg_preco_validade',
      acao: 'audio',
    },
    {
      chave: 'msg_preco_validade',
      titulo: 'Mensagem: preço + lote + validade (3 dias)',
      descricao: '3º dia sem retorno: mensagem com preço, lote e validade de 3 dias. Se não evoluir, mover para "Não chegou no preço".',
      diasAposEntrada: 3,
      proximaChave: null,
      acao: 'mensagem',
    },
  ],

  lote_preco_ok: [
    {
      chave: 'lote_fecha_hoje_d3',
      titulo: 'Lote fecha hoje — avisar lead',
      descricao: 'Lote vai virar hoje. Avisar lead pra decidir antes do preço subir.',
      diasAposEntrada: 3,
      proximaChave: 'dar_andamento_d4',
      acao: 'mensagem',
    },
    {
      chave: 'dar_andamento_d4',
      titulo: 'Dar andamento no lead',
      descricao: 'Lote já virou. Se não fechou, decidir entre Oferecer bolsa, Pediu prazo ou Perda.',
      diasAposEntrada: 4,
      proximaChave: null,
      acao: 'decisao',
    },
  ],

  nao_chegou_preco: [
    {
      chave: 'tentar_contato_d4',
      titulo: 'Retomar contato',
      descricao: 'Retomar contato (1ª tentativa após mover pra Não chegou no preço).',
      diasAposEntrada: 4,
      proximaChave: 'tentar_contato_d6',
      acao: 'mensagem',
    },
    {
      chave: 'tentar_contato_d6',
      titulo: 'Retomar contato (2ª)',
      descricao: 'Retomar contato (2ª tentativa). Se não evoluir até D+7, mover para Perda.',
      diasAposEntrada: 6,
      proximaChave: null,
      acao: 'mensagem',
    },
  ],

  oferecer_bolsa: [
    {
      chave: 'encerrar_lead_d2',
      titulo: 'Encerrar lead — decidir',
      descricao: 'Se o lead não fechou após a oferta de bolsa, decidir entre Ganho, Pediu prazo ou Perda.',
      diasAposEntrada: 2,
      proximaChave: null,
      acao: 'decisao',
    },
  ],

  // Pediu prazo e Aguardando pagamento têm DATA escolhida pelo vendedor — tarefa criada com data manual.
  pediu_prazo: [],
  aguardando_pagamento: [],
  proxima_turma: [],
  agendado: [],
  ganho: [],
  perda: [],
}

// Resumo legível do fluxo comercial — fonte única pra exibir no Agente Interno (Nando edita a partir daqui).
export const FLUXO_COMERCIAL = `FLUXO COMERCIAL (ciclo de ~9 dias — as TAREFAS de cada etapa são os follow-ups):

1) CHEGADA (Aguardando Atendimento): liga 2x no MESMO dia. Se não atende na 2ª, na hora manda ÁUDIO de apresentação e tenta marcar uma ligação. No dia seguinte, se não respondeu, oferece continuar o atendimento pelo WhatsApp. → Atendimento Inicial.
2) ATENDIMENTO INICIAL (D4-6): apresenta o curso, entende o lead e informa PREÇO + LOTE. Sem resposta → áudio (conteúdo+valor+lote). 3º dia mudo → mensagem com preço+lote+validade (3 dias). → Lote e Preço OK (ou Não chegou no preço).
3) LOTE E PREÇO OK: confirma que recebeu preço/lote e mede interesse. Interessado + já entendemos o negócio → Oferecer Bolsa. Até D6 sem interesse → despedida → Perda.
4) OFERECER BOLSA (D7-9, só quem demonstrou interesse): apresenta a bolsa com justificativa; fecha (link → Aguardando Pagamento) ou agenda (→ Agendado).
EXCEÇÕES que congelam o ciclo (+3 dias): AGENDADO (marca dia/hora, liga no dia) e AGUARDANDO PAGAMENTO (mandou link).
SAÍDAS: quer horário → Agendado; quer pagar → link → Aguardando Pagamento; sem interesse → despedida → Perda.

LIGAÇÃO (regra de ouro): quando COUBER ligação, SUGIRA ligação. Gatilhos fortes: lead pergunta "será que funciona pro MEU negócio?", negócio complexo/competitivo, é FC (ticket alto), traz várias objeções, ou está hesitando/esfriando — proponha uma ligação/conversa com especialista (vira Agendado) em vez de insistir no texto.
QUEM FAZ: ligação = humano (Rick/Mateus). Áudio/mensagem = IA sugere e o humano envia (ou automático, quando ligado).`

export function getPrimeiraTarefa(etapa: string): SequenciaTarefa | null {
  const seq = SEQUENCIA_POR_ETAPA[etapa]
  if (!seq || seq.length === 0) return null
  return seq[0]
}

export function getProximaTarefa(etapa: string, chaveAtual: string): SequenciaTarefa | null {
  const seq = SEQUENCIA_POR_ETAPA[etapa]
  if (!seq) return null
  const atual = seq.find(t => t.chave === chaveAtual)
  if (!atual || !atual.proximaChave) return null
  return seq.find(t => t.chave === atual.proximaChave) || null
}

// Cria a 1ª tarefa da etapa pra um lead (server-side). Nunca lança — falha silenciosa pra não quebrar quem chama.
export async function criarPrimeiraTarefa(
  supabase: any,
  leadId: string,
  etapa: string,
  leadNome: string,
  vendedorId?: string | null,
  dataRef?: Date,
) {
  try {
    const primeira = getPrimeiraTarefa(etapa)
    if (!primeira) return
    const base = dataRef ? new Date(dataRef) : new Date()
    base.setDate(base.getDate() + primeira.diasAposEntrada)
    await supabase.from('tarefas_lead').insert({
      lead_id: leadId,
      vendedor_id: vendedorId ?? null,
      tipo: primeira.chave,
      titulo: `${primeira.titulo} — ${leadNome}`,
      descricao: primeira.descricao,
      data_vencimento: base.toISOString(),
    })
  } catch { /* não quebra o fluxo de criação do lead */ }
}
