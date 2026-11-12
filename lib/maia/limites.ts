// Maia: os limites de segurança (12/11, Janela da Maia, antes do 1º cliente de verdade).
//
// São tetos que seguram a Maia mesmo quando algo dá errado: IA andando em círculo, enxurrada de números novos (ataque ou
// disparo errado), verba pedida errado numa conversa, alguém usando a demonstração pública pra gastar a nossa IA.
// Cada teto tem um padrão no código, uma troca geral por variável na Vercel e uma troca por negócio em meta.limites
// (painel da equipe → atualizar_negocio, campo meta). Subir um teto de verba é decisão de dinheiro: com o ok do Guto.
//
// Passou do teto: a Maia PARA aquela coisa (não tenta "continuar mais barato"), quem está do outro lado recebe uma
// resposta honesta e a equipe é avisada UMA vez por dia por motivo (sem encher o celular do Guto numa enxurrada).
//
//   verba_max_dia        R$ 60    nenhuma campanha é criada nem ligada com verba diária acima disso; o dono não muda a
//                                 verba pra cima disso conversando com a Maia                     MAIA_TETO_VERBA_DIA
//   ia_max_dia           R$ 20    custo de IA do negócio no dia (Brasília). Estourou: o atendimento dos clientes e a
//                                 conversa com o dono param até a meia-noite e a equipe assume    MAIA_TETO_IA_DIA
//   conversas_novas_hora 30       contatos NOVOS escrevendo pro negócio na última hora. Passou: os novos dessa hora vão
//                                 direto pra equipe (a Maia não responde com IA)                  MAIA_TETO_NOVAS_HORA
//   demos_dia            40       demonstrações novas por dia no número da Maia (só as que chegam na parte com IA;
//                                 a 1ª resposta é fixa e sem custo). Passou: a conversa vai pro Guto MAIA_TETO_DEMOS_DIA
//
// Conta de referência (08/11): uma conversa de cliente custa ~R$ 0,04 a 0,12 de IA; a franquia de 1.000 por mês dá
// ~33 por dia. R$ 20 no dia é umas 10 vezes um dia cheio: só estoura com algo errado.
import { maiaDb as db } from './db'
import { inicioDoDiaBR } from './limite'
import { custoDoNegocio } from './custo'

export const PADROES = { verba_max_dia: 60, ia_max_dia: 20, conversas_novas_hora: 30, demos_dia: 40 }
type Chave = keyof typeof PADROES
const VARIAVEL: Record<Chave, string> = {
  verba_max_dia: 'MAIA_TETO_VERBA_DIA', ia_max_dia: 'MAIA_TETO_IA_DIA', conversas_novas_hora: 'MAIA_TETO_NOVAS_HORA', demos_dia: 'MAIA_TETO_DEMOS_DIA',
}

// o teto que vale: o do negócio (meta.limites), senão o da variável, senão o padrão. Valor estranho (zero, negativo, texto) é ignorado
export function teto(neg: any, chave: Chave): number {
  const doNeg = Number(neg?.meta?.limites?.[chave])
  if (doNeg > 0) return doNeg
  const geral = Number(process.env[VARIAVEL[chave]])
  if (geral > 0) return geral
  return PADROES[chave]
}
export const tetoVerba = (neg: any) => teto(neg, 'verba_max_dia')

// verba pedida passa do teto? Devolve o texto do motivo (pra erro ou resposta), ou null se está dentro
export function verbaAcimaDoTeto(neg: any, verba: number): string | null {
  const t = tetoVerba(neg)
  if (!(Number(verba) > t)) return null
  return `a verba de R$ ${Number(verba)}/dia passa do teto de R$ ${t}/dia deste negócio (subir o teto é com o ok do Guto: meta.limites.verba_max_dia)`
}

// custo de IA do negócio hoje (Brasília) e se estourou o teto
export async function iaDoDia(neg: any, agora = new Date()) {
  const { reais } = await custoDoNegocio(neg.id, inicioDoDiaBR(agora))
  const t = teto(neg, 'ia_max_dia')
  return { gasto: reais, teto: t, estourou: reais >= t }
}

// quantos contatos NOVOS (conversa de cliente criada, fora as simuladas) o negócio recebeu na última hora
export async function novasNaHora(neg: any, agora = new Date()) {
  const desde = new Date(agora.getTime() - 3600e3).toISOString()
  const cvs = await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' }, { desde: ['criado_em', desde], campos: 'id,simulada,criado_em' })
  const n = cvs.filter(c => !c.simulada).length
  const t = teto(neg, 'conversas_novas_hora')
  return { novas: n, teto: t, passou: n > t }
}

// demonstrações que chegaram na parte com IA hoje, e se a próxima ainda cabe
export async function demosDoDia(agora = new Date()) {
  const evs = await db.lista('eventos', { tipo: 'demo_iniciada' }, { desde: ['criado_em', inicioDoDiaBR(agora)], campos: 'id' })
  const t = teto(null, 'demos_dia')
  return { demos: evs.length, teto: t, cabe: evs.length < t }
}

// avisa a equipe uma vez por dia por motivo (e por negócio). Devolve true se avisou agora
export async function avisaUmaVez(negocio_id: string | null, motivo: string, titulo: string, texto: string, agora = new Date()) {
  const hoje = await db.lista('eventos', { tipo: 'limite_atingido' }, { desde: ['criado_em', inicioDoDiaBR(agora)] })
  if (hoje.some(e => e.negocio_id === negocio_id && e.detalhe?.motivo === motivo)) return false
  await db.evento('limite_atingido', negocio_id, { motivo, texto })
  const { avisaEquipe } = await import('./canal')
  await avisaEquipe(titulo, texto, negocio_id, true)
  return true
}

// o retrato de todos os tetos de um negócio (pro painel e pros testes)
export async function limitesDoNegocio(neg: any) {
  const [ia, novas] = await Promise.all([iaDoDia(neg), novasNaHora(neg)])
  return { verba_max_dia: tetoVerba(neg), verba_dia: neg?.verba_dia ?? null, ia, novas }
}
