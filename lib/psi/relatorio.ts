// O relatório do mês por local (o pedido da APAE): cada paciente, as datas em que foi atendido e
// quantas vezes; no fim, o total. Só entra atendimento REALIZADO (falta e desmarcação não contam).
import type { Atendimento, Local, Paciente } from './tipos'
import { diaMes } from './datas'
import { cobravel, ehSalario, valorDoAtendimento } from './financeiro'

export interface LinhaRelatorio {
  paciente: string
  datas: string[]      // YYYY-MM-DD
  quantidade: number
}

export interface Relatorio {
  mes: string
  local: Local | null
  linhas: LinhaRelatorio[]
  total: number
  pacientes: number
}

export function montarRelatorio(mes: string, local: Local | null, atendimentos: Atendimento[], pacientes: Paciente[]): Relatorio {
  const nomes = new Map(pacientes.map(p => [p.id, p.nome_social || p.nome]))
  const porPac = new Map<string, string[]>()
  for (const a of atendimentos) {
    if (a.presenca !== 'realizado' || !a.data.startsWith(mes)) continue
    if (local && a.local_id !== local.id) continue
    const l = porPac.get(a.paciente_id) || []
    l.push(a.data); porPac.set(a.paciente_id, l)
  }
  const linhas = [...porPac.entries()]
    .map(([id, datas]) => ({ paciente: nomes.get(id) || '(paciente)', datas: datas.sort(), quantidade: datas.length }))
    .sort((a, b) => a.paciente.localeCompare(b.paciente, 'pt-BR'))
  return { mes, local, linhas, total: linhas.reduce((s, l) => s + l.quantidade, 0), pacientes: linhas.length }
}

export const datasCurtas = (datas: string[]) => datas.map(diaMes).join(', ')

export interface ResumoLocal {
  local: Local
  realizados: number
  faltas: number
  desmarcados: number
  remarcados: number
  aReceber: number
  recebido: number
}

// O dinheiro segue as mesmas regras do Financeiro (lib/psi/financeiro.ts): local de salário não tem
// "a receber" por sessão; nos outros, o valor do atendimento, senão o do paciente, senão o do local.
export function resumoMes(mes: string, locais: Local[], atendimentos: Atendimento[], pacientes: Paciente[] = []): ResumoLocal[] {
  const pac = new Map(pacientes.map(p => [p.id, p]))
  return locais.map(local => {
    const doLocal = atendimentos.filter(a => a.local_id === local.id && a.data.startsWith(mes))
    const conta = (p: string) => doLocal.filter(a => a.presenca === p).length
    const cobraveis = ehSalario(local) ? [] : doLocal.filter(a => cobravel(a, local))
    const valor = (a: Atendimento) => valorDoAtendimento(a, local, pac.get(a.paciente_id))
    return {
      local,
      realizados: conta('realizado'), faltas: conta('faltou'), desmarcados: conta('desmarcou'), remarcados: conta('remarcado'),
      aReceber: cobraveis.filter(a => !a.pago).reduce((s, a) => s + valor(a), 0),
      recebido: cobraveis.filter(a => a.pago).reduce((s, a) => s + valor(a), 0),
    }
  })
}
