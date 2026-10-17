// Oito Posts: "Postar por mim" (14/10). O cliente liga o Instagram dele (Instagram API com login do Instagram, sem página do Facebook)
// e os posts do mês saem sozinhos no dia sugerido, no horário padrão do nicho. Nunca vemos a senha: só um token de 60 dias, renovado aqui.
// Sem OITO_IG_APP_ID tudo continua funcionando: o cartão diz "em breve" e as rotas devolvem 503.
import crypto from 'node:crypto'
import { oitoDb as db } from './db'
import { oitoConfig as cfg, Marca, nichoDe, emEspanhol, PAISES_ES } from './config'

export const IG_VERSAO = process.env.OITO_IG_VERSAO || 'v25.0'
export const IG_GRAPH = 'https://graph.instagram.com'
export const IG_ESCOPOS = 'instagram_business_basic,instagram_business_content_publish'
export const igAppId = () => process.env.OITO_IG_APP_ID || ''
const igSegredo = () => process.env.OITO_IG_APP_SECRET || ''
export const igDisponivel = () => !!igAppId() && !!igSegredo()
// a volta é sempre pelo endereço da Vercel (é o que fica cadastrado no app da Meta); as marcas mandam pra lá
export const igRetorno = () => process.env.OITO_IG_REDIRECT || 'https://carreiranodigital.vercel.app/api/oito/instagram/retorno'

// ---------- o "state" assinado: leva código e marca até a volta, e expira em 30 min ----------
const chaveState = () => igSegredo() || (process.env.RECADO_PAINEL_SENHA || '').replace(/^"|"$/g, '')
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const assina = (corpo: string) => crypto.createHmac('sha256', chaveState()).update(corpo).digest('base64url')
export function criaState(codigo: string, marca: string) {
  const corpo = b64(JSON.stringify({ c: codigo, m: marca, t: Date.now(), n: crypto.randomBytes(6).toString('hex') }))
  return corpo + '.' + assina(corpo)
}
export function leState(s: string | null): { c: string; m: Marca } | null {
  if (!s || !chaveState()) return null
  const [corpo, sig] = s.split('.')
  if (!corpo || !sig) return null
  const certo = assina(corpo)
  if (sig.length !== certo.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(certo))) return null
  try {
    const j = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
    if (!j.c || !j.m || Date.now() - j.t > 30 * 60e3) return null
    return { c: j.c, m: j.m }
  } catch { return null }
}

// ---------- fuso e horário ----------
// BR: São Paulo; espanhol: o fuso do país do cliente (PAISES_ES; horário de verão o Intl resolve), sem país = Bogotá
export const fusoDe = (c: any) => !emEspanhol(c.marca) ? 'America/Sao_Paulo' : c.fuso || PAISES_ES[c.pais]?.fuso || 'America/Bogota'
export const horaPadrao = (m: Marca) => ({ salao: '10:00', prato: '11:00', pata: '10:00' } as const)[nichoDe(m)]

function partes(ms: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  return p as Record<string, string>
}
const desvio = (ms: number, tz: string) => { const p = partes(ms, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000 }
// "2026-10-20" + "10:00" no fuso → instante UTC (confere o desvio duas vezes por causa da troca de horário)
export function instante(data: string, hora: string, tz: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data).slice(0, 10)), h = /^(\d{1,2}):(\d{2})$/.exec(hora)
  if (!d || !h) return null
  const ingenuo = Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2])
  let ms = ingenuo - desvio(ingenuo, tz)
  ms = ingenuo - desvio(ms, tz)
  return new Date(ms)
}
// instante → "2026-10-20T10:00" no fuso (pros campos de data e hora da página)
export function local(iso: string | null | undefined, tz: string) {
  if (!iso) return null
  const p = partes(new Date(iso).getTime(), tz)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// ---------- agenda ----------
// quando liga (ou religa): os posts ainda não publicados ganham data no horário padrão; data que já passou fica de fora.
// Agendamento antigo que venceu enquanto estava desligado também sai (nunca publica atrasado sem o cliente pedir).
export async function agendaCliente(c: any, ig: any) {
  const tz = fusoDe(c), agora = Date.now()
  const [posts, lotes] = await Promise.all([db.lista('posts', { cliente_id: c.id }), db.lista('lotes', { cliente_id: c.id })])
  const teste = new Set(lotes.filter(l => l.tipo === 'teste').map(l => l.id))
  let n = 0
  for (const p of posts) {
    if (p.publicado_em || p.status === 'substituido' || teste.has(p.lote_id)) continue
    if (p.publicar_em && new Date(p.publicar_em).getTime() > agora) continue
    const q = p.data_sugerida ? instante(p.data_sugerida, ig.hora_padrao || horaPadrao(c.marca), tz) : null
    const novo = q && q.getTime() > agora + 5 * 60e3 ? q.toISOString() : null
    if (novo !== (p.publicar_em || null)) await db.atualiza('posts', { id: p.id }, { publicar_em: novo })
    if (novo) n++
  }
  return n
}

// post novo que o gerador entregou: agenda se o cliente está com o Instagram ligado. Ajuste herda a data do post que substituiu.
export async function agendaPostNovo(c: any, post: any, lote: any) {
  if (lote.tipo === 'teste' || c.status !== 'ativo') return
  const ig = await db.um('instagram', { cliente_id: c.id }).catch(() => null)
  if (!ig?.ligado) return
  let quando: number | null = null, pular = false
  if (lote.tipo === 'ajuste') {
    const velho = await db.um('posts', { id: lote.mes })
    if (!velho || velho.publicado_em) return
    pular = !!velho.nao_publicar
    // o ajuste atrasou e a hora passou: sai em 15 min (o cliente já esperava esse post)
    if (velho.publicar_em) quando = Math.max(new Date(velho.publicar_em).getTime(), Date.now() + 15 * 60e3)
  }
  if (quando == null && post.data_sugerida) {
    const q = instante(post.data_sugerida, ig.hora_padrao || horaPadrao(c.marca), fusoDe(c))
    if (q && q.getTime() > Date.now() + 5 * 60e3) quando = q.getTime()
  }
  if (quando || pular) await db.atualiza('posts', { id: post.id }, { publicar_em: quando ? new Date(quando).toISOString() : null, nao_publicar: pular })
}

// o que a página do cliente vê (nunca o token)
export async function vistaInstagram(c: any) {
  const ig = await db.um('instagram', { cliente_id: c.id }).catch(() => null)
  return { disponivel: igDisponivel(), ligado: !!ig?.ligado, usuario: ig?.usuario || null, erro: ig?.ligado ? null : ig?.erro || null, hora_padrao: ig?.hora_padrao || horaPadrao(c.marca), fuso: fusoDe(c) }
}

// ---------- chamadas à Meta ----------
async function igFetch(url: string, opts: any = {}) {
  const r = await fetch(url, { ...opts, cache: 'no-store', signal: AbortSignal.timeout(20000) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || j.error || j.error_type) {
    const e: any = new Error(j.error?.message || j.error_message || `instagram ${r.status}`)
    e.code = j.error?.code ?? j.code; e.sub = j.error?.error_subcode; e.tipo = j.error?.type || j.error_type
    throw e
  }
  return j
}
export const erroDeToken = (e: any) => e?.code === 190 || e?.tipo === 'OAuthException' && /token|session/i.test(e?.message || '')

export function urlAutorizar(codigo: string, marca: string) {
  const p = new URLSearchParams({ client_id: igAppId(), redirect_uri: igRetorno(), response_type: 'code', scope: IG_ESCOPOS, state: criaState(codigo, marca), enable_fb_login: 'false' })
  return 'https://www.instagram.com/oauth/authorize?' + p
}

// código da volta → token curto → token de 60 dias → quem é a conta
export async function trocaCodigo(code: string) {
  const f = new URLSearchParams({ client_id: igAppId(), client_secret: igSegredo(), grant_type: 'authorization_code', redirect_uri: igRetorno(), code: code.replace(/#_$/, '') })
  // 14/10: cada passo marcado no erro (a 1ª conexão real falhou com "Unsupported request - method type: get" sem dizer onde)
  const passo = async (nome: string, fn: () => Promise<any>) => { try { return await fn() } catch (e: any) { e.message = `[${nome}] ${e.message}`; throw e } }
  const j = await passo('codigo', () => igFetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: f }))
  const curto = j.access_token || j.data?.[0]?.access_token
  if (!curto) throw new Error('[codigo] sem token curto: ' + JSON.stringify(j).slice(0, 120))
  // token de 60 dias: o endereço sem versão e, se recusar, com a versão
  const q = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: igSegredo(), access_token: curto })
  const longo = await passo('60dias', () => igFetch(`${IG_GRAPH}/access_token?` + q).catch(() => igFetch(`${IG_GRAPH}/${IG_VERSAO}/access_token?` + q)))
  const me = await passo('conta', () => igFetch(`${IG_GRAPH}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(longo.access_token)}`))
  return { token: longo.access_token as string, expira_em: new Date(Date.now() + (+longo.expires_in || 60 * 86400) * 1000).toISOString(), ig_user_id: String(me.user_id || me.id), usuario: me.username as string, tipo: me.account_type as string }
}

export async function renovaToken(token: string) {
  const j = await igFetch(`${IG_GRAPH}/refresh_access_token?` + new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token }))
  return { token: j.access_token as string, expira_em: new Date(Date.now() + (+j.expires_in || 60 * 86400) * 1000).toISOString() }
}

// legenda dentro das regras do Instagram: até 2200 caracteres e 30 hashtags
export function legendaIG(s: string | null | undefined) {
  let n = 0
  const t = String(s || '').replace(/#[\p{L}\p{N}_]+/gu, h => (++n > 30 ? '' : h)).replace(/[ \t]+\n/g, '\n').trim()
  return t.length > 2200 ? t.slice(0, 2199).replace(/\s+\S*$/, '') + '…' : t
}

// um post: container → espera ficar pronto → publica. Devolve o id da mídia.
export async function publicaImagem(ig: any, imageUrl: string, legenda: string) {
  const base = `${IG_GRAPH}/${IG_VERSAO}/${ig.ig_user_id || 'me'}`, auth = { Authorization: 'Bearer ' + ig.token }
  const cont = await igFetch(`${base}/media`, { method: 'POST', headers: auth, body: new URLSearchParams({ image_url: imageUrl, caption: legenda }) })
  for (let i = 0; i < 8; i++) {
    const s = await igFetch(`${IG_GRAPH}/${IG_VERSAO}/${cont.id}?fields=status_code`, { headers: auth })
    if (s.status_code === 'FINISHED') break
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('container ' + s.status_code)
    await new Promise(r => setTimeout(r, 1500))
  }
  const pub = await igFetch(`${base}/media_publish`, { method: 'POST', headers: auth, body: new URLSearchParams({ creation_id: cont.id }) })
  return String(pub.id)
}

// e-mail quando a ligação caiu (senha trocada, acesso removido, token vencido)
export async function avisaReconectar(c: any) {
  if (c.exemplo) return
  const { enviaEmailOito, molduraOito } = await import('./email')
  const m = c.marca as Marca, url = cfg.url(m, `conta.html?c=${c.codigo}`), es = emEspanhol(m)
  const nome = String(c.nome_negocio || '').replace(/[&<>"]/g, '')
  return es
    ? enviaEmailOito(m, c.email, 'Tu Instagram se desconectó', molduraOito(m, 'Necesitamos que vuelvas a conectar tu Instagram',
      `<p>Los posts de <b>${nome}</b> ya no se pueden publicar solos: Instagram cortó la conexión (pasa cuando cambias la contraseña o quitas el acceso).</p><p>Vuelve a conectar en tu área: toma un minuto. Mientras tanto, los posts siguen allí para descargar y publicar a mano.</p>`,
      { texto: 'Volver a conectar', url }))
    : enviaEmailOito(m, c.email, 'Seu Instagram desconectou', molduraOito(m, 'Precisamos que você conecte o Instagram de novo',
      `<p>Os posts do <b>${nome}</b> não conseguem mais sair sozinhos: o Instagram cortou a ligação (acontece quando você troca a senha ou tira o acesso).</p><p>Conecte de novo na sua área, leva um minuto. Enquanto isso, os posts continuam lá pra baixar e postar na mão.</p>`,
      { texto: 'Conectar de novo', url }))
}
