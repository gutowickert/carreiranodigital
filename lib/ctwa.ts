import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { aplicarRateio } from '@/lib/rateio'
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
  const dv = ehDeuVenda(turma?.codigo)
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
// aceita se o conjunto de dados (pixel) estiver LIGADO à conta do WhatsApp Business no Gerenciador de
// Eventos. Usa CAPI_WA_DATASET_ID se existir; senão o pixel da escola. Tudo vai pro webhook_logs
// (origem 'capi-wa-<evento>') pra dar pra auditar o que foi e o que falhou.
const sha = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex')

export async function eventoMensagens(
  evento: 'LeadSubmitted' | 'QualifiedLead' | 'Purchase',
  p: { leadId: string; ctwaClid: string | null; telefone?: string | null; codigoTurma?: string | null; valor?: number | null; eventId?: string },
): Promise<{ ok: boolean; erro?: string }> {
  const dataset = process.env.CAPI_WA_DATASET_ID || process.env.FB_PIXEL_ID
  const token = process.env.FB_CAPI_TOKEN
  const waba = process.env.WA_OFICIAL_WABA_ID
  let r: { ok: boolean; erro?: string }
  if (!p.ctwaClid) r = { ok: false, erro: 'lead sem ctwa_clid (não veio de anúncio de WhatsApp)' }
  else if (!dataset || !token || !waba) r = { ok: false, erro: 'faltam CAPI_WA_DATASET_ID/FB_PIXEL_ID, FB_CAPI_TOKEN ou WA_OFICIAL_WABA_ID' }
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
    try {
      const res = await fetch(`https://graph.facebook.com/v25.0/${dataset}/events?access_token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [ev], ...(process.env.FB_TEST_EVENT_CODE ? { test_event_code: process.env.FB_TEST_EVENT_CODE } : {}) }),
      })
      const j: any = await res.json().catch(() => ({}))
      r = res.ok ? { ok: true } : { ok: false, erro: JSON.stringify(j?.error || j).slice(0, 500) }
    } catch (e: any) { r = { ok: false, erro: e?.message || 'fetch falhou' } }
  }
  try {
    await sb.from('webhook_logs').insert({ origem: 'capi-wa-' + evento.toLowerCase(), evento: p.codigoTurma || evento, status: r.ok ? 'processado' : 'erro', payload: { lead_id: p.leadId, ok: r.ok, erro: r.erro || null, valor: p.valor ?? null } })
  } catch { /* log é best-effort */ }
  return r
}

