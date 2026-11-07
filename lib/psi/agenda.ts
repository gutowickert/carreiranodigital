// A agenda: monta o dia juntando três coisas
//  1. os BLOCOS da rotina (APAE seg/qua 07:30–11:30...), com a cor do local;
//  2. os ATENDIMENTOS gravados naquele dia (agendados ou já registrados);
//  3. as sessões PREVISTAS dos pacientes com horário fixo semanal que ainda não têm atendimento no dia.
// Uma sessão prevista não existe no banco: vira atendimento quando ela toca e registra.
import type { Atendimento, Bloco, Local, Paciente } from './tipos'
import { diaDaSemana, hora5 } from './datas'

export interface ItemAgenda {
  chave: string
  data: string
  hora: string | null
  paciente: Paciente
  local: Local | null
  atendimento: Atendimento | null   // null = prevista (horário fixo)
}

export interface BlocoDoDia {
  bloco: Bloco
  local: Local
  itens: ItemAgenda[]
}

export interface Dia {
  data: string
  blocos: BlocoDoDia[]
  avulsos: ItemAgenda[]   // fora de qualquer bloco
  todos: ItemAgenda[]
}

export function previstosDoDia(data: string, pacientes: Paciente[], atendimentosDoDia: Atendimento[], locais: Local[]): ItemAgenda[] {
  const dia = diaDaSemana(data)
  return pacientes
    .filter(p => p.recorrente && p.status === 'ativo' && p.dia_semana === dia && (!p.data_inicio || p.data_inicio <= data))
    .filter(p => !atendimentosDoDia.some(a => a.paciente_id === p.id && a.data === data))
    .map(p => ({ chave: `prev-${p.id}-${data}`, data, hora: hora5(p.hora_fixa) || null, paciente: p, local: locais.find(l => l.id === p.local_id) || null, atendimento: null }))
}

export function montarDia(data: string, blocos: Bloco[], pacientes: Paciente[], atendimentos: Atendimento[], locais: Local[]): Dia {
  const doDia = atendimentos.filter(a => a.data === data)
  const pac = new Map(pacientes.map(p => [p.id, p]))
  const reais: ItemAgenda[] = doDia
    .filter(a => pac.has(a.paciente_id))
    .map(a => ({ chave: a.id, data, hora: hora5(a.hora) || null, paciente: pac.get(a.paciente_id)!, local: locais.find(l => l.id === a.local_id) || null, atendimento: a }))
  const todos = [...reais, ...previstosDoDia(data, pacientes, doDia, locais)]
    .sort((x, y) => (x.hora || '99').localeCompare(y.hora || '99') || x.paciente.nome.localeCompare(y.paciente.nome))

  const dia = diaDaSemana(data)
  const blocosDia = blocos
    .filter(b => b.ativo && b.dia_semana === dia)
    .map(b => ({ bloco: b, local: locais.find(l => l.id === b.local_id)! }))
    .filter(b => b.local && b.local.ativo)
    .sort((x, y) => (x.bloco.hora_inicio || '99').localeCompare(y.bloco.hora_inicio || '99'))

  const usados = new Set<string>()
  const saida: BlocoDoDia[] = blocosDia.map(({ bloco, local }) => {
    const itens = todos.filter(i => {
      if (usados.has(i.chave) || i.local?.id !== local.id) return false
      // bloco com horário: o item cai nele se estiver dentro (ou sem hora); bloco "a definir": tudo do local
      if (bloco.hora_inicio && bloco.hora_fim && i.hora) return i.hora >= bloco.hora_inicio && i.hora < bloco.hora_fim
      return true
    })
    itens.forEach(i => usados.add(i.chave))
    return { bloco, local, itens }
  })
  return { data, blocos: saida, avulsos: todos.filter(i => !usados.has(i.chave)), todos }
}

/** Sessões que já passaram e ainda não têm registro (previstas ou "agendado"), do mais antigo pro mais novo. */
export function semRegistro(datas: string[], hoje: string, agoraHora: string, blocos: Bloco[], pacientes: Paciente[], atendimentos: Atendimento[], locais: Local[]): ItemAgenda[] {
  const saida: ItemAgenda[] = []
  for (const d of datas) {
    if (d > hoje) continue
    const dia = montarDia(d, blocos, pacientes, atendimentos, locais)
    for (const i of dia.todos) {
      const pendente = !i.atendimento || i.atendimento.presenca === 'agendado'
      const passou = d < hoje || (i.hora ? i.hora <= agoraHora : false)
      if (pendente && passou) saida.push(i)
    }
  }
  return saida
}

export const textoBloco = (b: Bloco, curto = false) => b.hora_inicio ? `${b.hora_inicio}${b.hora_fim ? '–' + b.hora_fim : ''}` : curto ? 'sem horário fixo' : 'sem horário fixo · cada paciente no seu horário'
