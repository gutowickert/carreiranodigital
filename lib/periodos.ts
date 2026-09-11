// Períodos de leitura (tráfego, placar…) — sempre no fuso de Brasília:
// o "hoje" do servidor é UTC e vira amanhã depois das 21h.

export const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export const menosDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export const diasEntre = (de: string, ate: string) =>
  Math.round((new Date(ate + 'T12:00:00Z').getTime() - new Date(de + 'T12:00:00Z').getTime()) / 86400000) + 1

export const PERIODOS: [string, string][] = [
  ['inicio', 'Desde o início'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', 'Últimos 7 dias'],
  ['30d', 'Últimos 30 dias'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['custom', 'Personalizado'],
]

/** [de, até] de um período. `inicio` só faz sentido dentro de um projeto (a data de início dele). */
export function intervalo(p: string, inicio?: string): [string, string] {
  const h = hojeBR()
  if (p === 'hoje') return [h, h]
  if (p === 'ontem') { const o = menosDias(h, 1); return [o, o] }
  if (p === '7d') return [menosDias(h, 6), h]
  if (p === '30d') return [menosDias(h, 29), h]
  if (p === 'mes') return [h.slice(0, 8) + '01', h]
  if (p === 'mes_passado') {
    const ultimo = new Date(h.slice(0, 8) + '01T12:00:00Z')
    ultimo.setUTCDate(0)
    const iso = ultimo.toISOString().slice(0, 10)
    return [iso.slice(0, 8) + '01', iso]
  }
  return [inicio || menosDias(h, 29), h]
}

/** O período de mesmo tamanho logo antes — base da comparação "vs anterior". */
export function periodoAnterior(de: string, ate: string): [string, string] {
  const n = diasEntre(de, ate)
  const fim = menosDias(de, 1)
  return [menosDias(fim, n - 1), fim]
}
