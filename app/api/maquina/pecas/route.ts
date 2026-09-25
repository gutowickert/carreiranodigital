import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemUsaMaquina } from '@/lib/maquina-acesso'
import { configDaMaquina } from '@/lib/recurso'

// AS PEÇAS DA MÁQUINA — listar e mudar de situação.
//
// É esta lista que faz a Máquina valer a pena: no claude.ai a peça nasce na conversa e morre lá.
// Aqui ela é encontrada de novo semana que vem, com data, com quem pediu e com as versões.

const SITUACOES = ['rascunho', 'aprovada', 'publicada', 'descartada']

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await quemUsaMaquina(auth))) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 403 })
    const org = await orgDaRequest(auth)
    const sp = new URL(req.url).searchParams
    const tipo = sp.get('tipo') || ''

    let q = sb.from('estudio_pecas').select('*').eq('org_id', org).neq('situacao', 'descartada')
    if (tipo) q = q.eq('tipo', tipo)
    const { data } = await q.order('criado_em', { ascending: false }).limit(120)

    // o nome de quem pediu, pra lista não mostrar código
    const ids = [...new Set((data || []).map((p: any) => p.criada_por).filter(Boolean))]
    const { data: pessoas } = ids.length
      ? await sb.from('usuarios_perfil').select('id, nome').in('id', ids)
      : { data: [] as any[] }
    const nomes = Object.fromEntries((pessoas || []).map((p: any) => [p.id, p.nome]))

    // a tela pergunta aqui como se chama e como abre (Máquina CND / Studio Mkt)
    const cfg = await configDaMaquina()
    return NextResponse.json({
      ok: true,
      maquina: cfg,
      pecas: (data || []).map((p: any) => ({ ...p, autor: nomes[p.criada_por] || null })),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await quemUsaMaquina(auth))) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 403 })
    const org = await orgDaRequest(auth)
    const b = await req.json().catch(() => ({} as any))
    if (!b.id || !SITUACOES.includes(b.situacao)) return NextResponse.json({ ok: false, error: 'pedido inválido' }, { status: 200 })

    const patch: any = { situacao: b.situacao, atualizado_em: new Date().toISOString() }
    patch.publicada_em = b.situacao === 'publicada' ? new Date().toISOString() : null

    const { error } = await sb.from('estudio_pecas').update(patch).eq('org_id', org).eq('id', b.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
