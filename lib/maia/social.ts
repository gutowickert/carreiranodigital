// Maia: social media do plano Completa (06/11). Ela posta no Instagram e no Facebook do negócio e lê os resultados.
//   a) agenda: cada post = uma PEÇA (maia_pecas, tipo 'post' pra foto/carrossel e 'video' pra reels) + o registro da agenda em
//      maia_eventos 'social_post' (detalhe: peca_id, quando, tipo, midias, tema, formato, objetivo, redes, status, ids da Meta).
//      A legenda é o texto da peça: o ajuste do dono ou da equipe já vale pra publicação.
//      status: rascunho → aprovado_equipe → aprovado_dono → agendado → publicando/processando → publicado | erro | descartado
//      Só publica com os dois joinhas (aprovacao.ts: equipe primeiro, depois o 👍 do dono, que chega pelo WhatsApp dele).
//   b) publicar: Instagram (/{ig}/media → espera FINISHED → /{ig}/media_publish; foto, carrossel e REELS) e Facebook
//      (/{page}/photos, carrossel = fotos não publicadas + /{page}/feed com attached_media, vídeo = /{page}/videos), com a chave da página.
//      Limite da Meta: 100 posts por 24 h no Instagram (content_publishing_limit), conferido antes de publicar; container vence em 24 h.
//   c) resultados: 1x por dia, os posts dos últimos 30 dias (maia_eventos 'social_resultado', um retrato por post por dia).
//   d) análise do mês: no dia 1, a IA (modelo maior) compara tema, formato e horário → peça 'relatorio' que passa pela equipe.
//   e) link do perfil: wa.me com "Vim pelo Instagram"; o atendimento marca o lead com origem 'instagram' (origemDoTexto).
// Travas: tudo só com MAIA_SOCIAL_LIGADO=1 na rotina; sem MAIA_META_REAL=1 é simulado (ids sim_, nada sai pra Meta).
// Chave: meta.social_token do negócio, ou MAIA_SOCIAL_TOKEN, ou a do tráfego (MAIA_ADS_TOKEN/FB_ADS_TOKEN). Dela sai a chave da página.
import { maiaDb as db } from './db'
import { metaReal } from './meta'
import { conversaDoDono, mandaImagem, mandaVideo, mandaTexto, avisaEquipe } from './canal'
import { donoAprova } from './aprovacao'
import { comFerramentas, JEITO } from './ia'
import { isoBR } from '@/lib/periodos'
import { tokenSocial, tokenWa } from './segredo'

const GRAPH = 'https://graph.facebook.com/v25.0'
export const socialLigado = () => process.env.MAIA_SOCIAL_LIGADO === '1'
const horaBR = (d = new Date()) => (d.getUTCHours() + 21) % 24
const espera = (ms: number) => new Promise(r => setTimeout(r, ms))
const ESPERA_MS = () => Number(process.env.MAIA_SOCIAL_ESPERA_MS || 5000)
const sim = (o: string) => 'sim_' + o + '_' + Math.random().toString(36).slice(2, 8)

export type TipoPost = 'foto' | 'carrossel' | 'reels'
export type Midia = { url?: string; caminho?: string; tipo?: 'foto' | 'video' }
export type Rede = 'instagram' | 'facebook'
const ABERTOS = ['rascunho', 'aprovado_equipe', 'aprovado_dono', 'agendado', 'processando', 'publicando']

// ---------- a Graph API ----------
async function graph(metodo: 'GET' | 'POST', caminho: string, token: string, params: Record<string, any> = {}) {
  const u = new URL(`${GRAPH}/${caminho}`)
  let body: URLSearchParams | undefined
  if (metodo === 'GET') for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  else { body = new URLSearchParams(); for (const [k, v] of Object.entries(params)) body.append(k, typeof v === 'string' ? v : JSON.stringify(v)) }
  const r = await fetch(u, { method: metodo, headers: { Authorization: 'Bearer ' + token }, ...(body ? { body } : {}), signal: AbortSignal.timeout(60000) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || j.error) throw new Error('Meta: ' + String(j?.error?.error_user_msg || j?.error?.message || r.status).slice(0, 300))
  return j
}
const tokenBase = (neg: any) => String(tokenSocial(neg) || process.env.MAIA_SOCIAL_TOKEN || process.env.MAIA_ADS_TOKEN || process.env.FB_ADS_TOKEN || '')
const chavesPagina = new Map<string, string>()
// a chave da página (é ela que publica no Facebook e, no login do Facebook, no Instagram ligado à página)
async function tokenPagina(neg: any) {
  const pagina = String(neg?.meta?.page_id || '')
  if (!pagina) throw new Error('falta a página do negócio (meta.page_id)')
  if (chavesPagina.has(pagina)) return chavesPagina.get(pagina)!
  const base = tokenBase(neg)
  if (!base) throw new Error('falta a chave (meta.social_token, MAIA_SOCIAL_TOKEN ou MAIA_ADS_TOKEN)')
  const j = await graph('GET', pagina, base, { fields: 'access_token' }).catch(() => null)
  const t = j?.access_token || base
  chavesPagina.set(pagina, t)
  return t
}
async function igDe(neg: any, token: string) {
  if (neg.meta?.ig_id) return String(neg.meta.ig_id)
  const j = await graph('GET', String(neg.meta?.page_id), token, { fields: 'instagram_business_account' })
  const id = j?.instagram_business_account?.id
  if (!id) throw new Error('a página não tem Instagram profissional ligado (meta.ig_id)')
  const atual = await db.um('negocios', { id: neg.id })
  await db.atualiza('negocios', { id: neg.id }, { meta: { ...(atual?.meta || {}), ig_id: id } })
  return String(id)
}

// ---------- a agenda ----------
const legendaDe = (p: any) => [p?.gancho, p?.texto, p?.cta].filter(Boolean).join('\n\n')
// "2026-11-10T18:00" sem fuso é horário de Brasília
const quandoIso = (q: string) => { const s = String(q || '').trim(); if (!s) return null; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : (s.length <= 10 ? s + 'T12:00' : s) + '-03:00'); return isNaN(d.getTime()) ? null : d.toISOString() }
const quandoTxt = (iso: string) => { const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} às ${d.getUTCHours()}h${d.getUTCMinutes() ? String(d.getUTCMinutes()).padStart(2, '0') : ''}` }

export async function posts(negocio_id?: string | null) {
  return db.lista('eventos', negocio_id ? { negocio_id, tipo: 'social_post' } : { tipo: 'social_post' }, { ordem: 'criado_em' })
}
export async function umPost(id: string | number) { return db.um('eventos', { id, tipo: 'social_post' }) }
async function salva(post: any, mudanca: any) {
  const detalhe = { ...post.detalhe, ...mudanca, atualizado_em: new Date().toISOString() }
  await db.atualiza('eventos', { id: post.id }, { detalhe })
  return { ...post, detalhe }
}

export async function criaPost(negocio_id: string, d: { quando: string; tipo: TipoPost; midias: Midia[]; legenda: string; tema?: string; formato?: string; objetivo?: string; redes?: Rede[]; por?: string }) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  if (neg.plano !== 'completa') throw new Error('social media é do plano Completa')
  if (!['foto', 'carrossel', 'reels'].includes(d.tipo)) throw new Error('tipo tem que ser foto, carrossel ou reels')
  const quando = quandoIso(d.quando)
  if (!quando) throw new Error('data/hora inválida (ex.: 2026-11-10T18:00)')
  const midias = (d.midias || []).filter(m => m && (m.url || m.caminho)).map(m => ({ ...m, tipo: m.tipo || (/\.(mp4|mov)(\?|$)/i.test(m.url || m.caminho || '') ? 'video' : 'foto') }))
  // 07/11 (segurança): arquivo do armazenamento só da pasta DESTE negócio (nunca a foto de outro cliente no post)
  if (midias.some(m => m.caminho && (!String(m.caminho).startsWith(neg.id + '/') || String(m.caminho).includes('..')))) throw new Error('mídia de fora da pasta deste negócio')
  if (d.tipo === 'foto' && (midias.length !== 1 || midias[0].tipo !== 'foto')) throw new Error('post de foto leva 1 foto')
  if (d.tipo === 'reels' && (midias.length !== 1 || midias[0].tipo !== 'video')) throw new Error('reels leva 1 vídeo')
  if (d.tipo === 'carrossel' && (midias.length < 2 || midias.length > 10)) throw new Error('carrossel leva de 2 a 10 fotos ou vídeos')
  // o Instagram só aceita JPEG na foto
  if (midias.some(m => m.tipo === 'foto' && /\.(png|webp|gif|heic)(\?|$)/i.test(m.url || m.caminho || ''))) throw new Error('foto tem que ser JPEG (o Instagram não aceita PNG/WEBP)')
  const legenda = String(d.legenda || '').trim()
  if (!legenda) throw new Error('falta a legenda')
  if (legenda.length > 2200) throw new Error('legenda passa de 2.200 caracteres (limite do Instagram)')
  if ((legenda.match(/#[\p{L}\d_]+/gu) || []).length > 30) throw new Error('mais de 30 hashtags (limite do Instagram)')
  const redes = (d.redes?.length ? d.redes : ['instagram', 'facebook']).filter(r => r === 'instagram' || r === 'facebook') as Rede[]
  const peca = await db.insere('pecas', {
    negocio_id, tipo: d.tipo === 'reels' ? 'video' : 'post', status: 'revisao_equipe', titulo: `Post ${d.tipo}${d.tema ? ' · ' + d.tema : ''} · ${quandoTxt(quando)}`,
    texto: legenda, arquivo_path: midias[0]?.caminho || null,
  })
  const ev = await db.insere('eventos', { negocio_id, tipo: 'social_post', detalhe: {
    peca_id: peca.id, quando, tipo: d.tipo, midias, tema: d.tema || null, formato: d.formato || null, objetivo: d.objetivo || null, redes,
    status: 'rascunho', ig: {}, fb: {}, tentativas: 0, por: d.por || null, simulado: !metaReal(),
  } })
  await avisaEquipe('post pra aprovar', `${neg.nome}: ${d.tipo} pra ${quandoTxt(quando)}${d.tema ? ' (' + d.tema + ')' : ''}`, negocio_id)
  return ev
}

// o status da agenda acompanha a peça (a equipe e o dono aprovam a peça, pelo painel ou pelo WhatsApp)
export async function sincroniza(post: any) {
  if (!post || !ABERTOS.slice(0, 4).includes(post.detalhe?.status)) return post
  const p = await db.um('pecas', { id: post.detalhe.peca_id })
  let st = post.detalhe.status
  if (!p || p.status === 'descartada') st = 'descartado'
  else if (p.aprovado_dono_em && p.aprovado_equipe_em && (p.status === 'aprovada' || p.status === 'no_ar')) st = 'agendado'
  else if (p.status === 'com_dono') st = 'aprovado_equipe'
  else st = 'rascunho'   // revisao_equipe, ajuste_*, gerando
  return st === post.detalhe.status ? post : salva(post, { status: st })
}

const prontoPraPublicar = (p: any) => !!p?.aprovado_equipe_em && !!p?.aprovado_dono_em && (p.status === 'aprovada' || p.status === 'no_ar')

// a equipe aprovou: vai pro dono no WhatsApp (a mídia com a legenda), esperando o 👍 (igual ao aprovacao.equipeAprova)
export async function aprovaEquipe(post_id: string | number, por: string) {
  const post = await umPost(post_id)
  if (!post) throw new Error('post não existe')
  const peca = await db.um('pecas', { id: post.detalhe.peca_id })
  if (!peca || peca.status !== 'revisao_equipe') throw new Error('o post não está esperando a equipe (' + (peca?.status || '?') + ')')
  const neg = await db.um('negocios', { id: peca.negocio_id })
  const cv = await conversaDoDono(neg)
  const m = post.detalhe.midias[0]
  const link = m.url || (await db.link(m.caminho))
  const extra = post.detalhe.tipo === 'carrossel' ? ` (carrossel com ${post.detalhe.midias.length}, essa é a 1ª)` : ''
  const legenda = `Post pro ${post.detalhe.redes.map((r: string) => r === 'instagram' ? 'Instagram' : 'Facebook').join(' e ')}, dia ${quandoTxt(post.detalhe.quando)}${extra}:\n\n${legendaDe(peca)}`
  const r = m.tipo === 'video' ? await mandaVideo(cv, link!, legenda, 'maia', peca.id) : await mandaImagem(cv, link!, legenda, 'maia', peca.id)
  const agora = new Date().toISOString()
  await db.atualiza('pecas', { id: peca.id }, { status: 'com_dono', aprovado_equipe_por: por, aprovado_equipe_em: agora, enviado_dono_em: agora, wamid_envio: r.wamid || null })
  await mandaTexto(cv, 'Me dá um 👍 nesse post que eu deixo agendado, ou me diz o que mudar.')
  return sincroniza(await umPost(post_id))
}

// o 👍 do dono (no WhatsApp ele vem pelo dono.ts; aqui é pro painel/teste)
export async function aprovaDono(post_id: string | number) {
  const post = await umPost(post_id)
  if (!post) throw new Error('post não existe')
  await donoAprova(post.negocio_id, post.detalhe.peca_id)
  return sincroniza(await umPost(post_id))
}

// o ajuste pedido (equipe ou dono) num post: a IA reescreve só a legenda e volta pra revisão da equipe. null = não é post da agenda.
export async function refazPost(peca: any, nota: string, quem: 'equipe' | 'dono') {
  const post = (await posts(peca.negocio_id)).find(p => p.detalhe?.peca_id === peca.id)
  if (!post) return null
  const neg = await db.um('negocios', { id: peca.negocio_id })
  const { emJson } = await import('./ia')
  const r = await emJson<{ legenda: string }>(`${JEITO}\nAgora tu és a social media do negócio. Legenda de Instagram: começa com uma frase que prende, conteúdo útil, até 2.200 caracteres, no máximo 5 hashtags, sem inventar preço nem promoção.`,
    `NEGÓCIO: ${neg?.nome} (${neg?.nicho || ''}, ${neg?.cidade || ''}). O QUE A MAIA SABE: ${JSON.stringify(neg?.contexto || {})}\nTEMA: ${post.detalhe.tema || '-'} · FORMATO: ${post.detalhe.formato || post.detalhe.tipo}\nLEGENDA ATUAL:\n${legendaDe(peca)}\n\nAJUSTE PEDIDO PELA ${quem === 'equipe' ? 'EQUIPE' : 'DONA/DONO'}: ${nota}\nDevolve {"legenda":"..."}`)
  const [nova] = await db.atualiza('pecas', { id: peca.id }, { gancho: null, cta: null, texto: String(r.legenda || peca.texto).slice(0, 2200), status: 'revisao_equipe', versao: (peca.versao || 1) + 1, ...(quem === 'equipe' ? { nota_equipe: nota } : { nota_dono: nota }) })
  await salva(post, { status: 'rascunho' })
  return nova
}

// ---------- publicar ----------
async function linkPublico(m: Midia) {
  const u = m.url || (await db.link(m.caminho, 3 * 86400))
  if (metaReal() && !/^https:\/\//.test(u || '')) throw new Error('a mídia precisa de um link público https (' + (m.caminho || m.url) + ')')
  return u!
}

// espera o container ficar pronto (FINISHED). Devolve o status do último olhar.
async function aguarda(id: string, token: string, vezes = 12) {
  for (let i = 0; i < vezes; i++) {
    const j = await graph('GET', id, token, { fields: 'status_code,status' })
    if (j.status_code !== 'IN_PROGRESS') return { status: String(j.status_code), detalhe: j.status }
    if (i < vezes - 1) await espera(ESPERA_MS())
  }
  return { status: 'IN_PROGRESS' }
}

// Instagram. Se o vídeo ainda está processando, guarda os containers e a próxima rodada continua dali.
async function publicaInstagram(neg: any, post: any, legenda: string): Promise<{ ig: any; pronto: boolean }> {
  const ig = { ...(post.detalhe.ig || {}) }
  if (ig.media_id) return { ig, pronto: true }
  if (!metaReal()) return { ig: { media_id: sim('ig_media'), container: sim('ig_container'), simulado: true }, pronto: true }
  const token = await tokenPagina(neg)
  const igId = await igDe(neg, token)
  const { tipo, midias } = post.detalhe
  if (!ig.container) {
    if (tipo === 'carrossel') {
      if (!ig.filhos?.length) {
        ig.filhos = []
        for (const m of midias) {
          const u = await linkPublico(m)
          const c = await graph('POST', `${igId}/media`, token, m.tipo === 'video' ? { media_type: 'VIDEO', video_url: u, is_carousel_item: 'true' } : { image_url: u, is_carousel_item: 'true' })
          ig.filhos.push(c.id)
        }
      }
      for (const f of ig.filhos) {
        const s = await aguarda(f, token)
        if (s.status === 'IN_PROGRESS') return { ig, pronto: false }
        if (s.status !== 'FINISHED') throw Object.assign(new Error(`Instagram recusou um item do carrossel (${s.status}${s.detalhe ? ': ' + s.detalhe : ''})`), { ig: { ...ig, filhos: [] } })
      }
      ig.container = (await graph('POST', `${igId}/media`, token, { media_type: 'CAROUSEL', children: ig.filhos.join(','), caption: legenda })).id
    } else if (tipo === 'reels') {
      ig.container = (await graph('POST', `${igId}/media`, token, { media_type: 'REELS', video_url: await linkPublico(midias[0]), caption: legenda, share_to_feed: 'true' })).id
    } else {
      ig.container = (await graph('POST', `${igId}/media`, token, { image_url: await linkPublico(midias[0]), caption: legenda })).id
    }
    ig.criado_em = new Date().toISOString()
  }
  const s = await aguarda(ig.container, token)
  if (s.status === 'IN_PROGRESS') return { ig, pronto: false }
  // venceu (24 h) ou deu erro: limpa pra criar de novo na próxima tentativa
  if (s.status !== 'FINISHED' && s.status !== 'PUBLISHED') throw Object.assign(new Error(`Instagram não processou a mídia (${s.status}${s.detalhe ? ': ' + s.detalhe : ''})`), { ig: { ...ig, container: null, filhos: [] } })
  // o limite de posts por 24 h
  const lim = await graph('GET', `${igId}/content_publishing_limit`, token, { fields: 'quota_usage,config' }).catch(() => null)
  const uso = lim?.data?.[0]
  if (uso && uso.config?.quota_total && uso.quota_usage >= uso.config.quota_total) throw Object.assign(new Error(`limite de posts do Instagram nas últimas 24 h (${uso.quota_usage}/${uso.config.quota_total})`), { ig, limite: true })
  ig.media_id = (await graph('POST', `${igId}/media_publish`, token, { creation_id: ig.container })).id
  const pl = await graph('GET', ig.media_id, token, { fields: 'permalink' }).catch(() => null)
  ig.permalink = pl?.permalink || null
  return { ig, pronto: true }
}

// Facebook (página)
async function publicaFacebook(neg: any, post: any, legenda: string) {
  const fb = { ...(post.detalhe.fb || {}) }
  if (fb.post_id || fb.video_id) return fb
  if (!metaReal()) return { post_id: sim('fb_post'), simulado: true }
  const token = await tokenPagina(neg)
  const pagina = String(neg.meta.page_id)
  const { tipo, midias } = post.detalhe
  if (tipo === 'reels') {
    const v = await graph('POST', `${pagina}/videos`, token, { file_url: await linkPublico(midias[0]), description: legenda })
    return { video_id: v.id, post_id: v.post_id || null }
  }
  if (tipo === 'carrossel') {
    // no Facebook o carrossel é um post com várias fotos (as fotos sobem sem publicar e entram juntas). Vídeo no meio fica de fora.
    const ids: string[] = []
    for (const m of midias.filter((x: Midia) => x.tipo !== 'video')) ids.push((await graph('POST', `${pagina}/photos`, token, { url: await linkPublico(m), published: 'false' })).id)
    const p = await graph('POST', `${pagina}/feed`, token, { message: legenda, attached_media: ids.map(id => ({ media_fbid: id })) })
    return { post_id: p.id, fotos: ids }
  }
  const f = await graph('POST', `${pagina}/photos`, token, { url: await linkPublico(midias[0]), message: legenda })
  return { photo_id: f.id, post_id: f.post_id || f.id }
}

export async function publica(post_id: string | number, opc: { forcar?: boolean; por?: string } = {}) {
  let post = await sincroniza(await umPost(post_id))
  if (!post) throw new Error('post não existe')
  const peca = await db.um('pecas', { id: post.detalhe.peca_id })
  if (!prontoPraPublicar(peca)) throw new Error('o post não tem os dois 👍 (equipe e dono)')
  const st = post.detalhe.status
  if (st === 'publicado' || st === 'descartado') return post
  // trava contra publicar duas vezes (a rotina e o botão ao mesmo tempo)
  if (st === 'publicando' && Date.now() - Date.parse(post.detalhe.atualizado_em || 0) < 10 * 60e3) return post
  if (st === 'erro' && !opc.forcar) return post
  if (!opc.forcar && post.detalhe.quando > new Date().toISOString()) throw new Error('ainda não é a hora desse post (' + quandoTxt(post.detalhe.quando) + ')')
  const neg = await db.um('negocios', { id: post.negocio_id })
  post = await salva(post, { status: 'publicando', tentativas: (post.detalhe.tentativas || 0) + 1 })
  const legenda = legendaDe(peca)
  let ig = post.detalhe.ig || {}, fb = post.detalhe.fb || {}, falta = false, limite = ''
  const erros: string[] = []
  if (post.detalhe.redes.includes('instagram')) {
    try { const r = await publicaInstagram(neg, post, legenda); ig = r.ig; falta = !r.pronto } catch (e: any) { if (e.ig) ig = e.ig; if (e.limite) { falta = true; limite = e.message } else erros.push('Instagram: ' + e.message) }
  }
  if (post.detalhe.redes.includes('facebook')) {
    try { fb = await publicaFacebook(neg, post, legenda) } catch (e: any) { erros.push('Facebook: ' + e.message) }
  }
  // bateu no limite de 24 h do Instagram: não é erro, fica processando e a próxima rodada tenta de novo
  if (limite && !erros.length) return salva(post, { status: 'processando', ig, fb, erro: limite })
  if (erros.length) {
    post = await salva(post, { status: 'erro', ig, fb, erro: erros.join(' · ') })
    await avisaEquipe('post não saiu', `${neg?.nome}: ${erros.join(' · ').slice(0, 180)}`, post.negocio_id, true)
    return post
  }
  if (falta) return salva(post, { status: 'processando', ig, fb, erro: null })
  post = await salva(post, { status: 'publicado', ig, fb, erro: null, publicado_em: new Date().toISOString(), publicado_por: opc.por || 'rotina' })
  await db.atualiza('pecas', { id: peca!.id }, { status: 'no_ar' })
  await db.evento('social_publicado', post.negocio_id, { post: post.id, ig: ig.media_id || null, fb: fb.post_id || null, simulado: !metaReal() })
  return post
}

// a rotina: publica o que venceu (agendado e com a hora passada) e continua o que estava processando
export async function publicaVencidos() {
  const agora = new Date().toISOString(), feitos: any[] = []
  for (let p of await posts()) {
    if (!ABERTOS.includes(p.detalhe?.status)) continue
    p = await sincroniza(p)
    if (!['agendado', 'processando', 'publicando'].includes(p.detalhe.status) || p.detalhe.quando > agora) continue
    try { const r = await publica(p.id); feitos.push({ post: p.id, status: r.detalhe.status, erro: r.detalhe.erro || undefined }) } catch (e: any) { feitos.push({ post: p.id, erro: e.message }) }
  }
  return feitos
}

// ---------- resultados ----------
const METRICAS_IG: Record<string, string[]> = {
  foto: ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits'],
  carrossel: ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits'],
  reels: ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time'],
}
const METRICAS_FB = ['post_media_view', 'post_total_media_view_unique', 'post_reactions_by_type_total', 'post_clicks']
const valorDe = (m: any) => { const v = m?.total_value?.value ?? m?.values?.[0]?.value; return typeof v === 'object' && v ? Object.values(v).reduce((s: number, x: any) => s + (Number(x) || 0), 0) : Number(v ?? 0) }
// pede todas juntas; se a Meta recusar uma (métrica que não vale pra aquele post), pede uma por uma e fica com as que vierem
async function insights(id: string, token: string, metricas: string[], extra: Record<string, string> = {}) {
  const pede = async (ms: string[]) => { const j = await graph('GET', `${id}/insights`, token, { metric: ms.join(','), ...extra }); const o: Record<string, number> = {}; for (const m of j.data || []) o[m.name] = valorDe(m); return o }
  try { return await pede(metricas) } catch {
    const o: Record<string, number> = {}
    for (const m of metricas) { try { Object.assign(o, await pede([m])) } catch { /* essa não vale pra esse post */ } }
    return o
  }
}
const simulaMetricas = (tipo: string) => { const n = (a: number) => Math.round(a * (0.5 + Math.random())); const reach = n(tipo === 'reels' ? 900 : 400); return { views: n(reach * 1.6), reach, likes: n(reach * 0.06), comments: n(reach * 0.01), saved: n(reach * 0.015), shares: n(reach * 0.01), total_interactions: n(reach * 0.09), ...(tipo === 'reels' ? {} : { follows: n(3) }) } }

export async function leResultados(opc: { negocio_id?: string | null } = {}) {
  const desde = new Date(Date.now() - 30 * 86400e3).toISOString(), dia = isoBR(new Date()), feitos: any[] = []
  for (const post of await posts(opc.negocio_id)) {
    const d = post.detalhe || {}
    if (d.status !== 'publicado' || !d.publicado_em || d.publicado_em < desde) continue
    const neg = await db.um('negocios', { id: post.negocio_id })
    const r: any = { dia }
    try {
      if (d.ig?.media_id) r.ig = !metaReal() || d.ig.simulado ? simulaMetricas(d.tipo) : await insights(d.ig.media_id, await tokenPagina(neg), METRICAS_IG[d.tipo] || METRICAS_IG.foto)
      if (d.fb?.post_id || d.fb?.video_id) {
        if (!metaReal() || d.fb.simulado) r.fb = { post_media_view: Math.round(Math.random() * 500), post_total_media_view_unique: Math.round(Math.random() * 300), post_reactions_by_type_total: Math.round(Math.random() * 20) }
        else {
          const token = await tokenPagina(neg)
          let pid = d.fb.post_id
          if (!pid && d.fb.video_id) { pid = (await graph('GET', d.fb.video_id, token, { fields: 'post_id' }).catch(() => null))?.post_id || null; if (pid) await salva(post, { fb: { ...d.fb, post_id: pid } }) }
          if (pid) {
            r.fb = await insights(pid, token, METRICAS_FB, { period: 'lifetime' })
            const c = await graph('GET', pid, token, { fields: 'shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)' }).catch(() => null)
            if (c) Object.assign(r.fb, { comentarios: c.comments?.summary?.total_count ?? 0, reacoes: c.reactions?.summary?.total_count ?? 0, compartilhamentos: c.shares?.count ?? 0 })
          }
        }
      }
    } catch (e: any) { r.erro = String(e.message).slice(0, 200) }
    // um retrato por post por dia (rodou de novo no mesmo dia: atualiza)
    const ja = (await db.lista('eventos', { negocio_id: post.negocio_id, tipo: 'social_resultado' })).find(e => e.detalhe?.post === post.id && e.detalhe?.dia === dia)
    const det = { post: post.id, peca_id: d.peca_id, ...r }
    if (ja) await db.atualiza('eventos', { id: ja.id }, { detalhe: det }); else await db.insere('eventos', { negocio_id: post.negocio_id, tipo: 'social_resultado', detalhe: det })
    if (!r.erro) await salva(post, { resultado: r })
    feitos.push({ post: post.id, ig: !!r.ig, fb: !!r.fb, erro: r.erro })
  }
  return feitos
}

// ---------- análise do mês ----------
const faixa = (iso: string) => { const h = horaBR(new Date(iso)); return h < 12 ? 'manhã (até 12h)' : h < 18 ? 'tarde (12h-18h)' : 'noite (18h+)' }
const mesAnterior = (d = new Date()) => { const [a, m] = isoBR(d).split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}` }

export function agrega(lista: any[]) {
  const grupos: Record<string, Record<string, any>> = { tema: {}, formato: {}, tipo: {}, horario: {} }
  for (const p of lista) {
    const ig = p.detalhe.resultado?.ig || {}, fb = p.detalhe.resultado?.fb || {}
    const alc = (ig.reach || 0) + (fb.post_total_media_view_unique || 0)
    const inter = (ig.total_interactions || 0) + (fb.reacoes || fb.post_reactions_by_type_total || 0) + (fb.comentarios || 0) + (fb.compartilhamentos || 0)
    const chaves: Record<string, string> = { tema: p.detalhe.tema || 'sem tema', formato: p.detalhe.formato || p.detalhe.tipo, tipo: p.detalhe.tipo, horario: faixa(p.detalhe.publicado_em || p.detalhe.quando) }
    for (const [g, k] of Object.entries(chaves)) {
      const o = (grupos[g][k] ||= { posts: 0, alcance: 0, interacoes: 0, salvos: 0, compartilhamentos: 0, seguidores: 0, views: 0 })
      o.posts++; o.alcance += alc; o.interacoes += inter; o.salvos += ig.saved || 0; o.compartilhamentos += (ig.shares || 0) + (fb.compartilhamentos || 0); o.seguidores += ig.follows || 0; o.views += (ig.views || 0) + (fb.post_media_view || 0)
    }
  }
  for (const g of Object.values(grupos)) for (const o of Object.values(g)) { o.alcance_medio = Math.round(o.alcance / o.posts); o.taxa_interacao = o.alcance ? Math.round(o.interacoes / o.alcance * 1000) / 10 : null }
  return grupos
}

const jsonDe = (t: string) => { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)) }

export async function analiseDoMes(negocio_id: string, opc: { mes?: string; forcar?: boolean } = {}) {
  const mes = opc.mes || mesAnterior()
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  const ja = (await db.lista('eventos', { negocio_id, tipo: 'social_analise' })).find(e => e.detalhe?.mes === mes)
  if (ja && !opc.forcar) return { pulou: 'já feita', peca_id: ja.detalhe.peca_id }
  const doMes = (await posts(negocio_id)).filter(p => p.detalhe?.status === 'publicado' && isoBR(new Date(p.detalhe.publicado_em)).slice(0, 7) === mes)
  if (!doMes.length) return { pulou: 'nenhum post publicado em ' + mes }
  const ag = agrega(doMes)
  const lista = doMes.map(p => ({ dia: isoBR(new Date(p.detalhe.publicado_em)), hora: horaBR(new Date(p.detalhe.publicado_em)), tipo: p.detalhe.tipo, tema: p.detalhe.tema, formato: p.detalhe.formato, objetivo: p.detalhe.objetivo, ig: p.detalhe.resultado?.ig || null, fb: p.detalhe.resultado?.fb || null }))
  const r = await comFerramentas(`${JEITO}\nAgora tu és a analista de social media do negócio. Lê os números dos posts do mês e escreve pro dono, no WhatsApp, curto e direto. Só usa os números que vieram; não inventa nenhum.`,
    `NEGÓCIO: ${neg.nome} (${neg.nicho || ''}, ${neg.cidade || ''}). O QUE A MAIA SABE: ${JSON.stringify(neg.contexto || {})}
MÊS: ${mes} · ${doMes.length} posts publicados
POR TEMA, FORMATO, TIPO E HORÁRIO (somas e médias): ${JSON.stringify(ag)}
CADA POST: ${JSON.stringify(lista).slice(0, 12000)}

Compara por tema, formato e horário (alcance médio, taxa de interação, salvos e compartilhamentos valem mais que curtida). Com poucos posts num grupo, fala que é sinal, não certeza.
Devolve SÓ o JSON: {"resumo":"2 a 3 frases","repetir":["..."],"testar":["..."],"parar":["..."],"plano":[{"semana":1,"dia":"terça","horario":"18h","tipo":"foto|carrossel|reels","tema":"...","formato":"...","ideia":"uma frase"}]}
No máximo 3 itens em repetir, testar e parar. Plano do mês seguinte com 8 a 12 posts.`, [], 1,
    { modelo: process.env.MAIA_MODELO_ANALISE || 'claude-opus-5-5', uso: { tipo: 'social_analise', negocio_id } })
  let a: any
  try { a = jsonDe(r.texto) } catch { throw new Error('a IA não devolveu a análise no formato certo') }
  const l = (t: string, xs: string[]) => (xs?.length ? `${t}: ${xs.join('; ')}.` : '')
  const plano = (a.plano || []).map((p: any) => `· semana ${p.semana}, ${p.dia} ${p.horario}: ${p.tipo} sobre ${p.tema} (${p.ideia})`).join('\n')
  const texto = [a.resumo, l('Repetir', a.repetir), l('Testar', a.testar), l('Parar', a.parar), plano ? `Rascunho do plano do mês que vem:\n${plano}` : ''].filter(Boolean).join('\n\n')
  const peca = await db.insere('pecas', { negocio_id, tipo: 'relatorio', status: 'revisao_equipe', titulo: `Social media ${mes}`, texto })
  await db.evento('social_analise', negocio_id, { mes, peca_id: peca.id, posts: doMes.length, agregados: ag, analise: a })
  await avisaEquipe('análise de social pra aprovar', `${neg.nome}: ${mes}`, negocio_id)
  return { peca_id: peca.id, texto }
}

// ---------- o link do perfil ----------
const sem = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export const TEXTO_LINK: Record<Rede, string> = { instagram: 'Vim pelo Instagram', facebook: 'Vim pelo Facebook' }
// a 1ª mensagem com o texto pronto do link marca a origem do lead
export function origemDoTexto(texto: string): 'instagram' | 'facebook' | null {
  const t = sem(texto)
  if (/\bvim (pelo|do|pelo perfil do) (insta|instagram)\b/.test(t)) return 'instagram'
  if (/\bvim (pelo|do|pela pagina do) (face|facebook)\b/.test(t)) return 'facebook'
  return null
}
export async function linkDoPerfil(negocio_id: string, rede: Rede = 'instagram') {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  let numero = String(neg.meta?.wa?.numero || neg.contexto?.whatsapp || '').replace(/\D/g, '')
  if (!numero && metaReal() && neg.wa_phone_id && tokenWa(neg)) {
    const j = await graph('GET', String(neg.wa_phone_id), tokenWa(neg), { fields: 'display_phone_number' }).catch(() => null)
    numero = String(j?.display_phone_number || '').replace(/\D/g, '')
    if (numero) await db.atualiza('negocios', { id: neg.id }, { meta: { ...(neg.meta || {}), wa: { ...(neg.meta?.wa || {}), numero } } })
  }
  if (!numero) throw new Error('falta o número do WhatsApp do negócio (conecta o WhatsApp ou preenche meta.wa.numero)')
  return { link: `https://wa.me/${numero}?text=${encodeURIComponent(TEXTO_LINK[rede])}`, texto: TEXTO_LINK[rede], numero }
}

// ---------- a rotina (de hora em hora; só com MAIA_SOCIAL_LIGADO=1) ----------
export async function rotinaSocial(opc: { forcar?: boolean } = {}) {
  if (!socialLigado()) return { pulou: 'MAIA_SOCIAL_LIGADO desligado' }
  const r: any = {}
  try { r.publicados = await publicaVencidos() } catch (e: any) { r.publicar_erro = e.message }
  const h = horaBR()
  try { if (h === 7 || opc.forcar) r.resultados = await leResultados() } catch (e: any) { r.resultados_erro = e.message }
  try {
    if ((isoBR(new Date()).slice(8, 10) === '01' && h === 9) || opc.forcar) {
      r.analises = []
      const negs = new Set((await posts()).filter(p => p.detalhe?.status === 'publicado').map(p => p.negocio_id))
      for (const id of negs) { try { r.analises.push({ negocio: id, ...(await analiseDoMes(id)) }) } catch (e: any) { r.analises.push({ negocio: id, erro: e.message }) } }
    }
  } catch (e: any) { r.analises_erro = e.message }
  return r
}

// o que o painel mostra
export async function agenda(negocio_id: string) {
  const lista = await Promise.all((await posts(negocio_id)).map(p => sincroniza(p)))
  const pecas = await db.lista('pecas', { negocio_id })
  return lista.map(p => { const pc = pecas.find(x => x.id === p.detalhe.peca_id); return { id: p.id, ...p.detalhe, legenda: legendaDe(pc), peca_status: pc?.status || null } })
}
export async function resultados(negocio_id: string) {
  return (await db.lista('eventos', { negocio_id, tipo: 'social_resultado' }, { ordem: 'criado_em', desc: true })).map(e => ({ id: e.id, em: e.criado_em, ...e.detalhe }))
}
export async function analises(negocio_id: string) {
  const evs = await db.lista('eventos', { negocio_id, tipo: 'social_analise' }, { ordem: 'criado_em', desc: true })
  return Promise.all(evs.map(async e => ({ id: e.id, mes: e.detalhe.mes, posts: e.detalhe.posts, analise: e.detalhe.analise, peca: await db.um('pecas', { id: e.detalhe.peca_id }) })))
}
