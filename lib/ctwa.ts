import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { aplicarRateio } from '@/lib/rateio'
import { ORG_CND } from '@/lib/org'
import { createHash } from 'crypto'

// ANÚNCIO DIRETO PRO WHATSAPP (Click-to-WhatsApp, "CTWA") — decisão do Guto em 05/10/2026.
//
// Quando a pessoa toca no anúncio e manda a 1ª mensagem, a Meta entrega junto, na própria mensagem,
// um `referral` com o anúncio de onde ela veio (source_id = id do anúncio) e o `ctwa_clid` (o id do
// clique). Não existe site nem #ref no meio: é ESTE cartão que diz a origem.
//
// Aqui: (1) lê o cartão, (2) descobre campanha/conjunto/anúncio pelo id na API de anúncios, (3) acha a
// "turma" (o container do produto) pelo nome da campanha, (4) cria o lead já etiquetado, e (5) devolve
// os eventos pra Meta pelo canal de mensagens (Conversions API for Business Messaging), que é o único
// jeito de a Meta casar o resultado com o clique no anúncio de WhatsApp.

export type Referral = { adId: string; ctwaClid: string | null; headline: string | null; body: string | null; sourceUrl: string | null }

/** O cartão de origem, se a mensagem veio de um anúncio. */
export function lerReferral(m: any): Referral | null {
  const r = m?.referral
  if (!r || r.source_type !== 'ad' || !r.source_id) return null
  return { adId: String(r.source_id), ctwaClid: r.ctwa_clid || null, headline: r.headline || null, body: r.body || null, sourceUrl: r.source_url || null }
}

/** Nome do anúncio, do conjunto e da campanha, pelo id do anúncio. Sem token ou se a API falhar, volta vazio. */
export async function nomesDoAnuncio(adId: string): Promise<{ anuncio: string | null; conjunto: string | null; campanha: string | null }> {
  const token = process.env.FB_ADS_TOKEN
  const vazio = { anuncio: null, conjunto: null, campanha: null }
  if (!token) return vazio
  try {
    const r = await fetch(`https://graph.facebook.com/v25.0/${adId}?fields=name,adset{name},campaign{name}&access_token=${encodeURIComponent(token)}`)
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) return vazio
    return { anuncio: j.name || null, conjunto: j.adset?.name || null, campanha: j.campaign?.name || null }
  } catch { return vazio }
}

/**
 * Qual "turma" (container do produto) o lead entra, pelo nome da campanha:
 *  - campanha do DEU VENDA → `deuvendaportoalegre` se citar Porto Alegre/POA, senão `deuvendalajeado`;
 *  - campanha que traz o código de uma turma no nome (ex.: "ANLPORTOALEGRE102601 - ABO") → essa turma.
 */
export function codigoDaCampanha(campanha: string | null, codigos: string[]): string | null {
  if (!campanha) return null
  const c = campanha.toLowerCase()
  if (/deu\s*venda/.test(c)) return /porto\s*alegre|\bpoa\b/.test(c) ? 'deuvendaportoalegre' : 'deuvendalajeado'
  const semEspaco = c.replace(/[^a-z0-9]/g, '')
  // 19/10: anúncio direto do teunegócio OS ("TEUNEGOCIO OS - WHATSAPP", "teunegócio OS", "TEU NEGOCIO OS") → o container do OS
  const semAcento = c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  if (semAcento.includes('teunegocio')) return codigos.find(cod => /^teunegocioos/i.test(cod || '')) || null
  return codigos.find(cod => cod && cod.length >= 6 && semEspaco.includes(cod.toLowerCase())) || null
}

export const ehDeuVenda = (codigoTurma?: string | null) => !!codigoTurma && codigoTurma.toLowerCase().startsWith('deuvenda')

/**
 * Cria (ou completa) o lead que chegou por anúncio de WhatsApp. Lead que já existe pelo telefone só
 * ganha a origem que faltava. Lead novo do DEU VENDA nasce com `atendido_por='ia'`: é isso que liga o
 * atendimento da IA do Deu Venda (lib/ia-deu-venda.ts) — os outros leads do Deu Venda seguem com o time.
 */
export async function leadDoAnuncio(p: { telefone: string; nome: string | null; referral: Referral }): Promise<{ id: string; nome: string | null; criado: boolean } | null> {
  const { telefone, nome, referral } = p
  const sufixo = telefone.slice(-8)
  const nomes = await nomesDoAnuncio(referral.adId)
  const origem = {
    utm_source: referral.sourceUrl && /instagram/i.test(referral.sourceUrl) ? 'instagram' : 'facebook',
    utm_medium: 'paid', utm_campaign: nomes.campanha, utm_content: nomes.anuncio,
    ctwa_clid: referral.ctwaClid, anuncio_id: referral.adId,
  }

  const { data: existente } = await sb.from('leads').select('id, nome, utm_campaign, utm_content, utm_source, ctwa_clid, anuncio_id').ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  if (existente) {
    // já conhecido: só preenche o que falta (não troca a origem de quem já veio de outro lugar)
    const patch: any = {}
    for (const k of ['utm_campaign', 'utm_content', 'utm_source', 'ctwa_clid', 'anuncio_id'] as const) if (!(existente as any)[k] && (origem as any)[k]) patch[k] = (origem as any)[k]
    if (!existente.utm_campaign && origem.utm_medium) patch.utm_medium = origem.utm_medium
    if (Object.keys(patch).length) await sb.from('leads').update(patch).eq('id', existente.id)
    await sb.from('lead_andamentos').insert({ lead_id: existente.id, tipo: 'observacao', observacao: `📣 Chamou de novo pelo anúncio de WhatsApp${nomes.anuncio ? ` "${nomes.anuncio}"` : ''}${nomes.campanha ? ` (${nomes.campanha})` : ''}.` })
    return { id: existente.id, nome: existente.nome, criado: false }
  }
  // aluno também não vira lead novo (é atendido como aluno)
  const { data: aluno } = await sb.from('alunos').select('id').ilike('whatsapp', `%${sufixo}%`).limit(1).maybeSingle()
  if (aluno) return null

  const { data: turmas } = await sb.from('turmas').select('id, codigo').not('codigo', 'is', null)
  const codigo = codigoDaCampanha(nomes.campanha, (turmas || []).map((t: any) => t.codigo))
  const turma = codigo ? (turmas || []).find((t: any) => t.codigo.toLowerCase() === codigo.toLowerCase()) : null
  // 20/10: com a IA desligada (interruptor ia-automacao {ligado:false}), o lead do Deu Venda nasce como os das
  // outras turmas: etapa Ligação, atendido pelo time, e cai na fila de ligações. Só nasce com a IA se ela estiver ligada.
  const { data: chave } = await sb.from('webhook_logs').select('payload').eq('org_id', ORG_CND).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  const dv = ehDeuVenda(turma?.codigo) && (chave?.payload as any)?.ligado !== false
  const vendedorId = turma ? await aplicarRateio(sb, turma.id) : null

  const { data: novo } = await sb.from('leads').insert({
    nome: nome || 'Lead WhatsApp', whatsapp: telefone,
    turma_id: turma?.id || null, codigo_turma: turma?.codigo || null, vendedor_id: vendedorId,
    // Deu Venda: a IA atende na hora (etapa de conversa, não "aguardando ligação", que trava a IA)
    etapa: dv ? 'atendimento_inicial' : 'aguardando_atendimento',
    atendido_por: dv ? 'ia' : 'humano',
    origem: 'whatsapp', ...origem,   // (o banco só aceita a lista de origens; quem veio do anúncio de WhatsApp se reconhece pelo ctwa_clid/anuncio_id)
  }).select('id, nome').single()
  if (!novo) return null
  await sb.from('lead_andamentos').insert({
    lead_id: novo.id, vendedor_id: vendedorId, tipo: 'criado', etapa_nova: dv ? 'atendimento_inicial' : 'aguardando_atendimento',
    observacao: `Lead criado pelo anúncio de WhatsApp${nomes.anuncio ? ` "${nomes.anuncio}"` : ''}${nomes.campanha ? ` · ${nomes.campanha}` : ' (campanha não identificada)'}${dv ? ' · IA do Deu Venda atendendo' : ''}`,
  })
  await eventoMensagens('LeadSubmitted', { leadId: novo.id, ctwaClid: referral.ctwaClid, telefone, codigoTurma: turma?.codigo || null })
  return { id: novo.id, nome: novo.nome, criado: true }
}

// ─── Conversions API for Business Messaging (WhatsApp) ───────────────────────────────────────────
// action_source 'business_messaging' + messaging_channel 'whatsapp' + o ctwa_clid do clique. A Meta só
// aceita num conjunto de dados LIGADO à conta do WhatsApp Business. Tudo vai pro webhook_logs
// (origem 'capi-wa-<evento>') pra dar pra auditar o que foi e o que falhou.
//
// ⚠️ O CONJUNTO DE DADOS DA CONTA DO WHATSAPP (06/11/2026). Ia pro pixel do site (FB_PIXEL_ID), que não é
// ligado ao WhatsApp: os 78 LeadSubmitted de 19/10 a 05/11 foram TODOS recusados (erro 2804132, "não há uma
// conta do WhatsApp Business vinculada a este conjunto de dados") e o Gerenciador nunca viu um lead de
// anúncio de WhatsApp. A própria Meta manda pedir o conjunto da conta: POST /<WABA>/dataset devolve o
// conjunto ligado a ela (cria se não houver, devolve o mesmo se já houver). Vale CAPI_WA_DATASET_ID se
// estiver na Vercel; senão pergunta uma vez e guarda na memória da instância.
const sha = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex')
let datasetCache: string | null = null

async function datasetDoWhatsapp(waba: string): Promise<{ id: string | null; erro?: string }> {
  if (process.env.CAPI_WA_DATASET_ID) return { id: process.env.CAPI_WA_DATASET_ID }
  if (datasetCache) return { id: datasetCache }
  const token = process.env.WA_OFICIAL_TOKEN
  if (!token) return { id: null, erro: 'falta WA_OFICIAL_TOKEN pra pedir o conjunto de dados da conta do WhatsApp' }
  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${waba}/dataset`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const j: any = await res.json().catch(() => ({}))
    if (j?.id) { datasetCache = String(j.id); return { id: datasetCache } }
    return { id: null, erro: 'a Meta não devolveu o conjunto de dados: ' + JSON.stringify(j?.error || j).slice(0, 300) }
  } catch (e: any) { return { id: null, erro: e?.message || 'fetch falhou' } }
}

export async function eventoMensagens(
  evento: 'LeadSubmitted' | 'QualifiedLead' | 'Purchase',
  p: { leadId: string; ctwaClid: string | null; telefone?: string | null; codigoTurma?: string | null; valor?: number | null; eventId?: string },
): Promise<{ ok: boolean; erro?: string }> {
  const waba = process.env.WA_OFICIAL_WABA_ID
  // a chave da conta do WhatsApp fala com o conjunto dela; a do pixel fica de reserva
  const tokens = [process.env.WA_OFICIAL_TOKEN, process.env.FB_CAPI_TOKEN].filter(Boolean) as string[]
  let r: { ok: boolean; erro?: string; dataset?: string | null }
  const ds = p.ctwaClid && waba ? await datasetDoWhatsapp(waba) : { id: null as string | null }
  const dataset = ds.id
  if (!p.ctwaClid) r = { ok: false, erro: 'lead sem ctwa_clid (não veio de anúncio de WhatsApp)' }
  else if (!waba || !tokens.length) r = { ok: false, erro: 'faltam WA_OFICIAL_WABA_ID ou as chaves da Meta' }
  else if (!dataset) r = { ok: false, erro: ds.erro || 'sem conjunto de dados da conta do WhatsApp' }
  else {
    const user_data: any = { whatsapp_business_account_id: waba, ctwa_clid: p.ctwaClid, external_id: [sha(p.leadId)] }
    const dig = (p.telefone || '').replace(/\D/g, '')
    if (dig) user_data.ph = [sha(dig.startsWith('55') ? dig : '55' + dig)]
    const ev: any = {
      event_name: evento, event_time: Math.floor(Date.now() / 1000), event_id: p.eventId || `${evento}-${p.leadId}`,
      action_source: 'business_messaging', messaging_channel: 'whatsapp', user_data,
    }
    const cd: any = {}
    if (p.codigoTurma) { cd.content_ids = [p.codigoTurma]; cd.content_type = 'product' }
    if (evento === 'Purchase') { cd.currency = 'BRL'; cd.value = Number(p.valor) || 0 }
    if (Object.keys(cd).length) ev.custom_data = cd
    r = { ok: false, erro: 'sem resposta', dataset }
    for (const token of tokens) {
      try {
        const res = await fetch(`https://graph.facebook.com/v25.0/${dataset}/events?access_token=${encodeURIComponent(token)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: [ev], ...(process.env.FB_TEST_EVENT_CODE ? { test_event_code: process.env.FB_TEST_EVENT_CODE } : {}) }),
        })
        const j: any = await res.json().catch(() => ({}))
        r = res.ok ? { ok: true, dataset } : { ok: false, erro: JSON.stringify(j?.error || j).slice(0, 500), dataset }
        if (r.ok) break
      } catch (e: any) { r = { ok: false, erro: e?.message || 'fetch falhou', dataset } }
    }
  }
  try {
    await sb.from('webhook_logs').insert({ origem: 'capi-wa-' + evento.toLowerCase(), evento: p.codigoTurma || evento, status: r.ok ? 'processado' : 'erro', payload: { lead_id: p.leadId, ok: r.ok, erro: r.erro || null, valor: p.valor ?? null, dataset: r.dataset || null } })
  } catch { /* log é best-effort */ }
  return { ok: r.ok, erro: r.erro }
}

