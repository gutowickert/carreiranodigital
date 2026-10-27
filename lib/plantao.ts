import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// O PLANTÃO DA IA (27/10/2026, pedido do Nando): o time viaja de quinta 29/10 a terça 03/11 e o
// atendimento não pode parar. Interruptor PRÓPRIO, em `configuracoes` chave `ia.plantao`, de propósito
// separado do `ia-automacao` antigo: religar aquele reativa as rotinas do funil antigo (virada,
// posse-funil, roteador, sem-cidade-perda) e para o funil-motor do Rick. Este não mexe em nada disso.
//
//   modo: 'desligado' (padrão) | 'sombra' (escreve o que faria e não manda) | 'ligado'
//   de / ate: ISO opcionais — fora da janela conta como desligado, pra ele se desligar sozinho
export type ConfigPlantao = { modo: 'desligado' | 'sombra' | 'ligado'; de?: string | null; ate?: string | null }
const PADRAO: ConfigPlantao = { modo: 'desligado' }

export async function configPlantao(): Promise<ConfigPlantao> {
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'ia.plantao').maybeSingle()
  try { return { ...PADRAO, ...(data?.valor ? JSON.parse(data.valor) : {}) } } catch { return PADRAO }
}

/** O modo que vale AGORA: fora da janela `de`–`ate`, é desligado. */
export async function modoPlantao(agora = new Date()): Promise<ConfigPlantao['modo']> {
  const c = await configPlantao()
  if (c.modo === 'desligado') return 'desligado'
  if (c.de && +agora < +new Date(c.de)) return 'desligado'
  if (c.ate && +agora > +new Date(c.ate)) return 'desligado'
  return c.modo
}

export const plantaoLigado = async (agora = new Date()) => (await modoPlantao(agora)) === 'ligado'

// QUEM PARA A IA, POR LEAD: um registro `plantao_pausa` no histórico do lead, mais novo que o último
// `plantao_volta`. Grava o pausa: o time quando manda mensagem pelo sistema (só com o plantão ligado) e a
// própria IA quando passa o lead pro time. O botão "Devolver pra IA" (/dashboard/ia-plantao) grava o volta.
export async function pausadoNoPlantao(leadId: string): Promise<{ pausado: boolean; motivo?: string }> {
  const { data } = await sb.from('lead_andamentos').select('tipo, observacao, criado_em').eq('lead_id', leadId)
    .in('tipo', ['plantao_pausa', 'plantao_volta']).order('criado_em', { ascending: false }).limit(1)
  const u = data?.[0]
  return u?.tipo === 'plantao_pausa' ? { pausado: true, motivo: u.observacao || '' } : { pausado: false }
}

export async function pausarNoPlantao(leadId: string, motivo: string) {
  await sb.from('lead_andamentos').insert({ lead_id: leadId, tipo: 'plantao_pausa', observacao: `⏸️ IA do plantão parou neste lead: ${motivo}`.slice(0, 600) })
}

/** O time mandou mensagem pro lead pelo sistema: com o plantão ligado, a IA sai desse lead. Não lança. */
export async function timeAssumiu(leadId: string | null | undefined) {
  try {
    if (!leadId || !(await plantaoLigado())) return
    if ((await pausadoNoPlantao(leadId)).pausado) return
    await pausarNoPlantao(leadId, 'o time assumiu a conversa')
  } catch { /* o envio do time nunca depende disto */ }
}
