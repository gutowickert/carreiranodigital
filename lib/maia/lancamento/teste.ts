// Maia, lançamento: o TESTE AO VIVO. A pessoa finge ser cliente do próprio negócio e a Maia responde como atendente dele,
// usando só o que ela contou na coleta. O que a Maia não sabe: diz que confirma com a equipe. Valor antes do preço. Fala como o próprio negócio; só diz que é IA se perguntarem (Guto, 15/11).
// Sem IA (teste local ou IA fora do ar): uma resposta montada com os produtos e os preços que a pessoa deu.
import { maiaLocal } from '../db'
import { comFerramentas } from '../ia'

// O JEITO DE FALAR do negócio, tirado das últimas legendas do Instagram dele (Guto, 15/11): a atendente fala como o negócio fala.
// Lê uma vez (Business Discovery) e guarda em coleta.legendas_ig. Sem Instagram ou conta pessoal: segue no tom padrão.
export async function legendasDoInstagram(c: any): Promise<string[]> {
  const k = c.coleta || {}
  if (Array.isArray(k.legendas_ig)) return k.legendas_ig
  if (!k.instagram || c.estado?.ig_lido || maiaLocal()) return []
  try {
    const { contaIG, businessDiscovery, limparUsuario } = await import('@/lib/diagnostico/instagram')
    const { salvaJson } = await import('./base')
    const conta = await contaIG(); const u = limparUsuario(String(k.instagram))
    if (!conta.id || !u) return []
    const r = await businessDiscovery(conta.id, u)
    const legendas = r.ok ? ((r.b?.media?.data || []) as any[]).map(m => String(m.caption || '').trim()).filter(Boolean).slice(0, 10).map(s => s.slice(0, 400)) : []
    await salvaJson(c, 'coleta', { legendas_ig: legendas })
    await salvaJson(c, 'estado', { ig_lido: true })
    return legendas
  } catch { return [] }
}
export function jeitoDeFalar(c: any) {
  const ls: string[] = c.coleta?.legendas_ig || []
  if (!ls.length) return ''
  const exemplos = ls.slice(0, 6).map(l => '- ' + l.replace(/\s+/g, ' ').slice(0, 220)).join('\n')
  return '\n\nO JEITO DE FALAR DO NEGÓCIO (legendas reais do Instagram dele; imita o vocabulário, as gírias e a energia, sem exagerar, no máximo 1 emoji por mensagem e só se o negócio usa emoji; nunca copia frase inteira):\n' + exemplos
}

const usaIA = () => process.env.MAIA_LANC_IA === '1' || (!maiaLocal() && process.env.MAIA_LANC_IA !== '0' && !!process.env.ANTHROPIC_API_KEY)
const nomeNeg = (c: any) => c.coleta?.nome_negocio || (c.coleta?.negocio ? String(c.coleta.negocio).split(/[,.;]/)[0].slice(0, 60) : 'loja')

export function fichaDoNegocio(c: any) {
  const k = c.coleta || {}
  return [
    `Negócio: ${k.nome_negocio || '(sem nome dito)'} · o que vende e pra quem: ${k.negocio || '?'}`,
    `Cidade: ${k.cidade || '?'}`,
    `Produtos ou serviços com preço: ${k.produtos || '?'}`,
    ...(k.faixa_preco ? [`Faixa de preço: ${k.faixa_preco}`] : []),
    `Como o cliente compra (entrega, retirada, agendamento) e horário: ${k.como_vende || '?'}`,
    `O que mais vende ou dá mais lucro: ${k.carro_chefe || '?'}`,
    `Instagram: ${k.instagram || '?'}`,
  ].join('\n')
}

export function regrasTeste(c: any, nFotos = 0) {
  return `Tu és a atendente do negócio "${nomeNeg(c)}" no WhatsApp e falas em nome dele (por trás, és uma inteligência artificial).
Isto é um TESTE: a pessoa responsável pelo negócio está fingindo ser um cliente que viu um anúncio. Responde exatamente como responderias a um cliente de verdade.

O QUE TU SABES DO NEGÓCIO (é tudo; não existe mais nada):
${fichaDoNegocio(c)}

COMO RESPONDER:
- Curto: até 3 frases curtas, como no WhatsApp. Simpática e direta. Português do Brasil. Sem emoji, sem gíria.
- Trata o cliente do jeito que ele escreveu (tu ou você). Se não der pra saber, usa "você".
- Na primeira resposta, te apresenta como o próprio negócio (ex.: "Oi! Aqui é da ${nomeNeg(c)}."). Nunca usa o nome Maia e não diz que é IA por conta própria.
- PREÇO: primeiro o valor (o que a pessoa ganha, como é o produto ou o serviço, com o que tu sabes), depois o número. Nunca o preço seco.
- Usa SÓ o que está acima. Nunca inventa preço, prazo, endereço, taxa de entrega, sabor, horário nem promoção.
- O que tu não sabes: diz com naturalidade que vai confirmar com a equipe e já retorna (ex.: "Essa eu confirmo com a equipe e já te falo."). Depois oferece o que tu sabes. Nunca fala em "dono" nem em "implantação" pro cliente.
- Cliente quer comprar ou agendar: conduz até o pedido (o que quer, quantidade, nome, dia), e diz que confirma com a equipe. Não diz que já está confirmado.
- Só se perguntarem se é robô, IA ou pessoa: diz a verdade, que é a assistente virtual (uma IA) do negócio, e segue ajudando.
${nFotos ? `
- FOTOS: tu tens ${nFotos} foto(s) reais dos produtos ou do serviço. Quando o cliente pedir pra ver modelos, cores, opções, fotos ou como fica, ou quando mostrar ajudar a escolher, responde normal e termina a mensagem com [FOTOS]: as fotos vão logo depois da tua mensagem. Não descreve foto por foto e não promete foto que não tens.` : ''}
- Escreve só a mensagem pro cliente, sem aspas e sem explicação.${jeitoDeFalar(c)}`
}

export function respostaSimples(c: any, texto: string, primeira: boolean, nFotos = 0) {
  const k = c.coleta || {}
  const oi = primeira ? `Oi! Aqui é da ${nomeNeg(c)}. ` : ''
  const s = texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  // 16/11 (Guto): negócio de produto mostra os modelos. Pediu pra ver: vai com as fotos que a pessoa mandou
  if (nFotos && pedeFotos(s)) return `${oi}Claro! Olha alguns dos nossos modelos. Se gostar de algum, me diz qual que eu te passo os detalhes. [FOTOS]`.trim()
  if (/preco|valor|quanto|custa|tem\b|vende|produto|servico|cardapio|opcoes/.test(s) && k.produtos)
    return `${oi}${k.carro_chefe ? `O que mais sai aqui é ${String(k.carro_chefe).replace(/[.!]+$/, '')}. ` : ''}Os valores: ${String(k.produtos).replace(/[.!]+$/, '')}. ${k.como_vende ? String(k.como_vende).replace(/[.!]+$/, '') + '. ' : ''}Quer que eu já anote o teu pedido?`.trim()
  if (/quero|pedido|encomend|agend|marcar|reserv/.test(s)) return `${oi}Ótimo! Me passa o teu nome, o que tu quer e pra qual dia, que eu anoto e confirmo com a equipe.`.trim()
  if (/robo|ia\b|inteligencia|humano|pessoa/.test(s)) return `${oi}Sou uma inteligência artificial, a assistente virtual da ${nomeNeg(c)}. Posso te ajudar com os produtos, os preços e o teu pedido.`.trim()
  return `${oi}Essa eu confirmo com a equipe e já te falo. Enquanto isso, posso te ajudar com os produtos e os preços?`.trim()
}

export const pedeFotos = (s: string) => /\b(fotos?|modelos?|cor|cores|opc(ao|oes)|ver|mostra|catalogo|como fica|imagem|imagens)\b/.test(s)
export async function respostaTeste(c: any, hist: any[], texto: string, nFotos = 0) {
  if (!Array.isArray(c.coleta?.legendas_ig)) { const ls = await legendasDoInstagram(c); if (ls.length) c = { ...c, coleta: { ...(c.coleta || {}), legendas_ig: ls } } }
  const primeira = !hist.some(m => m.direcao === 'saida' && m.autor === 'maia' && !/Modo teste ligado/.test(m.texto || '') && m.criado_em >= (c.estado?.teste_desde || ''))
  if (!usaIA()) return respostaSimples(c, texto, primeira, nFotos)
  try {
    const conversa = hist.filter(m => !/Modo teste ligado/.test(m.texto || '')).map(m => `${m.direcao === 'entrada' ? 'Cliente' : 'Atendente'}: ${m.texto}`).join('\n')
    const r = await comFerramentas(regrasTeste(c, nFotos), `A conversa até agora:\n${conversa || '(começando)'}\n\nA última mensagem do cliente: "${texto}"\n\nEscreve a resposta da atendente.`, [], 1, { uso: { tipo: 'lancamento_teste' } })
    const t = String(r.texto || '').replace(/^["“]|["”]$/g, '').trim()
    return t || respostaSimples(c, texto, primeira, nFotos)
  } catch { return respostaSimples(c, texto, primeira, nFotos) }
}
