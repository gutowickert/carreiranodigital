// Maia: devolve pra Meta as conversas e as vendas que vieram do anúncio de WhatsApp (06/11).
// "Conversions API for Business Messaging": cada negócio tem um conjunto de dados (dataset) LIGADO à conta do WhatsApp
// dele (WABA). O clique no anúncio chega na 1ª mensagem (referral.ctwa_clid); a gente guarda em maia_lead_eventos
// ('ctwa', detalhe.ctwa_clid) e manda: o lead que nasceu do anúncio → LeadSubmitted; a venda marcada → Purchase (BRL).
// Travas: só com MAIA_CAPI_LIGADO=1; sem MAIA_META_REAL=1 é simulado (anota o que iria). Cada envio fica em
// maia_eventos 'capi' (ok/erro). A Meta NÃO tira duplicado nessa API: quem garante é o event_id + a consulta antes.
// Falha aqui nunca derruba o atendimento: tudo devolve {ok:false, erro} em vez de jogar erro.
// Chave: a do negócio, do cadastro incorporado (meta.wa.token), que a doc recomenda; ou MAIA_CAPI_TOKEN.
// Permissões do app: whatsapp_business_management + whatsapp_business_manage_events (acesso avançado).
import { createHash } from 'node:crypto'
import { maiaDb as db } from './db'
import { metaReal } from './meta'
import { tokenWa } from './segredo'

const GRAPH = 'https://graph.facebook.com/v25.0'
// 13/11: MAIA_CAPI=1 também liga (o nome curto do plano de lançamento); as duas desligadas por padrão
export const capiLigado = () => process.env.MAIA_CAPI_LIGADO === '1' || process.env.MAIA_CAPI === '1'
// 13/11: o conjunto de dados só é CRIADO na Meta com MAIA_CAPI_CRIAR_DATASET=1. Sem ela, vale o que já existe na WABA do negócio
// (lido por GET) ou o meta.wa.dataset_id guardado: sem dataset configurado, nada é enviado (fica anotado o motivo)
const podeCriarDataset = () => process.env.MAIA_CAPI_CRIAR_DATASET === '1'
const sha = (v: string) => createHash('sha256').update(v).digest('hex')
type Res = { ok: boolean; erro?: string; pulou?: string; simulado?: boolean; dataset_id?: string }

const tokenDe = (neg: any) => String(tokenWa(neg) || process.env.MAIA_CAPI_TOKEN || '')
const wabaDe = (neg: any) => String(neg?.meta?.wa?.waba_id || '')

async function graph(metodo: 'GET' | 'POST', caminho: string, token: string, corpo?: any) {
  const r = await fetch(`${GRAPH}/${caminho}`, {
    method: metodo, headers: { Authorization: 'Bearer ' + token, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}), signal: AbortSignal.timeout(15000),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || j.error) throw new Error('Meta: ' + String(j?.error?.error_user_msg || j?.error?.message || r.status).slice(0, 300))
  return j
}
const idDoDataset = (j: any) => String(j?.id || j?.dataset_id || j?.data?.[0]?.dataset_id || j?.data?.[0]?.id || '') || null

// o conjunto de dados da WABA do negócio: lê (GET) e, se não tiver, cria (POST devolve o mesmo se já existir). Guarda em meta.wa.dataset_id.
export async function garanteDataset(negocio_id: string): Promise<Res> {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) return { ok: false, erro: 'negócio não existe' }
  if (neg.meta?.wa?.dataset_id) return { ok: true, dataset_id: neg.meta.wa.dataset_id }
  const waba = wabaDe(neg), token = tokenDe(neg)
  if (!waba) return { ok: false, erro: 'o WhatsApp do negócio não está conectado (falta meta.wa.waba_id)' }
  let id: string | null
  if (!metaReal()) id = 'sim_dataset_' + waba
  else {
    if (!token) return { ok: false, erro: 'falta a chave do negócio (meta.wa.token) ou MAIA_CAPI_TOKEN' }
    try {
      id = idDoDataset(await graph('GET', `${waba}/dataset`, token).catch(() => null))
      if (!id && !podeCriarDataset()) return { ok: false, erro: 'o negócio ainda não tem conjunto de dados na Meta (cria no Gerenciador de Eventos, ou liga MAIA_CAPI_CRIAR_DATASET=1)' }
      if (!id) id = idDoDataset(await graph('POST', `${waba}/dataset`, token))
    } catch (e: any) { await db.evento('capi', negocio_id, { evento: 'dataset', ok: false, erro: e.message }); return { ok: false, erro: e.message } }
    if (!id) return { ok: false, erro: 'a Meta não devolveu o id do conjunto de dados' }
  }
  // relê antes de gravar, pra não apagar o que mudou no meio (a chave, o atende)
  const atual = (await db.um('negocios', { id: negocio_id })) || neg
  await db.atualiza('negocios', { id: negocio_id }, { meta: { ...(atual.meta || {}), wa: { ...(atual.meta?.wa || {}), dataset_id: id } } })
  await db.evento('capi', negocio_id, { evento: 'dataset', ok: true, dataset_id: id, simulado: !metaReal() })
  return { ok: true, dataset_id: id! }
}

// já mandou esse event_id com sucesso? (a Meta não tira duplicado nessa API)
async function jaFoi(negocio_id: string, event_id: string) {
  return (await db.lista('eventos', { negocio_id, tipo: 'capi' })).some(e => e.detalhe?.event_id === event_id && e.detalhe?.ok)
}

export async function enviaEvento(negocio_id: string, ev: { nome: 'LeadSubmitted' | 'Purchase' | 'QualifiedLead'; event_id: string; ctwa_clid: string; lead_id?: string; valor?: number | null; quando?: Date }): Promise<Res> {
  if (!capiLigado()) return { ok: false, pulou: 'MAIA_CAPI_LIGADO desligado' }
  try {
    if (await jaFoi(negocio_id, ev.event_id)) return { ok: true, pulou: 'já enviado' }
    const ds = await garanteDataset(negocio_id)
    if (!ds.ok) { await db.evento('capi', negocio_id, { evento: ev.nome, event_id: ev.event_id, lead_id: ev.lead_id || null, ok: false, erro: ds.erro }); return ds }
    const neg = await db.um('negocios', { id: negocio_id })
    const dado: any = {
      event_name: ev.nome, event_time: Math.floor((ev.quando || new Date()).getTime() / 1000), event_id: ev.event_id,
      action_source: 'business_messaging', messaging_channel: 'whatsapp',
      user_data: { whatsapp_business_account_id: wabaDe(neg), ctwa_clid: ev.ctwa_clid },
      ...(ev.nome === 'Purchase' ? { custom_data: { currency: 'BRL', value: Number(ev.valor) || 0 } } : {}),
    }
    const corpo: any = { data: [dado], ...(process.env.MAIA_CAPI_TESTE ? { test_event_code: process.env.MAIA_CAPI_TESTE } : {}), ...(process.env.MAIA_CAPI_PARCEIRO ? { partner_agent: process.env.MAIA_CAPI_PARCEIRO } : {}) }
    let r: Res
    if (!metaReal()) r = { ok: true, simulado: true }
    else {
      try { const j = await graph('POST', `${ds.dataset_id}/events`, tokenDe(neg), corpo); r = { ok: (j.events_received ?? 1) > 0 } ; if (!r.ok) r.erro = 'a Meta não recebeu: ' + JSON.stringify(j).slice(0, 200) }
      catch (e: any) { r = { ok: false, erro: e.message } }
    }
    await db.evento('capi', negocio_id, { evento: ev.nome, event_id: ev.event_id, lead_id: ev.lead_id || null, valor: ev.valor ?? null, ok: r.ok, erro: r.erro || null, simulado: !metaReal(), enviado: metaReal() ? undefined : corpo })
    return r
  } catch (e: any) {
    await db.evento('capi', negocio_id, { evento: ev.nome, event_id: ev.event_id, ok: false, erro: String(e?.message || e).slice(0, 300) })
    return { ok: false, erro: String(e?.message || e) }
  }
}

// a mensagem chegou com o clique do anúncio: guarda o ctwa_clid no lead (lead_eventos 'ctwa') e, se o clique é novo, manda LeadSubmitted
export async function anotaClique(neg: any, lead: any, referral: { ctwa_clid?: string | null; source_id?: string | null; source_url?: string | null } | null) {
  try {
    const clid = referral?.ctwa_clid
    if (!clid || !lead?.id) return { ok: false, pulou: 'sem ctwa_clid' }
    const ja = (await db.lista('lead_eventos', { lead_id: lead.id, tipo: 'ctwa' })).some(e => e.detalhe?.ctwa_clid === clid)
    if (!ja) await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'ctwa', autor: 'maia', detalhe: { ctwa_clid: clid, anuncio: referral?.source_id || null, url: referral?.source_url || null } })
    if (ja) return { ok: true, pulou: 'clique já anotado' }
    return await enviaEvento(neg.id, { nome: 'LeadSubmitted', event_id: `LeadSubmitted-${lead.id}-${sha(clid).slice(0, 12)}`, ctwa_clid: clid, lead_id: lead.id })
  } catch (e: any) { return { ok: false, erro: String(e?.message || e) } }
}

// o último clique de anúncio do lead (ou null se ele não veio de anúncio de WhatsApp)
export async function ultimoClique(lead_id: string): Promise<string | null> {
  const evs = await db.lista('lead_eventos', { lead_id, tipo: 'ctwa' }, { ordem: 'criado_em', desc: true, limite: 1 })
  return evs[0]?.detalhe?.ctwa_clid || null
}

// a venda foi marcada (funil.ganhou): Purchase com o valor, se o lead veio de um clique no anúncio
export async function vendaNaMeta(lead: any, valor: number | null | undefined) {
  try {
    if (!capiLigado() || !lead?.id) return { ok: false, pulou: 'desligado' }
    const clid = await ultimoClique(lead.id)
    if (!clid) return { ok: false, pulou: 'o lead não veio de anúncio de WhatsApp' }
    const quando = new Date(lead.ganho_em || Date.now())
    return await enviaEvento(lead.negocio_id, { nome: 'Purchase', event_id: `Purchase-${lead.id}-${Math.floor(quando.getTime() / 1000)}`, ctwa_clid: clid, lead_id: lead.id, valor, quando })
  } catch (e: any) { return { ok: false, erro: String(e?.message || e) } }
}

// o placar pro painel: quantos foram, quantos falharam e os últimos erros
export async function placarCapi(negocio_id: string) {
  const evs = (await db.lista('eventos', { negocio_id, tipo: 'capi' }, { ordem: 'criado_em', desc: true })).filter(e => e.detalhe?.evento !== 'dataset')
  return { ok: evs.filter(e => e.detalhe?.ok).length, erro: evs.filter(e => !e.detalhe?.ok).length, ultimos: evs.slice(0, 10).map(e => ({ em: e.criado_em, ...e.detalhe, enviado: undefined })) }
}
