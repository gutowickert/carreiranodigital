// Maia, lançamento: o TESTE AO VIVO. A pessoa finge ser cliente do próprio negócio e a Maia responde como atendente dele,
// usando só o que ela contou na coleta. O que a Maia não sabe: diz que aprende na implantação. Valor antes do preço. Fala como o próprio negócio; só diz que é IA se perguntarem (Guto, 15/11).
// Sem IA (teste local ou IA fora do ar): uma resposta montada com os produtos e os preços que a pessoa deu.
import { maiaLocal } from '../db'
import { comFerramentas } from '../ia'

const usaIA = () => process.env.MAIA_LANC_IA === '1' || (!maiaLocal() && process.env.MAIA_LANC_IA !== '0' && !!process.env.ANTHROPIC_API_KEY)
const nomeNeg = (c: any) => c.coleta?.nome_negocio || (c.coleta?.negocio ? String(c.coleta.negocio).split(/[,.;]/)[0].slice(0, 60) : 'loja')

export function fichaDoNegocio(c: any) {
  const k = c.coleta || {}
  return [
    `Negócio: ${k.nome_negocio || '(sem nome dito)'} · o que vende e pra quem: ${k.negocio || '?'}`,
    `Cidade: ${k.cidade || '?'}`,
    `Produtos ou serviços com preço: ${k.produtos || '?'}`,
    `Como o cliente compra (entrega, retirada, agendamento) e horário: ${k.como_vende || '?'}`,
    `O que mais vende ou dá mais lucro: ${k.carro_chefe || '?'}`,
    `Instagram: ${k.instagram || '?'}`,
  ].join('\n')
}

export function regrasTeste(c: any) {
  return `Tu és a atendente do negócio "${nomeNeg(c)}" no WhatsApp e falas em nome dele (por trás, és uma inteligência artificial).
Isto é um TESTE: o dono do negócio está fingindo ser um cliente que viu um anúncio. Responde exatamente como responderias a um cliente de verdade.

O QUE TU SABES DO NEGÓCIO (é tudo; não existe mais nada):
${fichaDoNegocio(c)}

COMO RESPONDER:
- Curto: até 3 frases curtas, como no WhatsApp. Simpática e direta. Português do Brasil. Sem emoji, sem gíria.
- Trata o cliente do jeito que ele escreveu (tu ou você). Se não der pra saber, usa "você".
- Na primeira resposta, te apresenta como o próprio negócio (ex.: "Oi! Aqui é da ${nomeNeg(c)}."). Nunca usa o nome Maia e não diz que é IA por conta própria.
- PREÇO: primeiro o valor (o que a pessoa ganha, como é o produto ou o serviço, com o que tu sabes), depois o número. Nunca o preço seco.
- Usa SÓ o que está acima. Nunca inventa preço, prazo, endereço, taxa de entrega, sabor, horário nem promoção.
- O que tu não sabes: diz com naturalidade que essa informação tu ainda não tens e que na implantação o dono te ensina (ex.: "Essa eu ainda não sei: na implantação o dono me ensina isso."). Depois oferece o que tu sabes.
- Cliente quer comprar ou agendar: conduz até o pedido (o que quer, quantidade, nome, dia), e diz que confirma com o dono. Não diz que já está confirmado.
- Só se perguntarem se é robô, IA ou pessoa: diz a verdade, que é a assistente virtual (uma IA) do negócio, e segue ajudando.
- Escreve só a mensagem pro cliente, sem aspas e sem explicação.`
}

export function respostaSimples(c: any, texto: string, primeira: boolean) {
  const k = c.coleta || {}
  const oi = primeira ? `Oi! Aqui é da ${nomeNeg(c)}. ` : ''
  const s = texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (/preco|valor|quanto|custa|tem\b|vende|produto|servico|cardapio|opcoes/.test(s) && k.produtos)
    return `${oi}${k.carro_chefe ? `O que mais sai aqui é ${String(k.carro_chefe).replace(/[.!]+$/, '')}. ` : ''}Os valores: ${String(k.produtos).replace(/[.!]+$/, '')}. ${k.como_vende ? String(k.como_vende).replace(/[.!]+$/, '') + '. ' : ''}Quer que eu já anote o teu pedido?`.trim()
  if (/quero|pedido|encomend|agend|marcar|reserv/.test(s)) return `${oi}Ótimo! Me passa o teu nome, o que tu quer e pra qual dia, que eu anoto e confirmo com o dono.`.trim()
  if (/robo|ia\b|inteligencia|humano|pessoa/.test(s)) return `${oi}Sou uma inteligência artificial, a assistente virtual da ${nomeNeg(c)}. Posso te ajudar com os produtos, os preços e o teu pedido.`.trim()
  return `${oi}Essa eu ainda não sei responder: na implantação o dono me ensina isso. Posso te ajudar com os produtos e os preços?`.trim()
}

export async function respostaTeste(c: any, hist: any[], texto: string) {
  const primeira = !hist.some(m => m.direcao === 'saida' && m.autor === 'maia' && !/Modo teste ligado/.test(m.texto || '') && m.criado_em >= (c.estado?.teste_desde || ''))
  if (!usaIA()) return respostaSimples(c, texto, primeira)
  try {
    const conversa = hist.filter(m => !/Modo teste ligado/.test(m.texto || '')).map(m => `${m.direcao === 'entrada' ? 'Cliente' : 'Atendente'}: ${m.texto}`).join('\n')
    const r = await comFerramentas(regrasTeste(c), `A conversa até agora:\n${conversa || '(começando)'}\n\nA última mensagem do cliente: "${texto}"\n\nEscreve a resposta da atendente.`, [], 1, { uso: { tipo: 'lancamento_teste' } })
    const t = String(r.texto || '').replace(/^["“]|["”]$/g, '').trim()
    return t || respostaSimples(c, texto, primeira)
  } catch { return respostaSimples(c, texto, primeira) }
}
