// Recado Encantado: ACORDO DE NATAL (24/10/2026). O Papai Noel faz um acordo com a criança pra vencer um desafio até o Natal.
// O produto (pacotes, prazos, falas) está em Desktop\Recado Encantado\acordo-de-natal\PRODUTO.md. Reaproveita o motor das missões
// (recado_etapas): V1 proposta -> "eu aceito" -> V2 acordo -> andamentos (domingos) -> VF conquista (24/12).
// Quando o pagamento confirma, o trabalhador cria só o V1 e o V2 (parado, esperando o "eu aceito"). Quando o "eu aceito" chega,
// aqui se monta o resto da agenda (os domingos dependem do dia do V2). Mesmas regras em fabrica/lib/acordo.js.
import { recadoDb as db } from '@/lib/recado/db'

// último dia de venda (inclusive, horário do Brasil). PRODUTO.md: Completo até 2/12 (garante 3 andamentos), Acordo até 10/12.
export const VENDA_ATE: Record<string, string> = { acordo: process.env.RECADO_ACORDO_ATE || '2026-12-10', acordo_completo: process.env.RECADO_ACORDO_COMPLETO_ATE || '2026-12-02' }
// os 6 desafios da 1ª leva (mesmos ids da fonte das falas: acordo-de-natal/fonte/dados.js)
export const DESAFIOS: Record<string, string> = {
  chupeta: 'Tirar a chupeta', dormir: 'Dormir na própria cama', tela: 'Menos celular, tablet e TV', irmaos: 'Brigar menos com o irmão ou a irmã',
  comer: 'Comer frutas e verduras', estudo: 'Fazer a lição e estudar um pouquinho por dia',
}
export const ehAcordo = (pacote: any) => /^acordo/.test(String(pacote || ''))
// as respostas gravam nos mesmos valores das missões (sem mudar o banco):
//   domingo: foi ótimo = cumpriu · quase = tentou · difícil = ainda_nao      ·  22/12: venceu = cumpriu · progresso = tentou
export const SEMANA: Record<string, string> = { otimo: 'cumpriu', quase: 'tentou', dificil: 'ainda_nao' }
export const FINAL: Record<string, string> = { venceu: 'cumpriu', progresso: 'tentou' }
export const ESPERA_ACEITE = '2099-12-31T12:00:00.000Z'   // o V2 fica parado nesta data até o "eu aceito"

const dataBR = (t: Date) => new Date(t.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
const maisDias = (d: string, n: number) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400e3).toISOString().slice(0, 10)
const as = (d: string, h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`)
const domingo = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay() === 0
export const vendaAberta = (pacote: string) => dataBR(new Date()) <= (VENDA_ATE[pacote] || '0000')

// a agenda depois do "eu aceito" (PRODUTO.md, seção 2):
//   V2: dia seguinte ao "eu aceito", 18h
//   andamento: domingo 18h; o toque abre no sábado 18h e o prazo é domingo 15h (sem resposta: versão "quase").
//     Conta o domingo que cai 3 dias ou mais depois do V2 e até 20/12. Completo: todos. Acordo: o do meio.
//     Nenhum domingo conta: andamento 2 dias depois do V2, 18h (o toque abre na véspera 18h, prazo no dia 15h)
//   VF: 24/12 10h; a pergunta final abre 22/12 10h, prazo 23/12 12h (as VF são gravadas entre 23/12 12h e 24/12 8h)
export function agendaDepoisDoAceite(semanal: boolean, aceite = new Date()) {
  const d0 = dataBR(aceite), natal = d0.slice(0, 4) + '-12-24'
  let v2d = maisDias(d0, 1), v2 = as(v2d, 18)
  if (v2d >= natal) { v2 = new Date(aceite.getTime() + 2 * 3600e3); v2d = dataBR(v2) }   // "eu aceito" na véspera: o acordo sai na hora
  const out: { tipo: string; quando: Date; produzir?: Date; abre?: Date; corte?: Date }[] = [{ tipo: 'acordo', quando: v2 }]
  let doms: string[] = []; for (let d = maisDias(v2d, 3); d <= maisDias(natal, -4); d = maisDias(d, 1)) if (domingo(d)) doms.push(d)
  if (!semanal && doms.length) doms = [doms[Math.floor((doms.length - 1) / 2)]]
  for (const d of doms) out.push({ tipo: 'andamento', quando: as(d, 18), produzir: as(d, 15), abre: as(maisDias(d, -1), 18), corte: as(d, 15) })
  if (!doms.length) { const d = maisDias(v2d, 2); if (d < maisDias(natal, -1)) out.push({ tipo: 'andamento', quando: as(d, 18), produzir: as(d, 15), abre: as(maisDias(d, -1), 18), corte: as(d, 15) }) }
  const corteFim = as(maisDias(natal, -1), 12)
  out.push({ tipo: 'conquista', quando: as(natal, 10), produzir: corteFim, abre: as(maisDias(natal, -2), 10), corte: corteFim })
  return out
}

const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
// "eu aceito" chegou (voz pela página, "aceitou sem gravar", ou marcado no painel): monta a agenda do V2 em diante
export async function aceiteChegou(pedidoId: string, aceite: { tipo: 'voz' | 'contado'; [k: string]: any }) {
  const [p] = await db.busca('pedidos', `id=eq.${pedidoId}&select=id,pacote,missao`)
  if (!p || !ehAcordo(p.pacote)) throw new Error('pedido do acordo não encontrado')
  const [v2] = await db.busca('etapas', `pedido_id=eq.${pedidoId}&tipo=eq.acordo&select=id,ordem,status`)
  if (!v2 || v2.status !== 'agendada') throw new Error('o vídeo do acordo já está sendo gravado')
  const agora = new Date()
  await db.atualiza('pedidos', `id=eq.${pedidoId}`, { missao: { ...(p.missao || {}), aceite: { ...aceite, em: agora.toISOString() } } })
  const ag = agendaDepoisDoAceite(p.pacote === 'acordo_completo', agora)
  // o V2 sai do "parado"; grava logo (espalha a máquina), entrega no horário. As etapas depois dele são refeitas (troca de áudio, por exemplo)
  await db.atualiza('etapas', `id=eq.${v2.id}&status=eq.agendada`, { quando: ag[0].quando.toISOString(), produzir_a_partir: new Date(agora.getTime() + 10 * 60e3).toISOString() })
  await fetch(`${U()}/rest/v1/recado_etapas?pedido_id=eq.${pedidoId}&ordem=gt.${v2.ordem}&status=eq.agendada`, { method: 'DELETE', headers: { apikey: K(), Authorization: 'Bearer ' + K() } })
  for (const [i, e] of ag.slice(1).entries()) await db.insere('etapas', { pedido_id: pedidoId, ordem: v2.ordem + 1 + i, tipo: e.tipo, quando: e.quando.toISOString(),
    produzir_a_partir: e.produzir?.toISOString() || null, extras: { abre: e.abre?.toISOString(), corte: e.corte?.toISOString() } })
  await db.evento(pedidoId, 'aceite', { ...aceite, agenda: ag.map(e => `${e.tipo} ${e.quando.toISOString()}`) })
  return { acordo_em: ag[0].quando.toISOString(), andamentos: ag.filter(e => e.tipo === 'andamento').length }
}
