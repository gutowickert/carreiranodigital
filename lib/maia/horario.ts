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

// ---- 08/11 (teste completo, #20): a IA não sabia que dia é hoje ----
// Era domingo e a Maia aceitou "retirar amanhã" (segunda) numa doceria que abre de terça a sábado. Agora o pedido da IA leva
// HOJE e AMANHÃ (data e dia da semana no fuso do negócio) e, quando dá pra saber, se o negócio abre nesses dias.
// Os dias que abre: meta.atendimento.dias (lista 0=domingo … 6=sábado, campo estruturado do cadastro) ou, sem ele, lidos do
// texto do horário na base ("terça a sábado, das 10h às 19h", "seg a sex", "todos os dias, menos segunda").
const NOMES_DIA: [RegExp, number][] = [[/\bdom(ingo)?s?\b/, 0], [/\bseg(unda)?s?(-feira)?\b/, 1], [/\bter(ca)?s?(-feira)?\b/, 2], [/\bqua(rta)?s?(-feira)?\b/, 3], [/\bqui(nta)?s?(-feira)?\b/, 4], [/\bsex(ta)?s?(-feira)?\b/, 5], [/\bsab(ado)?s?\b/, 6]]
const DIA_RE = '(dom(?:ingo)?|seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?)(?:s|-feira)?'
const numDia = (w: string) => { for (const [re, n] of NOMES_DIA) if (re.test(w)) return n; return -1 }
const semAcento = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function diasDoTexto(texto: string): number[] | null {
  const s = semAcento(texto)
  if (!s.trim()) return null
  const abre = new Set<number>()
  // o que vem depois de "fechado/exceto/menos/não abre" fecha
  const corte = s.search(/\b(fechad[oa]s?|exceto|menos|nao abr\w*|nao funcion\w*|nao atend\w*)\b/)
  const parteAbre = corte >= 0 ? s.slice(0, corte) : s, parteFecha = corte >= 0 ? s.slice(corte) : ''
  if (/\b(todos os dias|todo dia|diariamente|7 dias|sete dias)\b/.test(parteAbre)) for (let d = 0; d < 7; d++) abre.add(d)
  let resto = parteAbre
  for (const m of parteAbre.matchAll(new RegExp(`${DIA_RE}\\s*(?:a|ate|-|à|as)\\s*${DIA_RE}`, 'g'))) {
    const a = numDia(m[1]), b = numDia(m[2])
    if (a < 0 || b < 0) continue
    for (let d = a; ; d = (d + 1) % 7) { abre.add(d); if (d === b) break }
    resto = resto.replace(m[0], ' ')
  }
  for (const m of resto.matchAll(new RegExp(DIA_RE, 'g'))) { const d = numDia(m[1]); if (d >= 0) abre.add(d) }
  for (const m of parteFecha.matchAll(new RegExp(DIA_RE, 'g'))) { const d = numDia(m[1]); if (d >= 0) abre.delete(d) }
  return abre.size ? [...abre].sort() : null
}

// os dias que o negócio abre (null = não dá pra saber; aí a IA lê o horário da base)
export function diasQueAbre(neg: any): number[] | null {
  const est = neg?.meta?.atendimento?.dias
  if (Array.isArray(est) && est.length && est.every((d: any) => Number.isInteger(d) && d >= 0 && d <= 6)) return [...new Set<number>(est)].sort()
  const ctx = neg?.contexto || {}
  const txt = Object.entries(ctx).filter(([k]) => /horario|funcionamento|atendimento|abre|dias/i.test(k)).map(([, v]) => typeof v === 'string' ? v : JSON.stringify(v)).join(' ; ')
  return txt ? diasDoTexto(txt) : null
}

const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`
// "HOJE: domingo, 08/11 (fechado) · AMANHÃ: segunda, 09/11 (fechado) · PRÓXIMO DIA ABERTO: terça, 10/11"
export function diasDoNegocio(neg: any, agora = new Date()) {
  const fuso = fusoDo(neg), abre = diasQueAbre(neg)
  const dia = (n: number) => { const h = horaLocal(new Date(agora.getTime() + n * 86400e3), fuso); return { data: ddmm(h.data), semana: SEMANA[h.diaSemana], diaSemana: h.diaSemana, abre: abre ? abre.includes(h.diaSemana) : null } }
  const hoje = dia(0), amanha = dia(1)
  let proximo = null as null | ReturnType<typeof dia>
  if (abre) for (let n = 1; n <= 7; n++) { const d = dia(n); if (d.abre) { proximo = d; break } }
  const marca = (d: { abre: boolean | null }) => d.abre === null ? '' : d.abre ? ' (o negócio abre)' : ' (o negócio NÃO abre)'
  const texto = `HOJE: ${hoje.semana}, ${hoje.data}${marca(hoje)} · AMANHÃ: ${amanha.semana}, ${amanha.data}${marca(amanha)}` +
    (proximo && !amanha.abre ? ` · PRÓXIMO DIA QUE ABRE: ${proximo.semana}, ${proximo.data}` : '') +
    (abre ? '' : ' (os dias que o negócio abre estão no horário do que tu sabe do negócio)')
  return { hoje, amanha, proximo, dias: abre, texto }
}
