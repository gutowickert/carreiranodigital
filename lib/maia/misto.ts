// Maia: o modelo misto do atendimento dos clientes (08/11, T11 do plano de passagem).
// A resposta comum sai no modelo barato (haiku). Quando a IA quer tomar uma DECISÃO DE VENDA (mudar pra "proposta", marcar
// ganho, marcar perdido) ou passar a conversa pro dono, a resposta é jogada fora ANTES de rodar a ferramenta e a decisão é
// refeita no modelo mais forte (sonnet). Pedido de pessoa, reclamação e devolução (gatilhoHumano) já vão direto pro forte.
// As duas chamadas ficam anotadas no custo (maia_eventos 'uso_ia', com fase 'barato' ou 'refeito'): GET /api/maia/operacao?acao=custo_ia
//
// Variáveis (Vercel):
//   MAIA_MODELO_MISTO         padrão ligado. "0" desliga (aí tudo vai no MAIA_MODELO_CLIENTE, como antes)
//   MAIA_MODELO_CLIENTE       o modelo barato (padrão claude-haiku-5-5)
//   MAIA_MODELO_CLIENTE_FORTE o modelo que refaz a decisão (padrão claude-sonnet-5-5)
// Se o barato e o forte forem o mesmo modelo, o misto não faz nada (uma chamada só).
import { comFerramentas, type Ferramenta } from './ia'

export const modeloBarato = () => process.env.MAIA_MODELO_CLIENTE || 'claude-haiku-5-5'
export const modeloForte = () => process.env.MAIA_MODELO_CLIENTE_FORTE || 'claude-sonnet-5-5'
export const mistoLigado = () => process.env.MAIA_MODELO_MISTO !== '0' && modeloBarato() !== modeloForte()

// as ferramentas que são decisão de venda (ou passar a conversa): essas o modelo barato não decide sozinho
export const decisaoDeVenda = (p: { name: string; input?: any }) =>
  ['venda_fechada', 'venda_perdida', 'passar_para_o_dono'].includes(p.name) || (p.name === 'mudar_etapa' && p.input?.etapa === 'proposta')

type Uso = { tipo?: string; negocio_id?: string | null; conversa_id?: string | null }

export async function respondeMisto(sistema: string, pedido: string, ferrs: Ferramenta[], uso: Uso, direto = false) {
  if (!mistoLigado()) {
    const r = await comFerramentas(sistema, pedido, ferrs, 6, { modelo: modeloBarato(), uso })
    return { r, modelo: modeloBarato(), refez: false }
  }
  // caso delicado já na entrada (pessoa, reclamação, devolução): vai direto pro forte (economiza a chamada barata)
  if (direto) {
    const r = await comFerramentas(sistema, pedido, ferrs, 6, { modelo: modeloForte(), uso: { ...uso, fase: 'direto' } as any })
    return { r, modelo: modeloForte(), refez: false }
  }
  const barato = await comFerramentas(sistema, pedido, ferrs, 6, { modelo: modeloBarato(), uso: { ...uso, fase: 'barato' } as any, antes: ps => ps.some(decisaoDeVenda) })
  if (!barato.parou) return { r: barato, modelo: modeloBarato(), refez: false }
  const r = await comFerramentas(sistema, pedido, ferrs, 6, { modelo: modeloForte(), uso: { ...uso, fase: 'refeito' } as any })
  // o que o barato já tinha rodado antes de parar (ex.: retomar_depois) continua valendo: junta na lista
  return { r: { ...r, usadas: [...barato.usadas, ...r.usadas] }, modelo: modeloForte(), refez: true }
}
