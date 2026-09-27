import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { transcreverLigacao } from '@/lib/transcrever-ligacao'
import { chamadaPorCodigo, retranscreverChamada } from '@/lib/chamadas'

export const maxDuration = 120

// O BOTÃO "TRANSCREVER" (27/09/2026, pedido do Guto: "tudo pode ser transcrito quando alguém quiser").
// Vale pra QUALQUER ligação do histórico: as da API4COM (baixa a gravação de lá) e as chamadas do
// sistema (baixa do bucket). Refaz mesmo já transcrita (forcar). O texto cai em ligacoes.metadata,
// que é o que o resumo do lead, o dossiê e a IA leem.
//   POST { id }        → ligação (tabela ligacoes)
//   POST { codigo }    → chamada do sistema (tabela chamadas)
export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const b = await req.json().catch(() => ({} as any))
    if (b.codigo) {
      const ch = await chamadaPorCodigo(String(b.codigo))
      if (!ch || ch.org_id !== org) return NextResponse.json({ ok: false, error: 'chamada não encontrada' }, { status: 200 })
      const r = await retranscreverChamada(ch.codigo)
      if (!r.ok) return NextResponse.json(r, { status: 200 })
      return NextResponse.json({ ok: true, transcricao: r.transcricao, vazia: !r.transcricao })
    }
    const id = String(b.id || '')
    if (!id) return NextResponse.json({ ok: false, error: 'falta id ou codigo' }, { status: 200 })
    const { data: lig } = await sb.from('ligacoes').select('id, org_id, gravacao_url, duracao').eq('id', id).maybeSingle()
    if (!lig || (lig.org_id && lig.org_id !== org)) return NextResponse.json({ ok: false, error: 'ligação não encontrada' }, { status: 200 })
    if (!lig.gravacao_url) return NextResponse.json({ ok: false, error: 'essa ligação não tem gravação' }, { status: 200 })
    const texto = await transcreverLigacao(id, { forcar: true })
    return NextResponse.json({ ok: true, transcricao: texto, vazia: !texto })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
