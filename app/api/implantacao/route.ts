import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Entrevista de implantação de cliente (public/implantacao/*.html). A página é
// aberta sem login — quem tem o link com a chave lê e escreve as respostas.
// A chave fica na tabela `implantacoes`, uma por cliente.

async function autorizado(slug: string | null, k: string | null) {
  if (!slug || !k) return null
  const { data } = await sb.from('implantacoes').select('slug, nome, chave').eq('slug', slug).maybeSingle()
  return data && data.chave === k ? data : null
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const imp = await autorizado(sp.get('slug'), sp.get('k'))
  if (!imp) return NextResponse.json({ ok: false, error: 'link inválido' }, { status: 403 })

  const { data, error } = await sb.from('implantacao_respostas')
    .select('campo, valor, atualizado_em').eq('slug', imp.slug)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, nome: imp.nome, respostas: data || [] })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'corpo inválido' }, { status: 400 })
  const imp = await autorizado(body.slug, body.k)
  if (!imp) return NextResponse.json({ ok: false, error: 'link inválido' }, { status: 403 })

  const campo = String(body.campo || '')
  const valor = String(body.valor ?? '')
  if (!campo || campo.length > 120) return NextResponse.json({ ok: false, error: 'campo inválido' }, { status: 400 })
  if (valor.length > 20000) return NextResponse.json({ ok: false, error: 'resposta longa demais' }, { status: 400 })

  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {}
  const { error } = await sb.from('implantacao_respostas').upsert(
    { slug: imp.slug, campo, valor, meta, atualizado_em: new Date().toISOString() },
    { onConflict: 'slug,campo' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
