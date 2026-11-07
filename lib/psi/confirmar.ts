// CONFIRMAR AMANHÃ: no dia anterior ela confirma os pacientes dos locais POR ATENDIMENTO (modelo
// 'sessao' — hoje SESM e Conecta; APAE e Mercado, de salário, não precisam). Nada é mandado sozinho:
// o botão só abre o WhatsApp DELA com a mensagem pronta.
// Nunca amarrar a nome de local (a Conecta pode mudar de nome): o que vale é o modelo.
import type { Atendimento, Bloco, Confirmacao, Local, Paciente } from './tipos'
import type { ItemAgenda } from './agenda'
import { montarDia } from './agenda'
import { DIAS, diaDaSemana, diaMes, idade, somarDias } from './datas'

// ---- as mensagens (pode mudar o texto à vontade; {chaves} são trocadas na hora) ----
export const MENSAGEM_PACIENTE = 'Oi, {nome}! Tudo bem? Passando pra confirmar teu horário {quando}, às {hora}, na {local}. Posso confirmar?'
export const MENSAGEM_RESPONSAVEL = 'Oi{responsavel}! Tudo bem? Passando pra confirmar o horário do(a) {nome} {quando}, às {hora}, na {local}. Posso confirmar?'

export interface DiaConfirmar { data: string; itens: ItemAgenda[] }

/**
 * Os dias a confirmar: a partir de amanhã até o próximo dia útil (seg a sex) que tenha atendimento
 * em local por sessão. Numa sexta: sábado, domingo (se tiver alguém) e segunda.
 */
export function diasAConfirmar(hoje: string, blocos: Bloco[], pacientes: Paciente[], atendimentos: Atendimento[], locais: Local[]): DiaConfirmar[] {
  const saida: DiaConfirmar[] = []
  for (let i = 1; i <= 7; i++) {
    const data = somarDias(hoje, i)
    const itens = montarDia(data, blocos, pacientes, atendimentos, locais).todos
      .filter(x => x.local?.modelo === 'sessao' && (!x.atendimento || ['agendado', 'desmarcou'].includes(x.atendimento.presenca)))
    if (itens.length) saida.push({ data, itens })
    const util = diaDaSemana(data) >= 1 && diaDaSemana(data) <= 5
    if (util && itens.length) break
  }
  return saida
}

/** a situação da linha: desmarcou (presença ou confirmação), confirmado, ou a confirmar */
export function situacao(i: ItemAgenda): Confirmacao {
  const a = i.atendimento
  if (a?.presenca === 'desmarcou' || a?.confirmacao === 'desmarcou') return 'desmarcou'
  if (a?.confirmacao === 'confirmado') return 'confirmado'
  return 'a_confirmar'
}

export const ROTULO_CONFIRMACAO: Record<Confirmacao, string> = { a_confirmar: 'A confirmar', confirmado: 'Confirmado', desmarcou: 'Desmarcou' }

/** é menor (ou só tem o telefone do responsável)? então a conversa é com o responsável */
export function falaComResponsavel(p: Paciente) {
  const anos = idade(p.data_nascimento)
  if (anos !== null) return anos < 18 && !!(p.responsavel_telefone || p.responsavel_nome)
  return !!p.responsavel_telefone && !p.telefone
}

export function telefoneDe(p: Paciente) {
  return falaComResponsavel(p) ? (p.responsavel_telefone || p.telefone || '') : (p.telefone || p.responsavel_telefone || '')
}

/** só os números, com o 55 do Brasil na frente (wa.me pede assim) */
export function numeroWhats(tel: string) {
  let n = tel.replace(/\D/g, '').replace(/^0+/, '')
  if (!n) return ''
  if (!(n.startsWith('55') && n.length >= 12)) n = '55' + n
  return n
}

const primeiro = (s?: string | null) => (s || '').trim().split(/\s+/)[0] || ''

/** "amanhã, quinta (12/11)" ou "na segunda (16/11)" */
export function quando(data: string, hoje: string) {
  const dia = `${DIAS[diaDaSemana(data)]} (${diaMes(data)})`
  return data === somarDias(hoje, 1) ? `amanhã, ${dia}` : `${diaDaSemana(data) === 0 || diaDaSemana(data) === 6 ? 'no' : 'na'} ${dia}`
}

export function mensagem(i: ItemAgenda, hoje: string) {
  const p = i.paciente
  const resp = falaComResponsavel(p)
  const modelo = resp ? MENSAGEM_RESPONSAVEL : MENSAGEM_PACIENTE
  return modelo
    .replace('{responsavel}', resp && p.responsavel_nome ? `, ${primeiro(p.responsavel_nome)}` : '')
    .replace('{nome}', primeiro(p.nome_social || p.nome))
    .replace('{quando}', quando(i.data, hoje))
    .replace('{hora}', i.hora || 'no horário combinado')
    .replace('{local}', i.local?.nome || 'clínica')
    .replace(', às no horário combinado', ', no horário combinado')
}

export function linkWhats(i: ItemAgenda, hoje: string) {
  const n = numeroWhats(telefoneDe(i.paciente))
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensagem(i, hoje))}` : ''
}
