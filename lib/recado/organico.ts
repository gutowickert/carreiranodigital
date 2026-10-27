// Recado Encantado: o AGENDADOR DO ORGÂNICO (27/10). Publica sozinho no Instagram do Recado os posts do calendário do Acordo de Natal
// (lib/recado/organico-posts.ts, gerado do CALENDARIO.md por scripts/recado-organico.mjs), na data e hora de cada um.
//
// Como funciona (cada vez que /api/recado/publicar é chamada: pg_cron a cada 15 min + cron da Vercel às 19h de reserva):
//   1. lê o estado no banco (recado_organico e recado_ig, sql/09). Sem as tabelas = "esperando banco": não publica nada.
//   2. o token: RECADO_IG_TOKEN (Vercel) ou o renovado no banco. Renova sozinho quando faltar menos de 10 dias (dura 60).
//   3. pega o post mais antigo que já chegou na hora (no máximo 1 por vez) e publica: post único ou carrossel.
// Não publica: post "pulado" (já postei na mão), sem imagem (P13 em diante, até gerar), espaço de prova social (sempre na mão),
// post com hora antes de o agendador ser ligado, e post atrasado mais de 24 h (se o cron falhou um dia, não sai fora de hora).
// Erro ao montar: tenta de novo nas próximas voltas (até 3 vezes). Erro na hora de publicar: para e pede pra conferir no Instagram
// (pode ter saído; tentar de novo arriscaria post duplicado).
// Modo seco (seco: true): não grava nada e não chama o Instagram; devolve as chamadas que faria (token escondido).
import crypto from 'node:crypto'
import { POSTS_ORGANICO, type PostOrganico } from './organico-posts'
import { recadoConfig as cfg } from './config'

const VERSAO = () => process.env.RECADO_IG_VERSAO || 'v23.0'
const BASE = () => `https://graph.instagram.com/${VERSAO()}`
const ATRASO_MAX = 24 * 3600e3        // passou disso da hora marcada: não sai sozinho
const TRAVA = 20 * 60e3               // "publicando" há mais que isso: algo travou no meio
const RENOVA_ANTES = 10 * 86400e3     // renova o token quando faltar menos que isso
const TENTATIVAS = 3
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const dorme = (ms: number) => new Promise(r => setTimeout(r, ms))

export const urlImagem = (nome: string) => `${(process.env.RECADO_ORGANICO_URL || cfg.urlSite).replace(/\/$/, '')}/recado/organico/${encodeURIComponent(nome)}`
const impressao = (t: string) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 12)

// ---------- banco ----------
async function banco(caminho: string, opts: any = {}) {
  const r = await fetch(U() + '/rest/v1/' + caminho, { ...opts, headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', ...(opts.headers || {}) }, cache: 'no-store' })
  const t = await r.text()
  if (!r.ok) throw new Error(`banco ${r.status}: ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}
const grava = (tab: string, linha: any) => banco(tab, { method: 'POST', body: JSON.stringify(linha), headers: { Prefer: 'resolution=merge-duplicates,return=representation' } })
const atualiza = (tab: string, filtro: string, campos: any) => banco(`${tab}?${filtro}`, { method: 'PATCH', body: JSON.stringify({ ...campos, atualizado_em: new Date().toISOString() }), headers: { Prefer: 'return=representation' } })

type Estado = { banco: boolean; erroBanco?: string; linhas: Map<string, any>; ig: any | null }
async function leEstado(): Promise<Estado> {
  if (!U() || !K()) return { banco: false, erroBanco: 'sem Supabase', linhas: new Map(), ig: null }
  try {
    const [linhas, ig] = await Promise.all([banco('recado_organico?select=*'), banco('recado_ig?id=eq.1&select=*')])
    return { banco: true, linhas: new Map((linhas || []).map((l: any) => [l.id, l])), ig: ig?.[0] || null }
  } catch (e: any) { return { banco: false, erroBanco: String(e.message || e).slice(0, 160), linhas: new Map(), ig: null } }
}

// o token em uso: o do banco (renovado) enquanto ele veio do mesmo RECADO_IG_TOKEN que está na Vercel; se o Guto trocar o da Vercel, vale o novo
function tokenAtual(ig: any): { token: string | null; fonte: 'banco' | 'vercel' | null } {
  const env = (process.env.RECADO_IG_TOKEN || '').trim()
  if (ig?.token && (!env || ig.token_de === impressao(env))) return { token: ig.token, fonte: 'banco' }
  if (env) return { token: env, fonte: 'vercel' }
  return { token: null, fonte: null }
}

// ---------- Instagram ----------
async function ig(metodo: 'GET' | 'POST', caminho: string, params: Record<string, string>, token: string) {
  const q = new URLSearchParams({ ...params, access_token: token })
  const r = metodo === 'GET' ? await fetch(`${BASE()}/${caminho}?${q}`, { cache: 'no-store' })
    : await fetch(`${BASE()}/${caminho}`, { method: 'POST', body: q, cache: 'no-store' })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || j.error) throw new Error(`instagram ${r.status}: ${j.error?.message || 'sem resposta'}${j.error?.code ? ' (código ' + j.error.code + ')' : ''}`.slice(0, 300))
  return j
}
async function esperaPronto(id: string, token: string) {
  for (let i = 0; i < 10; i++) {
    const j = await ig('GET', id, { fields: 'status_code' }, token)
    if (j.status_code === 'FINISHED') return
    if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') throw new Error('o Instagram recusou a imagem (' + j.status_code + ')')
    await dorme(2500)
  }
  throw new Error('o Instagram demorou demais pra processar as imagens')
}

// as chamadas de um post, na ordem (o modo seco mostra exatamente isto)
export function chamadasDoPost(p: PostOrganico, userId = '{ig-user-id}') {
  const media = `${userId}/media`
  if (p.tipo === 'unico' || p.imagens.length === 1) return [
    { passo: 'criar', metodo: 'POST', url: `${BASE()}/${media}`, corpo: { image_url: urlImagem(p.imagens[0]), caption: p.legenda } },
    { passo: 'publicar', metodo: 'POST', url: `${BASE()}/${userId}/media_publish`, corpo: { creation_id: '{id da etapa criar}' } },
  ]
  return [
    ...p.imagens.map((f, i) => ({ passo: 'imagem ' + (i + 1), metodo: 'POST', url: `${BASE()}/${media}`, corpo: { image_url: urlImagem(f), is_carousel_item: 'true' } })),
    { passo: 'carrossel', metodo: 'POST', url: `${BASE()}/${media}`, corpo: { media_type: 'CAROUSEL', children: p.imagens.map((_, i) => `{id da imagem ${i + 1}}`).join(','), caption: p.legenda } },
    { passo: 'publicar', metodo: 'POST', url: `${BASE()}/${userId}/media_publish`, corpo: { creation_id: '{id da etapa carrossel}' } },
  ]
}

async function publica(p: PostOrganico, userId: string, token: string) {
  let criacao: string
  if (p.tipo === 'unico' || p.imagens.length === 1) {
    criacao = (await ig('POST', `${userId}/media`, { image_url: urlImagem(p.imagens[0]), caption: p.legenda }, token)).id
  } else {
    const filhos: string[] = []
    for (const f of p.imagens) filhos.push((await ig('POST', `${userId}/media`, { image_url: urlImagem(f), is_carousel_item: 'true' }, token)).id)
    for (const f of filhos) await esperaPronto(f, token)
    criacao = (await ig('POST', `${userId}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: p.legenda }, token)).id
  }
  await esperaPronto(criacao, token)
  let mediaId: string
  try { mediaId = (await ig('POST', `${userId}/media_publish`, { creation_id: criacao }, token)).id }
  catch (e: any) { e.naHoraDePublicar = true; throw e }
  const info = await ig('GET', mediaId, { fields: 'permalink' }, token).catch(() => ({}))
  return { mediaId, permalink: (info as any).permalink || null }
}

// ---------- situação de cada post ----------
export type Situacao = 'publicado' | 'pulado' | 'prova_social' | 'sem_imagem' | 'publicando' | 'erro' | 'esperando_banco' | 'falta_token' | 'passou' | 'na_hora' | 'agendado'
function situacao(p: PostOrganico, l: any, ctx: { banco: boolean; token: boolean; ligado: number | null; agora: number }): { s: Situacao; motivo?: string } {
  if (l?.status === 'publicado') return { s: 'publicado' }
  if (l?.pular) return { s: 'pulado' }
  if (p.provaSocial) return { s: 'prova_social', motivo: 'espaço de prova social: só na mão, com depoimento real (ou o post reserva)' }
  if (p.semImagem) return { s: 'sem_imagem', motivo: 'imagem ainda não gerada (rodar scripts/recado-organico.mjs quando ficar pronta)' }
  if (l?.status === 'publicando') return ctx.agora - Date.parse(l.atualizado_em) > TRAVA ? { s: 'erro', motivo: 'travou no meio da publicação: confere no Instagram se saiu' } : { s: 'publicando' }
  if (l?.status === 'erro' && l.tentativas >= TENTATIVAS) return { s: 'erro', motivo: l.erro }
  if (!ctx.banco) return { s: 'esperando_banco' }
  if (!ctx.token) return { s: 'falta_token' }
  const q = Date.parse(p.quando)
  if (ctx.ligado && q < ctx.ligado) return { s: 'passou', motivo: 'a hora passou antes de o agendador ser ligado' }
  if (q <= ctx.agora - ATRASO_MAX) return { s: 'passou', motivo: 'atrasou mais de 24 h: não sai sozinho' }
  if (q <= ctx.agora) return { s: 'na_hora', motivo: l?.status === 'erro' ? 'tentando de novo: ' + l.erro : undefined }
  return { s: 'agendado' }
}

// ---------- a volta do agendador ----------
export async function rodaAgendador(o: { seco?: boolean; agora?: number; avisa?: (titulo: string, texto: string) => Promise<any> } = {}) {
  const agora = o.agora || Date.now(), seco = !!o.seco
  const est = await leEstado()
  const env = (process.env.RECADO_IG_TOKEN || '').trim()
  let igRow = est.ig
  let { token, fonte } = tokenAtual(igRow)
  const log: string[] = []

  // token: registra um token novo da Vercel, descobre a conta, renova quando faltar menos de 10 dias
  if (est.banco && token && !seco) {
    try {
      if (fonte === 'vercel' && igRow?.token_de !== impressao(env)) {
        // token novo na Vercel: não sei quando foi gerado, então conto 55 dias a partir de agora (renova no dia 45, com folga)
        igRow = (await grava('recado_ig', { id: 1, token: null, token_de: impressao(env), visto_em: new Date(agora).toISOString(), expira_em: new Date(agora + 55 * 86400e3).toISOString(), renovado_em: null, user_id: null, username: null, erro: null, atualizado_em: new Date().toISOString() }))[0]
        log.push('token novo da Vercel registrado')
      }
      if (!igRow?.user_id) {
        const me = await ig('GET', 'me', { fields: 'user_id,username' }, token)
        igRow = (await grava('recado_ig', { id: 1, user_id: String(me.user_id || me.id), username: me.username || null, atualizado_em: new Date().toISOString() }))[0]
        log.push('conta: @' + (me.username || '?'))
      }
      const base = Date.parse(igRow?.renovado_em || igRow?.visto_em || 0)
      if (igRow?.expira_em && Date.parse(igRow.expira_em) - agora < RENOVA_ANTES && agora - base > 24 * 3600e3) {
        try {
          const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, { cache: 'no-store' })
          const j: any = await r.json().catch(() => ({}))
          if (!r.ok || !j.access_token) throw new Error(j.error?.message || 'renovação recusada (' + r.status + ')')
          igRow = (await grava('recado_ig', { id: 1, token: j.access_token, token_de: env ? impressao(env) : igRow.token_de, expira_em: new Date(agora + (+j.expires_in || 60 * 86400) * 1000).toISOString(), renovado_em: new Date(agora).toISOString(), erro: null, atualizado_em: new Date().toISOString() }))[0]
          ;({ token, fonte } = tokenAtual(igRow))
          log.push('token renovado até ' + igRow.expira_em.slice(0, 10))
        } catch (e: any) {
          await grava('recado_ig', { id: 1, erro: 'renovação: ' + String(e.message || e).slice(0, 200), atualizado_em: new Date().toISOString() }).catch(() => null)
          log.push('renovação falhou: ' + e.message)
          // avisa no celular só 1 vez por dia (na volta das 9h), não a cada 15 min
          if (o.avisa && Date.parse(igRow.expira_em) - agora < 3 * 86400e3 && new Date(agora).getUTCHours() === 12 && new Date(agora).getUTCMinutes() < 15) await o.avisa('Recado: token do Instagram vencendo', 'Não consegui renovar o token do Instagram e ele vence em ' + igRow.expira_em.slice(0, 10) + '. Gera um novo e troca o RECADO_IG_TOKEN na Vercel.').catch(() => null)
        }
      }
      // 1ª volta com banco e token prontos: marca a hora em que o agendador foi ligado
      if (!igRow?.ligado_em) { igRow = (await grava('recado_ig', { id: 1, ligado_em: new Date(agora).toISOString(), atualizado_em: new Date().toISOString() }))[0]; log.push('agendador ligado agora') }
    } catch (e: any) { log.push('token/conta: ' + e.message) }
  }

  // no modo seco sem agendador ligado: simula que ele foi ligado agora (hora de verdade), mesmo testando uma data futura
  const ligado = igRow?.ligado_em ? Date.parse(igRow.ligado_em) : seco ? Math.min(agora, Date.now()) : null
  // no modo seco sem banco ou sem token, simula com o banco vazio e um token de mentira (pra mostrar o que sairia)
  const ctx = { banco: est.banco || seco, token: !!token || seco, ligado, agora }
  const lista = POSTS_ORGANICO.map(p => ({ p, l: est.linhas.get(p.id), ...situacao(p, est.linhas.get(p.id), ctx) }))
  const vez = lista.find(x => x.s === 'na_hora')
  const resumo = { banco: est.banco, erroBanco: est.erroBanco, token: !!token, fonteToken: fonte, conta: igRow?.username || null, ligadoEm: igRow?.ligado_em || null, log }

  if (!vez) return { ...resumo, publicou: null, proximo: lista.find(x => x.s === 'agendado')?.p.id || null, motivo: seco ? 'nenhum post na hora' : !est.banco ? 'esperando banco (rodar sql/09)' : !token ? 'falta o token (RECADO_IG_TOKEN)' : 'nenhum post na hora' }
  if (seco) return { ...resumo, seco: true, publicaria: { id: vez.p.id, quando: vez.p.quando, tipo: vez.p.tipo, assunto: vez.p.assunto }, chamadas: chamadasDoPost(vez.p, igRow?.user_id || '{ig-user-id}') }
  if (!igRow?.user_id || !token) return { ...resumo, publicou: null, motivo: 'não consegui ler a conta do Instagram com o token' }

  // trava: só uma volta publica este post (status agendado/erro -> publicando, condicional no banco)
  const p = vez.p
  await banco('recado_organico', { method: 'POST', body: JSON.stringify({ id: p.id }), headers: { Prefer: 'resolution=ignore-duplicates' } })
  const peguei = await atualiza('recado_organico', `id=eq.${p.id}&status=in.(agendado,erro)&pular=eq.false`, { status: 'publicando', tentativas: (vez.l?.tentativas || 0) + 1 })
  if (!peguei?.length) return { ...resumo, publicou: null, motivo: p.id + ' já está com outra volta' }
  try {
    const r = await publica(p, igRow.user_id, token)
    await atualiza('recado_organico', `id=eq.${p.id}`, { status: 'publicado', media_id: r.mediaId, permalink: r.permalink, publicado_em: new Date().toISOString(), erro: null })
    return { ...resumo, publicou: { id: p.id, permalink: r.permalink } }
  } catch (e: any) {
    const msg = String(e.message || e).slice(0, 300)
    const ultima = e.naHoraDePublicar || (vez.l?.tentativas || 0) + 1 >= TENTATIVAS
    await atualiza('recado_organico', `id=eq.${p.id}`, { status: 'erro', erro: (e.naHoraDePublicar ? 'erro na hora de publicar (confere no Instagram se saiu): ' : '') + msg, ...(e.naHoraDePublicar ? { tentativas: 99 } : {}) }).catch(() => null)
    if (ultima && o.avisa) await o.avisa('Recado: post do Instagram não saiu', `${p.id} (${p.assunto}): ${msg}. Abre o painel, aba Orgânico.`).catch(() => null)
    return { ...resumo, publicou: null, erro: { id: p.id, msg } }
  }
}

// ---------- painel ----------
export async function estadoOrganico() {
  const est = await leEstado(), agora = Date.now()
  const { token, fonte } = tokenAtual(est.ig)
  const ligado = est.ig?.ligado_em ? Date.parse(est.ig.ligado_em) : null
  const ctx = { banco: est.banco, token: !!token, ligado, agora }
  return {
    banco: est.banco, token: !!token, fonteToken: fonte, conta: est.ig?.username || null, ligadoEm: est.ig?.ligado_em || null,
    tokenExpira: token ? est.ig?.expira_em || null : null, tokenRenovado: est.ig?.renovado_em || null, tokenErro: est.ig?.erro || null,
    posts: POSTS_ORGANICO.map(p => {
      const l = est.linhas.get(p.id), s = situacao(p, l, ctx)
      return { id: p.id, quando: p.quando, tipo: p.tipo, assunto: p.assunto, imagens: p.imagens.length, capa: p.imagens[0] ? '/recado/organico/' + p.imagens[0] : null,
        situacao: s.s, motivo: s.motivo || null, permalink: l?.permalink || null, publicadoEm: l?.publicado_em || null, erro: l?.erro || null, pular: !!l?.pular, legenda: p.legenda.slice(0, 160) }
    }),
  }
}

// botões do painel: pular ("já postei na mão"), voltar a agendar, tentar de novo depois de erro
export async function acaoOrganico(acao: string, id: string) {
  if (!POSTS_ORGANICO.some(p => p.id === id)) throw new Error('post não existe')
  const agora = new Date().toISOString()
  if (acao === 'organico_pular') return grava('recado_organico', { id, pular: true, atualizado_em: agora })
  if (acao === 'organico_voltar') return grava('recado_organico', { id, pular: false, atualizado_em: agora })
  if (acao === 'organico_tentar') return atualiza('recado_organico', `id=eq.${id}&status=in.(erro,publicando)`, { status: 'agendado', tentativas: 0, erro: null })
  throw new Error('ação inválida')
}
