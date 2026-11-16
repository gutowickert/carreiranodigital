// Maia: o dono conecta o INSTAGRAM e a PÁGINA do Facebook do negócio (16/11, Janela da Maia). Mesmo link assinado do
// WhatsApp (/maia/conectar?n=...&t=..., gerado na aba Dados do painel): na mesma página, um segundo botão abre o Login do
// Facebook para Empresas com a configuração do social (MAIA_META_CONFIG_SOCIAL: páginas + Instagram). Daí:
//   GET  ?n&t                → se o botão aparece (configuração existe) e se o negócio já tem página/Instagram
//   POST {n, t, code}        → troca o code pela chave do dono, alonga (60 dias), lista as páginas dele com o Instagram ligado.
//                              Uma página só: guarda na hora. Várias: devolve a lista (sem chave nenhuma) pro dono escolher
//   POST {n, t, page_id}     → a escolha (vale 30 min depois do login)
// O que fica guardado é a chave DA PÁGINA (não expira e publica no Facebook e no Instagram ligado), cifrada, pelo mesmo
// salvaLigacao da aba Social. Nenhuma chave volta pro navegador. É o caminho que a Meta quer ver nos vídeos da análise do app.
import { maiaDb as db } from '@/lib/maia/db'
import { avisaEquipe } from '@/lib/maia/canal'
import { linkOk } from '@/lib/maia/conectar'
import { cifra, decifra } from '@/lib/maia/segredo'
import { salvaLigacao } from '@/lib/maia/social'

const GRAPH = 'https://graph.facebook.com/v25.0'
const APP_ID = () => process.env.MAIA_META_APP_ID || '2069913353660247'
const CONFIG_SOCIAL = () => process.env.MAIA_META_CONFIG_SOCIAL || ''
const APP_SECRET = () => process.env.MAIA_META_APP_SECRET || process.env.META_APP_SECRET || ''
const ESCOLHA_MS = 30 * 60e3
const invalido = () => Response.json({ ok: false, erro: 'Esse link venceu ou não é válido. Pede um novo pra equipe da Maia.' }, { status: 403 })
const json = (u: string) => fetch(u).then(r => r.json()).catch(() => null)

type Pagina = { id: string; name: string; access_token: string; ig_id: string | null; ig_user: string | null }

export async function GET(req: Request) {
  const u = new URL(req.url)
  const n = u.searchParams.get('n') || '', t = u.searchParams.get('t') || ''
  if (!linkOk(n, t)) return invalido()
  const neg = await db.um('negocios', { id: n })
  if (!neg) return Response.json({ ok: false, erro: 'negócio não encontrado' }, { status: 404 })
  return Response.json({ ok: true, app_id: APP_ID(), config_id: CONFIG_SOCIAL() || null, pagina: !!neg.meta?.page_id, instagram: !!neg.meta?.ig_id })
}

async function guarda(neg: any, p: Pagina) {
  await salvaLigacao(neg.id, { page_id: p.id, ig_id: p.ig_id || '', social_token: p.access_token }, 'dono (login do Facebook)')
  const atual = await db.um('negocios', { id: neg.id })
  const meta = { ...(atual?.meta || {}) }
  delete meta.social_pendente
  await db.atualiza('negocios', { id: neg.id }, { meta })
  await db.evento('social_conectado', neg.id, { page_id: p.id, ig_id: p.ig_id, ig_user: p.ig_user })
  await avisaEquipe('Instagram conectado', `${neg.nome}: página "${p.name}"${p.ig_user ? ` e Instagram @${p.ig_user}` : ' (SEM Instagram profissional ligado à página)'} conectados pelo dono.`, neg.id, true).catch(() => null)
  return { ok: true, pagina: p.name, instagram: p.ig_user ? '@' + p.ig_user : null, sem_instagram: !p.ig_id }
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  if (!linkOk(b.n, b.t)) return invalido()
  const neg = await db.um('negocios', { id: b.n })
  if (!neg) return Response.json({ ok: false, erro: 'negócio não encontrado' }, { status: 404 })

  // 2º passo: a escolha da página (quando o dono tem mais de uma)
  if (b.page_id) {
    const pid = String(b.page_id)
    const pend = neg.meta?.social_pendente
    if (!pend || Date.now() - Date.parse(pend.em || 0) > ESCOLHA_MS) return Response.json({ ok: false, erro: 'Passou muito tempo desde o login. Clica no botão de novo.' })
    let lista: Pagina[] = []
    try { lista = JSON.parse(decifra(pend.paginas) || '[]') } catch { lista = [] }
    const p = lista.find(x => x.id === pid)
    if (!p) return Response.json({ ok: false, erro: 'Essa página não está na lista. Clica no botão de novo.' }, { status: 400 })
    return Response.json(await guarda(neg, p))
  }

  // 1º passo: o code do login
  const code = String(b.code || '')
  if (!code) return Response.json({ ok: false, erro: 'o Facebook não devolveu a autorização. Tenta de novo.' })
  if (!APP_SECRET()) return Response.json({ ok: false, erro: 'falta o segredo do app no servidor (MAIA_META_APP_SECRET). Avisa a equipe.' })
  const cid = encodeURIComponent(APP_ID()), sec = encodeURIComponent(APP_SECRET())
  const curta: any = await json(`${GRAPH}/oauth/access_token?client_id=${cid}&client_secret=${sec}&code=${encodeURIComponent(code)}`)
  if (!curta?.access_token) return Response.json({ ok: false, erro: 'não consegui trocar a autorização pela chave: ' + String(curta?.error?.message || 'sem resposta').slice(0, 160) })
  // a chave do usuário vale ~1 h: alonga pra 60 dias (as chaves das páginas tiradas dela não expiram)
  const longa: any = await json(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${cid}&client_secret=${sec}&fb_exchange_token=${encodeURIComponent(curta.access_token)}`)
  const user = longa?.access_token || curta.access_token
  const contas: any = await json(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account%7Bid,username%7D&limit=100&access_token=${encodeURIComponent(user)}`)
  const paginas: Pagina[] = (contas?.data || []).filter((p: any) => /^\d{5,25}$/.test(String(p.id)) && p.access_token).map((p: any) => ({
    id: String(p.id), name: String(p.name || 'Página'), access_token: String(p.access_token),
    ig_id: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : null,
    ig_user: p.instagram_business_account?.username ? String(p.instagram_business_account.username) : null,
  }))
  if (!paginas.length) return Response.json({ ok: false, erro: 'Não achei nenhuma página do Facebook liberada no login. Clica de novo e marca a página do negócio (e o Instagram ligado a ela).' })
  if (paginas.length === 1) return Response.json(await guarda(neg, paginas[0]))
  // várias: guarda a lista cifrada por 30 min e devolve só nome e Instagram pro dono escolher
  await db.atualiza('negocios', { id: neg.id }, { meta: { ...(neg.meta || {}), social_pendente: { paginas: cifra(JSON.stringify(paginas)), em: new Date().toISOString() } } })
  return Response.json({ ok: true, escolher: paginas.map(p => ({ id: p.id, nome: p.name, instagram: p.ig_user ? '@' + p.ig_user : null })) })
}
