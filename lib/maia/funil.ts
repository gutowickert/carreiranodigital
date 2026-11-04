// Maia: o funil de vendas de cada negócio (03/11). Toda venda é medida aqui dentro:
// cada contato vira um lead, anda de etapa, e termina em GANHO (com valor) ou PERDIDO (com motivo).
// Quem mexe: a Maia (atendendo o cliente ou quando o dono conta "fechei com a Ana"), a equipe pelo painel, e o follow-up automático.
import { maiaDb as db } from './db'
import { fone } from '@/lib/oito/wa'

export const ETAPAS = ['novo', 'conversando', 'interessado', 'proposta', 'ganho', 'perdido'] as const
export type Etapa = typeof ETAPAS[number]
type Autor = 'maia' | 'dono' | 'equipe'

// follow-up: quem parou de responder recebe até 3 retomadas (1, 3 e 7 dias depois); sem resposta depois disso, vira perdido
export const FOLLOWUP_DIAS = [1, 3, 7]
const ABERTAS: Etapa[] = ['novo', 'conversando', 'interessado', 'proposta']
const dias = (n: number) => new Date(Date.now() + n * 86400e3).toISOString()

async function marca(lead: any, tipo: string, autor: Autor, extra: any = {}) {
  await db.insere('lead_eventos', { negocio_id: lead.negocio_id, lead_id: lead.id, tipo, autor, ...extra })
}

// acha pelo telefone, ou pelo nome (quando o dono conta "fechei com a Ana" sem telefone)
export async function achaLead(negocio_id: string, q: { telefone?: string | null; nome?: string | null; id?: string | null }) {
  if (q.id) return db.um('leads', { id: q.id, negocio_id })
  if (q.telefone) { const l = await db.um('leads', { negocio_id, telefone: fone(q.telefone) }); if (l) return l }
  if (q.nome) {
    const n = q.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const todos = await db.lista('leads', { negocio_id }, { ordem: 'atualizado_em', desc: true })
    const sem = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return todos.find(l => sem(l.nome) === n) || todos.find(l => sem(l.nome).split(' ')[0] === n.split(' ')[0]) || null
  }
  return null
}

export async function novoLead(negocio_id: string, d: { telefone?: string | null; nome?: string | null; origem?: string; anuncio_ref?: string | null; produto?: string | null; resumo?: string | null }, autor: Autor = 'maia') {
  const tel = d.telefone ? fone(d.telefone) : null
  if (tel) { const ja = await db.um('leads', { negocio_id, telefone: tel }); if (ja) return ja }
  let lead: any
  try {
    lead = await db.insere('leads', { negocio_id, telefone: tel, nome: d.nome || null, origem: d.origem || 'anuncio', anuncio_ref: d.anuncio_ref || null, produto: d.produto || null, resumo: d.resumo || null, ultimo_contato_em: new Date().toISOString() })
  } catch (e: any) { if (tel && /duplicate|23505/.test(e.message)) return db.um('leads', { negocio_id, telefone: tel }); throw e }
  await marca(lead, 'criado', autor, { para: 'novo', detalhe: { origem: lead.origem } })
  return lead
}

export async function mudaEtapa(lead: any, etapa: Etapa, autor: Autor, extra: { resumo?: string; produto?: string; valor?: number } = {}) {
  if (!ETAPAS.includes(etapa)) throw new Error('etapa inválida: ' + etapa)
  if (etapa === 'ganho') return ganhou(lead, extra.valor ?? lead.valor, extra.produto, autor)
  if (etapa === 'perdido') return perdeu(lead, extra.resumo || 'sem motivo', autor)
  const campos: any = { etapa, ...(extra.resumo ? { resumo: extra.resumo } : {}), ...(extra.produto ? { produto: extra.produto } : {}), ...(extra.valor != null ? { valor: extra.valor } : {}) }
  const [l] = await db.atualiza('leads', { id: lead.id }, campos)
  if (lead.etapa !== etapa) await marca(lead, 'etapa', autor, { de: lead.etapa, para: etapa })
  return l
}

export async function ganhou(lead: any, valor: number | null | undefined, produto: string | null | undefined, autor: Autor) {
  const [l] = await db.atualiza('leads', { id: lead.id }, { etapa: 'ganho', valor: valor ?? null, ...(produto ? { produto } : {}), ganho_em: new Date().toISOString(), proximo_followup_em: null })
  await marca(lead, 'ganho', autor, { de: lead.etapa, para: 'ganho', valor: valor ?? null, detalhe: { produto: produto || lead.produto || null } })
  return l
}

export async function perdeu(lead: any, motivo: string, autor: Autor) {
  const [l] = await db.atualiza('leads', { id: lead.id }, { etapa: 'perdido', motivo_perda: motivo, perdido_em: new Date().toISOString(), proximo_followup_em: null })
  await marca(lead, 'perdido', autor, { de: lead.etapa, para: 'perdido', detalhe: { motivo } })
  return l
}

// o cliente respondeu: zera a retomada e marca o contato
export async function clienteRespondeu(lead: any) {
  const campos: any = { ultimo_contato_em: new Date().toISOString(), proximo_followup_em: null, followups: 0 }
  if (lead.etapa === 'novo') campos.etapa = 'conversando'
  const [l] = await db.atualiza('leads', { id: lead.id }, campos)
  if (lead.etapa === 'novo') await marca(lead, 'etapa', 'maia', { de: 'novo', para: 'conversando' })
  return l
}

// a Maia respondeu e a bola ficou com o cliente: agenda a próxima retomada
export async function agendaFollowup(lead: any, quando?: string | null, motivo?: string) {
  if (!ABERTAS.includes(lead.etapa)) return lead
  const n = lead.followups || 0
  const em = quando || dias(FOLLOWUP_DIAS[Math.min(n, FOLLOWUP_DIAS.length - 1)])
  const [l] = await db.atualiza('leads', { id: lead.id }, { proximo_followup_em: em })
  if (motivo) await marca(lead, 'nota', 'maia', { detalhe: { followup_em: em, motivo } })
  return l
}

// os leads com retomada vencida (o cron chama). Depois da última, vira perdido por falta de resposta.
export async function followupsVencidos(agora = new Date()) {
  const todos = await db.lista('leads')
  return todos.filter(l => ABERTAS.includes(l.etapa) && l.proximo_followup_em && l.proximo_followup_em <= agora.toISOString())
}
export async function registraFollowup(lead: any) {
  const n = (lead.followups || 0) + 1
  const ultimo = n >= FOLLOWUP_DIAS.length
  const [l] = await db.atualiza('leads', { id: lead.id }, { followups: n, proximo_followup_em: ultimo ? dias(4) : dias(FOLLOWUP_DIAS[n] - FOLLOWUP_DIAS[n - 1]) })
  await marca(lead, 'followup', 'maia', { detalhe: { numero: n } })
  return { lead: l, ultimo }
}
export async function encerraSemResposta(lead: any) { return perdeu(lead, 'parou de responder depois das retomadas', 'maia') }

// os números do negócio num período (o dono pergunta, o relatório usa, o painel mostra)
export async function numeros(negocio_id: string, de: string, ate: string) {
  const leads = await db.lista('leads', { negocio_id })
  const met = (await db.lista('metricas_dia', { negocio_id })).filter(m => m.dia >= de.slice(0, 10) && m.dia <= ate.slice(0, 10))
  const no = (iso: string | null | undefined) => !!iso && iso >= de && iso <= ate
  const novos = leads.filter(l => no(l.criado_em))
  const ganhos = leads.filter(l => no(l.ganho_em))
  const perdidos = leads.filter(l => no(l.perdido_em))
  const receita = ganhos.reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const gasto = met.reduce((s, m) => s + (Number(m.gasto) || 0), 0)
  const conversasMeta = met.reduce((s, m) => s + (Number(m.conversas_iniciadas) || 0), 0)
  const porOrigem: Record<string, { leads: number; ganhos: number; receita: number }> = {}
  for (const l of novos) { const k = l.anuncio_ref || l.origem; (porOrigem[k] ||= { leads: 0, ganhos: 0, receita: 0 }).leads++ }
  for (const l of ganhos) { const k = l.anuncio_ref || l.origem; const o = (porOrigem[k] ||= { leads: 0, ganhos: 0, receita: 0 }); o.ganhos++; o.receita += Number(l.valor) || 0 }
  const motivos: Record<string, number> = {}
  for (const l of perdidos) motivos[l.motivo_perda || 'sem motivo'] = (motivos[l.motivo_perda || 'sem motivo'] || 0) + 1
  const abertos = leads.filter(l => ABERTAS.includes(l.etapa))
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    periodo: { de: de.slice(0, 10), ate: ate.slice(0, 10) },
    gasto: r2(gasto), conversas_meta: conversasMeta,
    leads_novos: novos.length, ganhos: ganhos.length, perdidos: perdidos.length, em_aberto: abertos.length,
    receita: r2(receita), ticket_medio: ganhos.length ? r2(receita / ganhos.length) : null,
    conversao: novos.length ? r2((ganhos.length / novos.length) * 100) : null,
    custo_por_lead: novos.length && gasto ? r2(gasto / novos.length) : null,
    custo_por_venda: ganhos.length && gasto ? r2(gasto / ganhos.length) : null,
    retorno: gasto ? r2(receita / gasto) : null,
    por_origem: porOrigem, motivos_perda: motivos,
    retomadas_pendentes: abertos.filter(l => l.proximo_followup_em).length,
  }
}
