// Maia: a hora de falar com gente (07/11, piloto). O que a ROTINA manda sozinha (retomadas pro cliente, lembretes e
// perguntas pro dono) só sai entre 9h e 20h no fuso do negócio, e nunca no domingo antes das 10h. Fora disso, fica pra
// próxima rodada dentro da janela (a rotina roda de hora em hora). Resposta a quem escreveu não tem horário: é na hora.
// Fuso: America/Sao_Paulo (Brasília) por padrão; preparado pra fuso por negócio em meta.atendimento.fuso.
export const FUSO_PADRAO = 'America/Sao_Paulo'
export const JANELA = { inicio: 9, fim: 20, inicioDomingo: 10 }

function fusoValido(f: any) {
  if (!f || typeof f !== 'string') return null
  try { new Intl.DateTimeFormat('en-US', { timeZone: f }); return f } catch { return null }
}
export const fusoDo = (neg: any) => fusoValido(neg?.meta?.atendimento?.fuso) || FUSO_PADRAO

const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// a hora no fuso do negócio
export function horaLocal(agora: Date, fuso = FUSO_PADRAO) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: fuso, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(agora).map(x => [x.type, x.value]))
  const hora = Number(p.hour) % 24
  return { hora, minuto: Number(p.minute), diaSemana: DIAS.indexOf(String(p.weekday)), data: `${p.year}-${p.month}-${p.day}` }
}

const dentro = (h: { hora: number; minuto: number; diaSemana: number }) => {
  const x = h.hora + h.minuto / 60
  return x >= (h.diaSemana === 0 ? JANELA.inicioDomingo : JANELA.inicio) && x < JANELA.fim
}

// pode mandar mensagem por iniciativa própria agora?
export const podeFalar = (neg: any, agora = new Date()) => dentro(horaLocal(agora, fusoDo(neg)))

// o próximo momento dentro da janela (de 15 em 15 min, até 3 dias)
export function proximaJanela(neg: any, agora = new Date()) {
  if (podeFalar(neg, agora)) return agora
  const q = 15 * 60e3
  for (let t = Math.ceil(agora.getTime() / q) * q, fim = t + 3 * 86400e3; t < fim; t += q) if (podeFalar(neg, new Date(t))) return new Date(t)
  return agora
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
// o prazo que a Maia promete ao cliente quando pergunta algo pro dono: ~2 h dentro da janela ("hoje até as 16h", "amanhã até as 11h")
export function prazoResposta(neg: any, agora = new Date(), horas = 2) {
  const fuso = fusoDo(neg)
  let alvo = new Date(agora.getTime() + horas * 3600e3)
  // fora da janela agora: conta a partir da abertura; o prazo passa do fim da janela de hoje: conta a partir da próxima
  if (!podeFalar(neg, agora)) alvo = new Date(proximaJanela(neg, agora).getTime() + horas * 3600e3)
  else if (!dentro(horaLocal(alvo, fuso))) alvo = new Date(proximaJanela(neg, alvo).getTime() + horas * 3600e3)
  const a = horaLocal(alvo, fuso), hoje = horaLocal(agora, fuso)
  const horaCheia = a.minuto > 0 ? a.hora + 1 : a.hora
  const dias = Math.round((Date.parse(a.data) - Date.parse(hoje.data)) / 86400e3)
  const dia = dias <= 0 ? 'hoje' : dias === 1 ? 'amanhã' : SEMANA[a.diaSemana]
  return { quando: alvo.toISOString(), texto: `${dia} até as ${horaCheia}h` }
}
