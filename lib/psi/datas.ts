// Datas do consultório — sempre no dia de Brasília (o servidor e o toISOString() são UTC: depois das
// 21h viraria amanhã). Datas "puras" (YYYY-MM-DD) são ancoradas ao meio-dia pra nunca escorregar.
import { hojeBR } from '@/lib/periodos'

export { hojeBR }

export const agoraHoraBR = () =>
  new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })

const meio = (iso: string) => new Date(iso + 'T12:00:00Z')

export const somarDias = (iso: string, n: number) => {
  const d = meio(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

export const diaDaSemana = (iso: string) => meio(iso).getUTCDay() // 0 = domingo

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** 06/11/2026 */
export const dataBR = (iso?: string | null) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''
/** 06/11 */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
/** sexta, 6 de novembro */
export const dataLonga = (iso: string) => `${DIAS[diaDaSemana(iso)]}, ${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`
/** 6 de novembro de 2026 (pros documentos) */
export const dataExtenso = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`

/** '2026-11' -> 'novembro de 2026' */
export const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
export const mesAtual = () => hojeBR().slice(0, 7)
export const mesSomar = (mes: string, n: number) => {
  const d = new Date(mes + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7)
}
/** [primeiro dia, último dia] do mês 'YYYY-MM' */
export const limitesMes = (mes: string): [string, string] => {
  const ultimo = new Date(mes + '-01T12:00:00Z'); ultimo.setUTCMonth(ultimo.getUTCMonth() + 1); ultimo.setUTCDate(0)
  return [mes + '-01', ultimo.toISOString().slice(0, 10)]
}
/** segunda-feira da semana do dia */
export const inicioSemana = (iso: string) => {
  const d = diaDaSemana(iso); return somarDias(iso, d === 0 ? -6 : 1 - d)
}

export const hora5 = (h?: string | null) => (h || '').slice(0, 5)

export const idade = (nasc?: string | null) => {
  if (!nasc) return null
  const h = hojeBR()
  let a = Number(h.slice(0, 4)) - Number(nasc.slice(0, 4))
  if (h.slice(5) < nasc.slice(5)) a--
  return a
}

export const dinheiro = (v?: number | null) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** tira acento e caixa, pra busca */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
