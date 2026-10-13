// Oito Posts: lê o perfil PÚBLICO de um negócio pelo caminho oficial da Meta (Instagram Graph API, "Business Discovery").
// Funciona com contas profissionais (comercial ou criador). Quem consulta é a conta profissional da escola (OITO_IG_USER_ID),
// com um token que tenha instagram_basic + pages_show_list (OITO_IG_TOKEN; na falta, tenta o FB_ADS_TOKEN).
//   GET ?u=usuario            (x-senha) → { ok, perfil: {nome, bio, seguidores, posts, site}, midias: [{legenda, url, curtidas, comentarios, data, tipo}] }
//   GET ?diagnostico=1        (x-senha) → diz o que falta configurar
import { NextResponse } from 'next/server'
import { senhaOk } from '@/lib/oito/config'

export const maxDuration = 30
const G = 'https://graph.facebook.com/v21.0'
const token = () => process.env.OITO_IG_TOKEN || process.env.FB_ADS_TOKEN || ''

// acha a conta profissional do Instagram ligada às páginas do token (quando OITO_IG_USER_ID não está definida)
async function contaIG(): Promise<{ id: string | null; detalhe: any }> {
  if (process.env.OITO_IG_USER_ID) return { id: process.env.OITO_IG_USER_ID, detalhe: 'OITO_IG_USER_ID' }
  const r = await fetch(`${G}/me/accounts?fields=name,instagram_business_account{id,username}&limit=50&access_token=${token()}`, { cache: 'no-store' })
  const j = await r.json()
  const p = (j.data || []).find((x: any) => x.instagram_business_account)
  return { id: p?.instagram_business_account?.id || null, detalhe: j.error ? j.error.message : (j.data || []).map((x: any) => `${x.name}${x.instagram_business_account ? ' → @' + x.instagram_business_account.username : ''}`) }
}

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const u = new URL(req.url)
  if (!token()) return NextResponse.json({ ok: false, erro: 'sem token (OITO_IG_TOKEN)' })
  const conta = await contaIG().catch(e => ({ id: null, detalhe: String(e) }))
  if (u.searchParams.get('diagnostico')) {
    const me = await (await fetch(`${G}/me?fields=id,name&access_token=${token()}`, { cache: 'no-store' })).json().catch(() => null)
    const perms = await (await fetch(`${G}/me/permissions?access_token=${token()}`, { cache: 'no-store' })).json().catch(() => null)
    return NextResponse.json({ token: process.env.OITO_IG_TOKEN ? 'OITO_IG_TOKEN' : 'FB_ADS_TOKEN', me: me?.name || me?.error?.message, conta_ig: conta,
      permissoes: (perms?.data || []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission), erro_perm: perms?.error?.message })
  }
  const usuario = String(u.searchParams.get('u') || '').replace(/^@/, '').trim().toLowerCase()
  if (!/^[a-z0-9._]{1,30}$/.test(usuario)) return NextResponse.json({ ok: false, erro: 'usuário inválido' }, { status: 400 })
  if (!conta.id) return NextResponse.json({ ok: false, erro: 'nenhuma conta profissional do Instagram ligada ao token', detalhe: conta.detalhe })
  const campos = `business_discovery.username(${usuario}){name,username,biography,website,followers_count,media_count,media.limit(18){caption,media_type,media_url,thumbnail_url,like_count,comments_count,timestamp,permalink}}`
  const r = await fetch(`${G}/${conta.id}?fields=${encodeURIComponent(campos)}&access_token=${token()}`, { cache: 'no-store' })
  const j = await r.json()
  if (j.error) {
    // conta pessoal ou inexistente: a Meta só mostra perfis profissionais
    const pessoal = /cannot be found|not.*business|Invalid user id/i.test(j.error.message || '')
    return NextResponse.json({ ok: false, erro: pessoal ? 'perfil não encontrado ou não é conta profissional' : j.error.message })
  }
  const b = j.business_discovery || {}
  return NextResponse.json({
    ok: true,
    perfil: { nome: b.name, usuario: b.username, bio: b.biography, site: b.website, seguidores: b.followers_count, posts: b.media_count },
    midias: (b.media?.data || []).map((m: any) => ({ legenda: (m.caption || '').slice(0, 900), tipo: m.media_type, url: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url, curtidas: m.like_count, comentarios: m.comments_count, data: m.timestamp })),
  })
}
