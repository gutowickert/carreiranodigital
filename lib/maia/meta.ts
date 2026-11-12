// Maia: os anúncios na Meta (03/11). A conta de anúncio do cliente é compartilhada com o BM da escola e atribuída ao
// system user (o mesmo FB_ADS_TOKEN do tráfego dos clientes, ver lib/meta-ads.ts). Campanha de mensagem pro WhatsApp (CTWA).
// SEGURANÇA:
//   - tudo nasce PAUSADO; só liga com as peças aprovadas pelo dono E a equipe mandando ativar (regra do Guto até ele confiar)
//   - sem MAIA_META_REAL=1 nada vai pra Meta: grava o que seria enviado e devolve ids de simulação
import { maiaDb as db } from './db'
import { avisaEquipe } from './canal'

const GRAPH = 'https://graph.facebook.com/v25.0'
const TOKEN = () => process.env.MAIA_ADS_TOKEN || process.env.FB_ADS_TOKEN || ''
export const metaReal = () => process.env.MAIA_META_REAL === '1'
const act = (id: string) => (String(id).startsWith('act_') ? id : 'act_' + id)

async function post(caminho: string, corpo: Record<string, any>) {
  if (!metaReal()) return { id: 'sim_' + caminho.split('/').pop() + '_' + Math.random().toString(36).slice(2, 8), simulado: true }
  const fd = new URLSearchParams()
  for (const [k, v] of Object.entries(corpo)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v))
  fd.append('access_token', TOKEN())
  const r = await fetch(`${GRAPH}/${caminho}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || j.error) throw new Error('Meta: ' + (j?.error?.error_user_msg || j?.error?.message || r.status))
  return j
}
async function get(caminho: string, params: Record<string, string> = {}) {
  const u = new URL(`${GRAPH}/${caminho}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  u.searchParams.set('access_token', TOKEN())
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || j.error) throw new Error('Meta: ' + (j?.error?.message || r.status))
  return j
}

// 06/11 (demonstração): só leitura, pros números da campanha do teste (demo-amostra.ts)
export const leMeta = get
export const contaAct = act

// a cidade do negócio vira a chave de cidade da Meta (raio em volta dela)
async function chaveCidade(cidade: string) {
  if (!metaReal()) return { key: 'sim_cidade', name: cidade }
  const j = await get('search', { type: 'adgeolocation', location_types: '["city"]', q: cidade, country_code: 'BR', limit: '5' })
  const c = (j.data || [])[0]
  if (!c) throw new Error('cidade não encontrada na Meta: ' + cidade)
  return { key: c.key, name: c.name }
}

// 12/11 (campanha da escola): com promoted_object só com a página, a Meta manda o clique pro número PADRÃO da página,
// que pode ser outro (a escola tem 6 números na página; os contatos caíram no número da Maia por 2 dias). O número
// do WhatsApp do negócio vai sempre explícito no conjunto. Detalhes que a Meta impõe:
//   - o número só se escolhe na CRIAÇÃO do conjunto (num conjunto ativo não muda: tem que criar outro)
//   - ele tem que estar ligado à página E a conta do WhatsApp (WABA) tem que estar atribuída ao usuário do sistema
//     que usa o token; senão a Meta responde "This WhatsApp phone number is not linked to your account"
const soDigitos = (s: any) => String(s || '').replace(/\D/g, '')
// o número que o cliente do negócio tem que achar do outro lado do anúncio (DDI + DDD + número, só dígitos)
export async function numeroDoAnuncio(neg: any): Promise<string> {
  let n = soDigitos(neg.meta?.wa?.numero || neg.contexto?.whatsapp)
  if (!n && neg.wa_phone_id) {
    // mesmo caminho do link do perfil: lê o número da conta do WhatsApp conectada e guarda em meta.wa.numero
    const { linkDoPerfil } = await import('./social')
    n = soDigitos((await linkDoPerfil(neg.id).catch(() => null))?.numero)
  }
  if (!n) throw new Error('falta o número do WhatsApp do negócio pro anúncio (conecta o WhatsApp ou preenche meta.wa.numero)')
  if (!n.startsWith('55')) n = '55' + n
  return n
}
// "não está ligado" vira uma frase que diz o que fazer
export const explicaNumero = (e: any, numero: string) => /not linked|não está vinculado|nao esta vinculado/i.test(String(e?.message || ''))
  ? new Error(`a Meta não aceitou o WhatsApp ${numero} no anúncio: o número precisa estar ligado à página do negócio e a conta do WhatsApp atribuída ao usuário do sistema no BM da escola (Configurações do negócio → Contas do WhatsApp → Atribuir usuários)`)
  : e
// a Meta às vezes guarda sem o 9 do celular: 55 51 9xxxx-xxxx e 55 51 xxxx-xxxx são o mesmo número
export const mesmoNumero = (a: string, b: string) => {
  const sem9 = (s: string) => { s = soDigitos(s); return s.length === 13 && s[4] === '9' ? s.slice(0, 4) + s.slice(5) : s }
  return !!soDigitos(a) && sem9(a) === sem9(b)
}
// lê de volta o conjunto e confere o número. Se a Meta não guardou o número certo, o anúncio NÃO pode ir pro ar.
export async function confereNumero(adset_id: string, numero: string) {
  if (!metaReal()) return { ok: true, simulado: true }
  const j = await get(adset_id, { fields: 'promoted_object' })
  const salvo = soDigitos(j?.promoted_object?.whatsapp_phone_number)
  if (!mesmoNumero(salvo, numero)) throw new Error(`o conjunto ${adset_id} está com o WhatsApp ${salvo || '(padrão da página)'} e não com o ${numero}: não liga`)
  return { ok: true, numero: salvo }
}

// monta a campanha inteira, PAUSADA: campanha → conjunto (cidade + raio, verba do dia, conversa no WhatsApp) → um anúncio por peça aprovada
export async function criaCampanhaPausada(negocio_id: string, opc: { peca_ids?: string[]; verba_dia?: number; raio_km?: number; idade_min?: number; idade_max?: number; por: string }) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  const conta = neg.meta?.ad_account_id, pagina = neg.meta?.page_id
  if (!conta || !pagina) throw new Error('falta a conta de anúncio ou a página do negócio (meta.ad_account_id e meta.page_id)')
  const todas = await db.lista('pecas', { negocio_id, status: 'aprovada' })
  const pecas = todas.filter(p => (p.tipo === 'anuncio_imagem' || p.tipo === 'anuncio_video') && (!opc.peca_ids?.length || opc.peca_ids.includes(p.id)) && !p.campanha_id)
  if (!pecas.length) throw new Error('nenhum anúncio aprovado pelo dono pra subir')
  const numero = await numeroDoAnuncio(neg)
  const verba = Number(opc.verba_dia || neg.verba_dia || 20)
  const cidade = await chaveCidade(neg.cidade || 'Lajeado')
  const nome = `MAIA · ${neg.nome} · ${new Date().toISOString().slice(0, 10)}`
  const enviado: any = { campanha: null, conjunto: null, anuncios: [] }
  const camp = await post(`${act(conta)}/campaigns`, (enviado.campanha = { name: nome, objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', special_ad_categories: [] }))
  const conj = await post(`${act(conta)}/adsets`, (enviado.conjunto = {
    name: nome + ' · conversas', campaign_id: camp.id, status: 'PAUSED',
    daily_budget: Math.round(verba * 100), billing_event: 'IMPRESSIONS', optimization_goal: 'CONVERSATIONS', destination_type: 'WHATSAPP',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP', promoted_object: { page_id: pagina, whatsapp_phone_number: numero },
    targeting: { geo_locations: { cities: [{ key: cidade.key, radius: opc.raio_km || 25, distance_unit: 'kilometer' }] }, age_min: opc.idade_min || 18, age_max: opc.idade_max || 65, targeting_automation: { advantage_audience: 1 } },
  })).catch(e => { throw explicaNumero(e, numero) })
  // confere na hora: se a Meta não guardou o número, para aqui (a campanha fica pausada e sem anúncio)
  await confereNumero(conj.id, numero)
  const adIds: string[] = []
  for (const p of pecas) {
    const arquivo = p.arquivo_path ? await db.baixa(p.arquivo_path) : null
    if (!arquivo) throw new Error('peça sem arquivo: ' + p.id)
    const mensagem = `${p.gancho}\n\n${p.texto}`
    const cta = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } }
    let criativo: any
    if (p.tipo === 'anuncio_video') {
      const link = await db.link(p.arquivo_path)
      const v = await post(`${act(conta)}/advideos`, { file_url: link, name: p.titulo || 'maia' })
      criativo = await post(`${act(conta)}/adcreatives`, { name: `${nome} · ${p.titulo}`, object_story_spec: { page_id: pagina, video_data: { video_id: v.id, message: mensagem, call_to_action: cta, title: p.cta } } })
    } else {
      const img = await post(`${act(conta)}/adimages`, { bytes: arquivo.toString('base64') })
      const hash = img.images ? (Object.values(img.images)[0] as any)?.hash : 'sim_hash'
      criativo = await post(`${act(conta)}/adcreatives`, { name: `${nome} · ${p.titulo}`, object_story_spec: { page_id: pagina, link_data: { image_hash: hash, message: mensagem, link: 'https://api.whatsapp.com/send', name: p.cta, call_to_action: cta } } })
    }
    const ad = await post(`${act(conta)}/ads`, { name: `${nome} · ${p.titulo}`, adset_id: conj.id, creative: { creative_id: criativo.id }, status: 'PAUSED' })
    enviado.anuncios.push({ peca: p.id, ad: ad.id })
    adIds.push(ad.id)
  }
  const c = await db.insere('campanhas', {
    negocio_id, nome, status: 'criada_pausada', verba_dia: verba, publico: { cidade: cidade.name, raio_km: opc.raio_km || 25, whatsapp: numero },
    peca_ids: pecas.map(p => p.id), meta_campaign_id: camp.id, meta_adset_id: conj.id, meta_ad_ids: adIds, simulada: !metaReal(),
  })
  for (const p of pecas) await db.atualiza('pecas', { id: p.id }, { campanha_id: c.id })
  await db.evento('campanha_criada', negocio_id, { campanha: c.id, simulada: !metaReal(), por: opc.por, enviado: metaReal() ? undefined : enviado })
  return c
}

// liga a campanha. Só com as peças aprovadas pelo dono; a equipe é quem manda (ou o dono, se o negócio tiver ativa_sozinha)
export async function ativa(campanha_id: string, por: string) {
  const c = await db.um('campanhas', { id: campanha_id })
  if (!c) throw new Error('campanha não existe')
  if (c.status !== 'criada_pausada' && c.status !== 'pausada') throw new Error('campanha não está pausada (' + c.status + ')')
  const pecas = await Promise.all((c.peca_ids || []).map((id: string) => db.um('pecas', { id })))
  if (pecas.some((p: any) => !p?.aprovado_dono_em)) throw new Error('tem peça sem o 👍 do dono')
  // 12/11: antes de ligar, confere de novo o WhatsApp do conjunto contra o número do negócio de HOJE
  if (c.meta_adset_id) await confereNumero(c.meta_adset_id, await numeroDoAnuncio(await db.um('negocios', { id: c.negocio_id })))
  for (const id of [c.meta_campaign_id, c.meta_adset_id, ...(c.meta_ad_ids || [])]) await post(id, { status: 'ACTIVE' })
  const [nova] = await db.atualiza('campanhas', { id: c.id }, { status: 'ativa', ativada_por: por, ativada_em: new Date().toISOString() })
  for (const p of pecas) await db.atualiza('pecas', { id: (p as any).id }, { status: 'no_ar' })
  await db.atualiza('negocios', { id: c.negocio_id, status: 'implantacao' }, { status: 'ativo' })
  await avisaEquipe('campanha no ar', `${c.nome} (verba R$ ${c.verba_dia}/dia)${c.simulada ? ' [simulada]' : ''}`, c.negocio_id)
  return nova
}

export async function pausa(campanha_id: string, por: string) {
  const c = await db.um('campanhas', { id: campanha_id })
  if (!c) throw new Error('campanha não existe')
  await post(c.meta_campaign_id, { status: 'PAUSED' })
  const [nova] = await db.atualiza('campanhas', { id: c.id }, { status: 'pausada' })
  await db.evento('campanha_pausada', c.negocio_id, { campanha: c.id, por })
  return nova
}

// pro ativa_sozinha (desligado por padrão): liga as campanhas pausadas cujas peças o dono acabou de aprovar
export async function ativaAprovadas(negocio_id: string, por: string) {
  for (const c of await db.lista('campanhas', { negocio_id, status: 'criada_pausada' })) { try { await ativa(c.id, por) } catch {} }
}

// números do dia de cada negócio (gasto, alcance, conversas iniciadas), pra medir custo por lead e por venda
export async function sincronizaMetricas(dias = 3) {
  const negs = (await db.lista('negocios')).filter(n => n.meta?.ad_account_id && n.status === 'ativo')
  const desde = new Date(Date.now() - dias * 86400e3).toISOString().slice(0, 10), ate = new Date().toISOString().slice(0, 10)
  const feitos: any[] = []
  for (const n of negs) {
    if (!metaReal()) { feitos.push({ negocio: n.id, simulado: true }); continue }
    try {
      const j = await get(`${act(n.meta.ad_account_id)}/insights`, { level: 'account', time_increment: '1', time_range: JSON.stringify({ since: desde, until: ate }), fields: 'spend,impressions,reach,clicks,actions', filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: 'MAIA' }]) })
      for (const d of j.data || []) {
        const conv = (d.actions || []).find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')
        const linha = { negocio_id: n.id, dia: d.date_start, gasto: Number(d.spend || 0), impressoes: Number(d.impressions || 0), alcance: Number(d.reach || 0), cliques: Number(d.clicks || 0), conversas_iniciadas: Number(conv?.value || 0) }
        const ja = await db.um('metricas_dia', { negocio_id: n.id, dia: d.date_start })
        if (ja) await db.atualiza('metricas_dia', { negocio_id: n.id, dia: d.date_start }, linha); else await db.insere('metricas_dia', linha)
      }
      feitos.push({ negocio: n.id, dias: (j.data || []).length })
    } catch (e: any) { feitos.push({ negocio: n.id, erro: e.message }) }
  }
  return feitos
}
