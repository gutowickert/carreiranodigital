// O FINANCEIRO do mês: o que entrou, o que saiu e o que sobrou. Regras (o que a Morgana passou em 07/11):
//  · Local de SALÁRIO (APAE, Mercado): entra o salário mensal inteiro; as sessões não contam como receita.
//  · Local POR ATENDIMENTO (SESM, Conecta): entra cada atendimento realizado (e a falta, se o local cobra
//    falta). O valor é o gravado no atendimento; sem ele, o do paciente; sem ele, o do local.
//  · Repasse: a % do local sobre os atendimentos (a Conecta fica com 20%).
//  · Imposto: a % do local sobre tudo que entrou dele (6% só sobre a APAE).
//  · Despesas: as fixas do mês (aluguel, contador) e as avulsas lançadas naquele mês.
import type { Atendimento, Despesa, Local, Paciente } from './tipos'

export const ehSalario = (l?: Local | null) => l?.modelo === 'salario'

/** quanto vale uma sessão nova desse paciente nesse local (null = não conta como receita por sessão) */
export function valorPadrao(paciente: Paciente | null | undefined, local: Local | null | undefined): number | null {
  if (!local || ehSalario(local)) return null
  return paciente?.valor_sessao ?? local.valor_sessao ?? null
}

/** o atendimento entra na conta do mês? (realizado; falta só se o local cobra) */
export const cobravel = (a: Atendimento, local: Local) =>
  a.presenca === 'realizado' || (local.cobra_falta && a.presenca === 'faltou')

/** o valor de um atendimento de local por sessão (já gravado, senão o padrão de hoje) */
export const valorDoAtendimento = (a: Atendimento, local: Local, paciente?: Paciente | null) =>
  a.valor ?? valorPadrao(paciente, local) ?? 0

/** a despesa vale neste mês? */
export function despesaNoMes(d: Despesa, mes: string) {
  if (!d.ativo) return false
  if (!d.recorrente) return d.mes === mes
  return (!d.desde || d.desde <= mes) && (!d.ate || mes <= d.ate)
}

export interface FinLocal {
  local: Local
  salario: number
  sessoes: number          // atendimentos realizados que entram na conta
  faltasCobradas: number
  valorSessoes: number
  semValor: number         // atendimentos cobráveis sem valor nenhum (falta pôr o valor)
  entradas: number         // salário + sessões
  repasse: number
  imposto: number
  aReceber: number
  recebido: number
}

export interface Financeiro {
  mes: string
  locais: FinLocal[]
  despesas: Despesa[]      // as que valem no mês (fixas e avulsas)
  entradas: number
  repasses: number
  impostos: number
  fixas: number
  avulsas: number
  saidas: number
  resultado: number
  aReceber: number
  recebido: number
  semValor: number
  cobraveis: { atendimento: Atendimento; local: Local; valor: number }[]  // dos locais por sessão
}

const arred = (v: number) => Math.round(v * 100) / 100

export function montarFinanceiro(mes: string, locais: Local[], atendimentos: Atendimento[], pacientes: Paciente[], despesas: Despesa[]): Financeiro {
  const pac = new Map(pacientes.map(p => [p.id, p]))
  const cobraveis: Financeiro['cobraveis'] = []
  const porLocal: FinLocal[] = []
  for (const local of locais) {
    const doMes = atendimentos.filter(a => a.local_id === local.id && a.data.startsWith(mes))
    const f: FinLocal = { local, salario: 0, sessoes: 0, faltasCobradas: 0, valorSessoes: 0, semValor: 0, entradas: 0, repasse: 0, imposto: 0, aReceber: 0, recebido: 0 }
    if (ehSalario(local)) {
      f.salario = local.ativo ? local.salario_mensal || 0 : 0
    } else {
      for (const a of doMes) {
        if (!cobravel(a, local)) continue
        const valor = valorDoAtendimento(a, local, pac.get(a.paciente_id))
        if (a.presenca === 'realizado') f.sessoes++; else f.faltasCobradas++
        if (!valor) f.semValor++
        f.valorSessoes += valor
        if (a.pago) f.recebido += valor; else f.aReceber += valor
        cobraveis.push({ atendimento: a, local, valor })
      }
    }
    f.entradas = f.salario + f.valorSessoes
    f.repasse = arred(f.valorSessoes * (local.repasse_pct || 0) / 100)
    f.imposto = arred(f.entradas * (local.imposto_pct || 0) / 100)
    // local sem nada no mês (desativado, sem atendimento e sem salário) não aparece
    if (f.entradas > 0 || f.semValor > 0 || (local.ativo && (ehSalario(local) || doMes.length > 0))) porLocal.push(f)
  }
  const doMes = despesas.filter(d => despesaNoMes(d, mes))
  const soma = (xs: number[]) => arred(xs.reduce((s, v) => s + v, 0))
  const entradas = soma(porLocal.map(l => l.entradas))
  const repasses = soma(porLocal.map(l => l.repasse))
  const impostos = soma(porLocal.map(l => l.imposto))
  const fixas = soma(doMes.filter(d => d.recorrente).map(d => d.valor))
  const avulsas = soma(doMes.filter(d => !d.recorrente).map(d => d.valor))
  const saidas = arred(repasses + impostos + fixas + avulsas)
  return {
    mes, locais: porLocal, despesas: doMes, entradas, repasses, impostos, fixas, avulsas, saidas,
    resultado: arred(entradas - saidas),
    aReceber: soma(porLocal.map(l => l.aReceber)), recebido: soma(porLocal.map(l => l.recebido)),
    semValor: porLocal.reduce((s, l) => s + l.semValor, 0),
    cobraveis: cobraveis.sort((a, b) => a.atendimento.data.localeCompare(b.atendimento.data) || (a.atendimento.hora || '').localeCompare(b.atendimento.hora || '')),
  }
}

/** '1.234,5' / '1234.50' / 'R$ 90' -> número (vazio = null) */
export function lerValor(s: string): number | null {
  const t = s.replace(/[^\d,.-]/g, '')
  if (!t) return null
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
  return Number.isFinite(n) ? n : null
}

/** número pro campo de texto: 2300 -> '2300', 12.5 -> '12,5' */
export const valorCampo = (v?: number | null) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
