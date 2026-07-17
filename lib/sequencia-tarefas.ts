
// Sequência de tarefas automáticas por etapa do CRM — as tarefas SÃO os follow-ups.
// Cada etapa gera a sua cadência; ao concluir uma tarefa, nasce a próxima (proximaChave).
// acao indica o QUE fazer e QUEM: ligacao = humano (Rick/Mateus); audio/mensagem = IA sugere e humano envia (ou auto).

export type SequenciaTarefa = {
  chave: string           // identificador único dentro da etapa
  titulo: string
  descricao: string
  diasAposEntrada: number // GAP em dias: 1ª tarefa = dias após ENTRAR na etapa; próximas = dias após CONCLUIR a anterior. 0 = mesmo dia; 1 = dia seguinte.
  proximaChave: string | null  // qual tarefa criar quando essa for concluída (null = fim)
  acao?: 'ligacao' | 'audio' | 'mensagem' | 'decisao'
}

export const SEQUENCIA_POR_ETAPA: Record<string, SequenciaTarefa[]> = {
  // D1 — LIGAÇÃO (Chegada): liga direto, NÃO manda mensagem. 2 tentativas no MESMO dia;
  // se não atende na 2ª, na hora envia ÁUDIO convidando a informar o melhor horário. Virada do dia → Atendimento Inicial.
  aguardando_atendimento: [
    {
      chave: 'ligar_1',
      titulo: 'Ligar — 1ª tentativa',
      descricao: 'D1: primeira ligação do dia. Se atender, breve apresentação do curso e inicia o atendimento comercial.',
      diasAposEntrada: 0,
      proximaChave: 'ligar_2_audio',
      acao: 'ligacao',
    },
    {
      chave: 'ligar_2_audio',
      titulo: 'Ligar — 2ª tentativa (áudio se não atender)',
      descricao: 'D1: segunda ligação no MESMO dia. Se não atender nenhuma das duas, na hora envie um ÁUDIO no WhatsApp convidando o lead a informar o melhor horário pra conversar sobre o curso.',
      diasAposEntrada: 0,
      proximaChave: null,
      acao: 'ligacao',
    },
  ],

  // ATENDIMENTO INICIAL (D2-D3): D2 puxa a conversa pro WhatsApp + contexto (dia SEGUINTE ao áudio);
  // D3 apresentação completa. Virada do D3 → Lote e Preço OK.
  atendimento_inicial: [
    {
      chave: 'msg_horario', // (chave mantida por compat; conteúdo agora é "seguir no WhatsApp")
      titulo: 'Seguir a conversa pelo WhatsApp + puxar contexto',
      descricao: 'D2 (dia seguinte ao áudio): se não respondeu, NÃO peça horário nem ofereça ligação. Puxe a conversa pra CÁ — cumprimente pelo nome, diga que dá pra resolver tudo por aqui pelo WhatsApp, e comece a DESCOBERTA: pergunte sobre o negócio/objetivo do lead pra ligar o curso à realidade dele.',
      diasAposEntrada: 1,
      proximaChave: 'apresentacao_completa',
      acao: 'mensagem',
    },
    {
      chave: 'apresentacao_completa',
      titulo: 'Apresentação completa do curso',
      descricao: 'D3: se continua sem responder, envie a APRESENTAÇÃO COMPLETA por texto: apresentação da instituição, objetivo do curso, benefícios, lote vigente, valor do investimento e condições de pagamento.',
      diasAposEntrada: 1,
      proximaChave: null,
      acao: 'mensagem',
    },
  ],

  // LOTE E PREÇO OK (D4-D6): mede interesse; reforça; último dia do lote. Virada do D6 → Oferecer Bolsa.
  lote_preco_ok: [
    {
      chave: 'quer_aproveitar',
      titulo: 'Perguntar se quer aproveitar a oportunidade',
      descricao: 'D4 (dia seguinte): mensagem perguntando se o lead deseja aproveitar a oportunidade apresentada.',
      diasAposEntrada: 1,
      proximaChave: 'reforco_beneficios',
      acao: 'mensagem',
    },
    {
      chave: 'reforco_beneficios',
      titulo: 'Reforçar benefícios e incentivar resposta',
      descricao: 'D5: se ainda não respondeu, nova mensagem reforçando os benefícios do curso e incentivando uma resposta.',
      diasAposEntrada: 1,
      proximaChave: 'ultimo_dia_lote',
      acao: 'mensagem',
    },
    {
      chave: 'ultimo_dia_lote',
      titulo: 'Último dia do lote — condições encerram',
      descricao: 'D6: comunicação informando que é o ÚLTIMO DIA do lote vigente e que as condições atuais serão encerradas.',
      diasAposEntrada: 1,
      proximaChave: null,
      acao: 'mensagem',
    },
  ],

  // OFERECER BOLSA (D7-D13): D7-D10 silêncio (sem comunicação); D11 1ª bolsa; D12 2ª bolsa; D13 demissão → Perdido.
  oferecer_bolsa: [
    {
      chave: 'bolsa_1',
      titulo: '1ª oferta de bolsa',
      descricao: 'D11 (após o período de espera D7-D10 sem comunicação — 4 dias): 1ª oferta de BOLSA — condição especial para ingresso no curso.',
      diasAposEntrada: 4,
      proximaChave: 'bolsa_2',
      acao: 'mensagem',
    },
    {
      chave: 'bolsa_2',
      titulo: '2ª mensagem da bolsa',
      descricao: 'D12: se não houve retorno, 2ª mensagem reforçando a oportunidade da bolsa.',
      diasAposEntrada: 1,
      proximaChave: 'demissao',
      acao: 'mensagem',
    },
    {
      chave: 'demissao',
      titulo: 'Mensagem de encerramento (demissão do lead)',
      descricao: 'D13: não havendo resposta, mensagem de ENCERRAMENTO do atendimento informando que o contato será finalizado. Ao concluir, mover para Perdido.',
      diasAposEntrada: 1,
      proximaChave: null,
      acao: 'mensagem',
    },
  ],

  // Estacionamentos e terminais: sem cadência automática (data/gatilho manual ou retorno ao fluxo).
  aguardando_pagamento: [],
  proxima_turma: [],
  agendado: [],
  ganho: [],
  perda: [],
}

// Resumo legível do fluxo comercial — fonte única pra exibir no Agente Interno (Nando edita a partir daqui).
export const FLUXO_COMERCIAL = `FLUXO COMERCIAL (ciclo D1–D13 — as TAREFAS de cada etapa são os follow-ups; conta os dias desde a ENTRADA do lead):

1) LIGAÇÃO / Chegada (D1): liga DIRETO 2x no mesmo dia (NÃO manda mensagem nessa etapa). Se não atende, na hora manda ÁUDIO convidando a informar o melhor horário. Virada do dia → Atendimento Inicial.
2) ATENDIMENTO INICIAL (D2-D3): D2 (dia SEGUINTE ao áudio) — se não respondeu, NÃO peça horário nem ofereça ligação: puxe a conversa pro WhatsApp e já comece a descoberta (pergunte do negócio/objetivo). D3 — se continua mudo, APRESENTAÇÃO COMPLETA (instituição, objetivo, benefícios, lote, valor, condições). Virada do D3 → Lote e Preço OK.
3) LOTE E PREÇO OK (D4-D6): D4 pergunta se quer aproveitar; D5 reforça benefícios; D6 avisa que é o ÚLTIMO DIA do lote. Virada do D6 → Oferecer Bolsa.
4) OFERECER BOLSA (D7-D13): D7-D10 SILÊNCIO (sem comunicação); D11 1ª oferta de bolsa; D12 2ª mensagem da bolsa; D13 mensagem de encerramento (demissão) → Perdido.

DESVIOS POR EVENTO (a qualquer momento, quando o lead RESPONDE):
- recebeu lote + preço → Lote e Preço OK
- quer atendimento em outro horário/data → Agendado
- quer entrar só na próxima turma → Próxima Turma
- decidiu fechar / vai pagar → Aguardando Pagamento → (confirmado) Ganho
ESTACIONAMENTOS (congelam o relógio; ao voltar, entram em Lote e Preço OK): Agendado, Próxima Turma.

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
