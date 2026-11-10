// Instagram público (Business Discovery da Graph API) — usado pelo Oito Posts (/api/oito/instagram)
// e pelo conector MCP do diagnóstico (/api/diagnostico/mcp/[chave]).
// Só funciona com contas profissionais (comercial ou criador). Quem consulta é a conta profissional da escola
// (OITO_IG_USER_ID ou a achada em /me/accounts), com o token OITO_IG_TOKEN (na falta, FB_ADS_TOKEN).

import { urlProxy } from './proxy'

export const GRAPH = 'https://graph.facebook.com/v21.0'
export const igToken = () => process.env.OITO_IG_TOKEN || process.env.FB_ADS_TOKEN || ''

// acha a conta profissional do Instagram ligada às páginas do token (quando OITO_IG_USER_ID não está definida)
export async function contaIG(): Promise<{ id: string | null; detalhe: any }> {
  if (process.env.OITO_IG_USER_ID) return { id: process.env.OITO_IG_USER_ID, detalhe: 'OITO_IG_USER_ID' }
  const r = await fetch(`${GRAPH}/me/accounts?fields=name,instagram_business_account{id,username}&limit=50&access_token=${igToken()}`, { cache: 'no-store' })
  const j = await r.json()
  const p = (j.data || []).find((x: any) => x.instagram_business_account)
  return { id: p?.instagram_business_account?.id || null, detalhe: j.error ? j.error.message : (j.data || []).map((x: any) => `${x.name}${x.instagram_business_account ? ' → @' + x.instagram_business_account.username : ''}`) }
}

// "@Fulano " → "fulano"; devolve null se não for um usuário válido do Instagram
export function limparUsuario(u: string): string | null {
  const usuario = String(u || '').replace(/^@/, '').trim().toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(usuario) ? usuario : null
}

// consulta crua do Business Discovery (perfil + últimas 18 mídias)
export async function businessDiscovery(contaId: string, usuario: string): Promise<{ ok: true; b: any } | { ok: false; erro: string }> {
  const campos = `business_discovery.username(${usuario}){name,username,biography,website,profile_picture_url,followers_count,media_count,media.limit(18){caption,media_type,media_url,thumbnail_url,like_count,comments_count,timestamp,permalink}}`
  const r = await fetch(`${GRAPH}/${contaId}?fields=${encodeURIComponent(campos)}&access_token=${igToken()}`, { cache: 'no-store' })
  const j = await r.json()
  if (j.error) {
    // conta pessoal ou inexistente: a Meta só mostra perfis profissionais
    const pessoal = /cannot be found|not.*business|Invalid user id/i.test(j.error.message || '')
    return { ok: false, erro: pessoal ? 'perfil não encontrado ou não é conta profissional' : j.error.message }
  }
  return { ok: true, b: j.business_discovery || {} }
}

// versão pronta pro diagnóstico: perfil, últimas 18 postagens e um resumo calculado
export async function perfilInstagramDiagnostico(entrada: string) {
  const usuario = limparUsuario(entrada)
  if (!usuario) return { ok: false, erro: 'usuário do Instagram inválido (use só o @, ex.: padariadojoao)' }
  if (!igToken()) return { ok: false, erro: 'falta o token do Instagram no servidor (OITO_IG_TOKEN ou FB_ADS_TOKEN)' }
  let conta: { id: string | null; detalhe: any }
  try { conta = await contaIG() } catch (e: any) { return { ok: false, erro: 'não consegui achar a conta do Instagram da escola: ' + String(e?.message || e) } }
  if (!conta.id) return { ok: false, erro: 'nenhuma conta profissional do Instagram ligada ao token do servidor' }
  let res: Awaited<ReturnType<typeof businessDiscovery>>
  try { res = await businessDiscovery(conta.id, usuario) } catch (e: any) { return { ok: false, erro: 'falha ao consultar o Instagram: ' + String(e?.message || e) } }
  if (!res.ok) {
    const erro = res.erro === 'perfil não encontrado ou não é conta profissional'
      ? `o perfil @${usuario} não existe ou é conta pessoal — a Meta só mostra dados de contas profissionais (comercial ou criador)`
      : res.erro
    return { ok: false, erro }
  }
  const b = res.b
  const postagens = (b.media?.data || []).map((m: any) => {
    const imagem = (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) || null
    return {
      tipo: m.media_type === 'VIDEO' ? (/\/reel\//.test(m.permalink || '') ? 'REELS' : 'VIDEO') : m.media_type === 'CAROUSEL_ALBUM' ? 'CARROSSEL' : m.media_type === 'IMAGE' ? 'FOTO' : m.media_type,
      data: m.timestamp ? new Date(m.timestamp).toISOString() : null,
      curtidas: m.like_count ?? null,
      comentarios: m.comments_count ?? null,
      legenda: (m.caption || '').slice(0, 300),
      permalink: m.permalink || null,
      imagem,
      imagem_proxy: urlProxy(imagem),
    }
  })
  const agora = Date.now()
  const datas = postagens.map((p: any) => (p.data ? Date.parse(p.data) : NaN)).filter((n: number) => !isNaN(n))
  const ultima = datas.length ? Math.max(...datas) : null
  const resumo = {
    dias_desde_ultima_postagem: ultima == null ? null : Math.floor((agora - ultima) / 86400000),
    postagens_ultimos_30_dias: datas.filter((d: number) => agora - d <= 30 * 86400000).length,
    videos_ou_reels_nas_ultimas_9: postagens.slice(0, 9).filter((p: any) => p.tipo === 'VIDEO' || p.tipo === 'REELS').length,
    observacao: postagens.length >= 18 ? 'contagem dos últimos 30 dias limitada às 18 postagens mais recentes' : undefined,
  }
  return {
    ok: true,
    nome: b.name ?? null,
    usuario: b.username ?? usuario,
    bio: b.biography ?? null,
    site: b.website ?? null,
    foto_perfil: b.profile_picture_url ?? null,
    foto_perfil_proxy: urlProxy(b.profile_picture_url),
    seguidores: b.followers_count ?? null,
    total_posts: b.media_count ?? null,
    resumo,
    postagens,
  }
}
