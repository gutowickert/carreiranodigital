// Maia: a oferta em um lugar só (06/11). A demonstração (demo.ts) usa daqui; o site (public/maia/index.html) tem o mesmo texto.
// Pra mudar sem mexer no código: MAIA_OFERTA='{"desconto_1o_mes":0}' (só os campos que mudam).
// 06/11 (Guto): não existe mais taxa de implantação. 1.000 conversas por mês nos dois planos; as extras são pacotes.
export const OFERTA_PADRAO = {
  essencial: 697,
  completa: 997,
  desconto_1o_mes: 50,            // % no primeiro mês
  conversas_mes: 1000,            // conversas por mês incluídas nos dois planos
  extras: [[100, 99], [300, 249]] as [number, number][],   // [conversas, R$] dos pacotes extras
  dias_pra_rodar: 5,              // campanha rodando em X dias depois das fotos e das conexões
  verba_minima_dia: 20,
}

export function oferta() {
  let extra: any = {}
  try { extra = JSON.parse(process.env.MAIA_OFERTA || '{}') } catch { /* fica o padrão */ }
  return { ...OFERTA_PADRAO, ...extra } as typeof OFERTA_PADRAO
}

const rs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
const mil = (n: number) => n.toLocaleString('pt-BR')

// o texto da oferta que vai pra IA da demonstração (ela fala com as palavras dela, mas só com isto)
export function textoOferta() {
  const o = oferta(), d = o.desconto_1o_mes
  const comDesc = (v: number) => rs(Math.round(v * (100 - d)) / 100)
  return `Maia Essencial ${rs(o.essencial)}/mês: cria e sobe os anúncios, atende os clientes no WhatsApp 24 horas, conta as vendas toda semana (de qual anúncio veio cada uma) e melhora a campanha todo mês.
Maia Completa ${rs(o.completa)}/mês: tudo do Essencial + a Maia como social media (planeja, cria, posta no Instagram e no Facebook e analisa o conteúdo; 8 posts e 4 vídeos do negócio por mês).
${d ? `Primeiro mês com ${d}% de desconto: Essencial ${comDesc(o.essencial)} e Completa ${comDesc(o.completa)} no primeiro mês.` : ''}
Os dois planos incluem ${mil(o.conversas_mes)} conversas por mês. Conversa extra, se passar: ${o.extras.map(([c, v]) => `${rs(v)} a cada ${mil(c)}`).join(' ou ')}.
Não tem taxa de implantação. Sem fidelidade. A campanha roda em ${o.dias_pra_rodar} dias depois que ele manda as fotos e conecta as contas. Tudo fica no nome dele (conta de anúncio, WhatsApp).
A verba do anúncio (a partir de uns ${rs(o.verba_minima_dia)} por dia) e a taxa do WhatsApp ele paga direto pra Meta, no cartão dele.`
}
