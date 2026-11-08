// Maia: a oferta em um lugar só (06/11). A demonstração (demo.ts) usa daqui; o site (public/maia/index.html) tem o mesmo texto.
// Pra mudar sem mexer no código: MAIA_OFERTA='{"desconto_1o_mes":0}' (só os campos que mudam).
// 06/11 (Guto): não existe mais taxa de implantação. As extras são pacotes.
// 08/11 (Guto): PLANO ÚNICO de R$ 997/mês, com tudo (anúncios, atendimento 24 h, vendas contadas, melhoria mensal e
// social media com 8 posts e 4 vídeos por mês) e 1.000 conversas por mês. Acabaram o Essencial (R$ 697) e a Completa.
// O contador das conversas é lib/maia/uso.ts. No banco, plano 'essencial' e 'completa' valem os dois como o plano único.
// MAIA_OFERTA antigo continua valendo: "completa" vira "preco" e "conversas_completa" vira "conversas" (o "essencial" é ignorado).
export const OFERTA_PADRAO = {
  preco: 997,                     // R$ por mês, o plano único
  desconto_1o_mes: 50,            // % no primeiro mês
  conversas: 1000,                // conversas por mês incluídas
  posts_mes: 8,                   // social media: posts por mês
  videos_mes: 4,                  // social media: vídeos por mês
  extras: [[100, 99], [300, 249]] as [number, number][],   // [conversas, R$] dos pacotes extras
  dias_pra_rodar: 5,              // campanha rodando em X dias depois das fotos e das conexões
  verba_minima_dia: 20,
}

export function oferta() {
  let extra: any = {}
  try { extra = JSON.parse(process.env.MAIA_OFERTA || '{}') || {} } catch { /* fica o padrão */ }
  // compatibilidade com o MAIA_OFERTA dos dois planos (até 08/11)
  const { essencial, completa, conversas_essencial, conversas_completa, ...resto } = extra
  if (resto.preco == null && Number(completa) > 0) resto.preco = Number(completa)
  if (resto.conversas == null && Number(conversas_completa) > 0) resto.conversas = Number(conversas_completa)
  return { ...OFERTA_PADRAO, ...resto } as typeof OFERTA_PADRAO
}

const rs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
const mil = (n: number) => n.toLocaleString('pt-BR')

// o preço do 1º mês (com o desconto)
export function precoPrimeiroMes() {
  const o = oferta()
  return Math.round(o.preco * (100 - o.desconto_1o_mes)) / 100
}

// o texto da oferta que vai pra IA da demonstração (ela fala com as palavras dela, mas só com isto)
export function textoOferta() {
  const o = oferta(), d = o.desconto_1o_mes
  return `Um plano só, a Maia por ${rs(o.preco)}/mês, com tudo: cria e sobe os anúncios, atende os clientes no WhatsApp 24 horas, conta as vendas toda semana (de qual anúncio veio cada uma), melhora a campanha todo mês e ainda é a social media do negócio (planeja, cria, posta no Instagram e no Facebook e analisa o conteúdo; ${o.posts_mes} posts e ${o.videos_mes} vídeos do negócio por mês). Não existe outro plano nem versão mais barata.
${d ? `Primeiro mês com ${d}% de desconto: ${rs(precoPrimeiroMes())} no primeiro mês.` : ''}
Inclui ${mil(o.conversas)} conversas por mês. Conversa extra, se passar: ${o.extras.map(([c, v]) => `${rs(v)} a cada ${mil(c)}`).join(' ou ')}.
Não tem taxa de implantação. Sem fidelidade. A campanha roda em ${o.dias_pra_rodar} dias depois que ele manda as fotos e conecta as contas. Tudo fica no nome dele (conta de anúncio, WhatsApp).
A verba do anúncio (a partir de uns ${rs(o.verba_minima_dia)} por dia) e a taxa do WhatsApp ele paga direto pra Meta, no cartão dele.`
}
