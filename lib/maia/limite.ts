// Maia: limite de respostas por conversa (08/11, T12 do plano de passagem).
// Uma conversa de cliente com mais de 40 respostas da Maia no mesmo dia (Brasília) é sinal de algo errado (cliente testando,
// robô do outro lado, conversa em círculo). Passou do limite: a conversa vai pro dono (modo humano) e a equipe é avisada.
// MAIA_LIMITE_RESPOSTAS troca o número (padrão 40); por negócio, meta.atendimento.limite_respostas.
export const LIMITE_RESPOSTAS = 40
export const limiteRespostas = (neg: any) => {
  const n = Number(neg?.meta?.atendimento?.limite_respostas) || Number(process.env.MAIA_LIMITE_RESPOSTAS) || LIMITE_RESPOSTAS
  return n >= 5 ? Math.round(n) : LIMITE_RESPOSTAS
}

// o começo do dia de hoje em Brasília (UTC-3), em ISO
export function inicioDoDiaBR(agora = new Date()) {
  const br = new Date(agora.getTime() - 3 * 3600e3)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0)).toISOString()
}

// quantas vezes a Maia respondeu hoje nessa conversa (uma resposta = a 1ª mensagem dela depois de uma mensagem do cliente)
export function respostasHoje(msgs: any[], agora = new Date()) {
  const desde = inicioDoDiaBR(agora)
  let n = 0
  for (let i = 1; i < msgs.length; i++) if (msgs[i].autor === 'maia' && msgs[i - 1].autor === 'cliente' && String(msgs[i].criado_em) >= desde) n++
  return n
}
