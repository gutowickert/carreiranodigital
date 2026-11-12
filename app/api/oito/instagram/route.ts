// Oito Posts: lê o perfil PÚBLICO de um negócio pelo caminho oficial da Meta (Instagram Graph API, "Business Discovery").
// Funciona com contas profissionais (comercial ou criador). Quem consulta é a conta profissional da escola (OITO_IG_USER_ID),
// com um token que tenha instagram_basic + pages_show_list (OITO_IG_TOKEN; na falta, tenta o FB_ADS_TOKEN).
//   GET ?u=usuario            (x-senha) → { ok, perfil: {nome, bio, seguidores, posts, site}, midias: [{legenda, url, curtidas, comentarios, data, tipo}] }
//   GET ?diagnostico=1        (x-senha) → diz o que falta configurar
// A parte comum (token, conta, consulta) mora em lib/diagnostico/instagram.ts — o conector MCP do diagnóstico usa a mesma.
import { NextResponse } from 'next/server'
import { senhaOk } from '@/lib/oito/config'
import { GRAPH as G, igToken as token, contaIG, limparUsuario, businessDiscovery } from '@/lib/diagnostico/instagram'

export const maxDuration = 30

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
  const usuario = limparUsuario(String(u.searchParams.get('u') || ''))
  if (!usuario) return NextResponse.json({ ok: false, erro: 'usuário inválido' }, { status: 400 })
  if (!conta.id) return NextResponse.json({ ok: false, erro: 'nenhuma conta profissional do Instagram ligada ao token', detalhe: conta.detalhe })
  const res = await businessDiscovery(conta.id, usuario)
  if (!res.ok) return NextResponse.json({ ok: false, erro: res.erro })
  const b = res.b
  return NextResponse.json({
    ok: true,
    perfil: { nome: b.name, usuario: b.username, bio: b.biography, site: b.website, seguidores: b.followers_count, posts: b.media_count },
    midias: (b.media?.data || []).map((m: any) => ({ legenda: (m.caption || '').slice(0, 900), tipo: m.media_type, url: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url, curtidas: m.like_count, comentarios: m.comments_count, data: m.timestamp })),
  })
}
