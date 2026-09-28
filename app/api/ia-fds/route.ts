import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { meuPerfil } from '@/lib/quem-eu-vejo'
import { configFds, naJanela } from '@/lib/ia-fds'

// A IA DO FIM DE SEMANA — a revisão (lib/ia-fds.ts).
//   GET                         → o que ela fez/faria nos últimos fins de semana, agrupado por segunda
//   POST { modo }               → 'sombra' | 'desligado' (o 'ligado' só depois da revisão)

export async function GET(req: Request) {
  const eu = await meuPerfil(req.headers.get('authorization'))
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })
  const desde = new Date(Date.now() - 35 * 864e5).toISOString()
  const { data } = await sb.from('webhook_logs').select('id, payload, recebido_em').eq('origem', 'ia-fds').gte('recebido_em', desde).order('recebido_em', { ascending: false }).limit(1000)
  return NextResponse.json({ ok: true, config: await configFds(), agoraNaJanela: naJanela(), registros: (data || []).map(r => ({ id: r.id, em: r.recebido_em, ...(r.payload as any) })) })
}

export async function POST(req: Request) {
  const eu = await meuPerfil(req.headers.get('authorization'))
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })
  const { data: p } = await sb.from('usuarios_perfil').select('papel').eq('id', eu.id).maybeSingle()
  if (p?.papel !== 'admin') return NextResponse.json({ ok: false, error: 'só admin' }, { status: 403 })
  const b = await req.json().catch(() => ({} as any))
  if (!['sombra', 'desligado'].includes(b.modo)) return NextResponse.json({ ok: false, error: 'modo inválido (o "ligado" só depois da revisão)' })
  const cfg = { ...(await configFds()), modo: b.modo }
  const { data: ja } = await sb.from('configuracoes').select('chave').eq('chave', 'ia.fds').maybeSingle()
  const { error } = ja
    ? await sb.from('configuracoes').update({ valor: JSON.stringify(cfg) }).eq('chave', 'ia.fds')
    : await sb.from('configuracoes').insert({ chave: 'ia.fds', valor: JSON.stringify(cfg) })
  return NextResponse.json(error ? { ok: false, error: error.message } : { ok: true, config: cfg })
}
