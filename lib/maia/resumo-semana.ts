// Maia: o RESUMO DA SEMANA pro dono (13/11). Já existia (rotina.ts, segunda 7h): a IA escrevia 3 a 5 linhas soltas com os
// números. Agora o texto sai pronto daqui, SEM IA (nenhum número inventado, custo zero), sempre com as mesmas partes:
// conversas, contatos, vendas/agendamentos, quanto vendeu, quanto foi pro anúncio, o retorno ("investiu R$ X e voltou R$ Y"),
// o melhor anúncio e UMA sugestão. Caminho de sempre: vira uma peça 'relatorio' que a equipe aprova (aprovacao.ts) e vai pro
// WhatsApp do dono pelo número da Maia. Fora da janela de 24 h vai pra fila do dono e sai o modelo aprovado maia_novidades
// ("A Maia tem novidades do X pra ti: o resumo da semana"); quando o dono responde, a fila entrega o resumo (canal.ts).
// Negócio com "equipe aprova tudo" desligado: vai direto. O painel do dono mostra os resumos enviados (painel-dono.ts).
import { maiaDb as db } from './db'
import { numeros } from './funil'

const R$ = (v: number) => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/')
const plural = (n: number, s: string, p = s + 's') => `${n} ${n === 1 ? s : p}`
export const TITULO = 'Resumo da semana'

// o nome que o dono reconhece pro anúncio (o gancho da peça), a partir do id do anúncio na Meta
async function nomeDoAnuncio(negocio_id: string, ad_id: string) {
  const camps = await db.lista('campanhas', { negocio_id })
  for (const c of camps) {
    const i = (c.meta_ad_ids || []).map(String).indexOf(String(ad_id))
    if (i >= 0 && c.peca_ids?.[i]) { const p = await db.um('pecas', { id: c.peca_ids[i] }); if (p?.gancho || p?.titulo) return String(p.gancho || p.titulo) }
  }
  return null
}

// os números da semana + as conversas + o melhor anúncio
export async function dadosDaSemana(neg: any, de: Date, ate: Date) {
  const n = await numeros(neg.id, de.toISOString(), ate.toISOString())
  const msgs = await db.lista('msgs', { negocio_id: neg.id, autor: 'cliente' }, { desde: ['criado_em', de.toISOString()] })
  const convs = await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' })
  const doCliente = new Set(convs.map(c => c.id))
  const conversas = new Set(msgs.filter(m => m.criado_em <= ate.toISOString() && doCliente.has(m.conversa_id)).map(m => m.conversa_id)).size
  // o melhor anúncio: o que mais vendeu (receita, depois vendas, depois contatos). Só conta o que tem id de anúncio
  const origens = ['anuncio', 'organico', 'instagram', 'facebook', 'indicacao', 'outro', 'link']
  const anuncios = Object.entries(n.por_origem || {}).filter(([k]) => !origens.includes(k))
    .sort(([, a]: any, [, b]: any) => (b.receita - a.receita) || (b.ganhos - a.ganhos) || (b.leads - a.leads))
  let melhor: { id: string; nome: string; contatos: number; vendas: number; receita: number } | null = null
  if (anuncios.length) {
    const [id, x]: any = anuncios[0]
    melhor = { id, nome: (await nomeDoAnuncio(neg.id, id)) || (id === 'simulado' ? 'anúncio de teste' : `anúncio ${id}`), contatos: x.leads, vendas: x.ganhos, receita: x.receita }
  }
  return { ...n, conversas, melhor }
}

// a sugestão da semana: UMA, a mais importante, pela ordem do que mais pesa no bolso
export function sugestao(d: any): string {
  if (d.gasto > 0 && !d.conversas_meta && !d.leads_novos) return 'O anúncio gastou e não chegou conversa: vale a equipe conferir se o botão do anúncio abre o teu WhatsApp. Eu já deixei avisado.'
  if (d.em_aberto > 0 && d.ganhos === 0 && d.leads_novos > 0) return `Tem ${plural(d.em_aberto, 'contato')} em aberto. Me conta no WhatsApp quem fechou por fora, que eu marco a venda e o retorno do anúncio fica certo.`
  if (d.melhor?.vendas > 0) return `O anúncio "${d.melhor.nome}" foi o que mais vendeu: posso fazer mais anúncios nesse estilo, com outras fotos. É só me dizer "faz mais".`
  if (d.retomadas_pendentes > 0) return `Tenho ${plural(d.retomadas_pendentes, 'retomada marcada', 'retomadas marcadas')} pra essa semana. Se algum desses já comprou, me avisa que eu tiro da lista.`
  if (!d.leads_novos) return 'Semana parada: me manda 2 ou 3 fotos novas do teu produto que eu preparo anúncios novos pra equipe ligar.'
  return 'Me manda fotos novas do que mais sai: anúncio com foto nova costuma trazer mais conversa.'
}

// o texto pro WhatsApp do dono (curto, só números do sistema; o que não existe não aparece)
export function textoResumo(neg: any, d: any): string {
  const l: string[] = []
  const nome = String(neg.dono_nome || '').split(' ')[0]
  l.push(`${TITULO} do ${neg.nome} (${dataBR(d.periodo.de)} a ${dataBR(d.periodo.ate)})${nome ? `, ${nome}` : ''}:`)
  l.push(`- Conversas com clientes: ${d.conversas}${d.leads_novos ? ` (${plural(d.leads_novos, 'contato novo', 'contatos novos')})` : ''}`)
  l.push(`- Vendas e agendamentos fechados: ${d.ganhos}${d.ganhos ? `, somando ${R$(d.receita)}` : ''}`)
  if (d.gasto > 0) {
    l.push(`- Investido no anúncio: ${R$(d.gasto)}${d.custo_por_venda != null ? ` (${R$(d.custo_por_venda)} por venda)` : ''}`)
    l.push(d.receita > 0 ? `- Retorno: a cada ${R$(d.gasto)} investidos, voltaram ${R$(d.receita)} em vendas (${R$(d.receita / d.gasto)} pra cada R$ 1)` : '- Retorno: ainda sem venda marcada vinda da semana')
  }
  if (d.melhor) l.push(`- Melhor anúncio: "${d.melhor.nome}" (${plural(d.melhor.contatos, 'contato')}${d.melhor.vendas ? `, ${plural(d.melhor.vendas, 'venda')}` : ''})`)
  l.push(`Sugestão: ${sugestao(d)}`)
  return l.join('\n')
}

// monta e grava a peça do resumo (equipe aprova; sem a aprovação da equipe, já vai pro dono)
export async function geraResumoSemana(neg: any, de: Date, ate: Date) {
  const d = await dadosDaSemana(neg, de, ate)
  const texto = textoResumo(neg, d)
  const peca = await db.insere('pecas', { negocio_id: neg.id, tipo: 'relatorio', status: 'revisao_equipe', titulo: `Resumo ${d.periodo.de} a ${d.periodo.ate}`, texto })
  if (neg.aprovacao_equipe === false) { const { equipeAprova } = await import('./aprovacao'); await equipeAprova(peca.id, 'automatico') }
  else { const { avisaEquipe } = await import('./canal'); await avisaEquipe('resumo da semana pra aprovar', `${neg.nome}: ${d.ganhos} venda(s), ${R$(d.receita)}`, neg.id) }
  return { peca, dados: d }
}

// os resumos que já foram pro dono (o painel dele mostra)
export async function resumosEnviados(negocio_id: string, limite = 6) {
  const ps = await db.lista('pecas', { negocio_id, tipo: 'relatorio' }, { ordem: 'criado_em', desc: true })
  // 13/11: a análise dos anúncios e o relatório do mês têm lugar próprio no painel (relatorios.ts)
  return ps.filter(p => p.status === 'aprovada' && p.enviado_dono_em && !/^(Análise dos anúncios|Relatório do mês)\b/.test(String(p.titulo || ''))).slice(0, limite).map(p => ({ id: p.id, titulo: p.titulo, texto: p.texto, enviado_em: p.enviado_dono_em }))
}
