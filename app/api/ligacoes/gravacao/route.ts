import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { urlGravacao } from '@/lib/chamadas'

// A gravação de uma chamada do sistema fica num bucket privado: o card do lead pede aqui uma URL
// assinada (1h) na hora de tocar. Ligação da API4COM já tem URL pública em gravacao_url.
//   GET ?id=<ligacao> → { url }
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const id = new URL(req.url).searchParams.get('id') || ''
    const { data: lig } = await sb.from('ligacoes').select('id, org_id, gravacao_url, metadata').eq('id', id).maybeSingle()
    if (!lig || (lig.org_id && lig.org_id !== org)) return NextResponse.json({ ok: false, error: 'ligação não encontrada' }, { status: 200 })
    const meta: any = lig.metadata || {}
    if (meta.origem !== 'chamada_sistema') return NextResponse.json({ ok: true, url: lig.gravacao_url })
    const url = await urlGravacao(meta.gravacao_path || lig.gravacao_url)
    return NextResponse.json({ ok: !!url, url, error: url ? undefined : 'gravação não encontrada' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
