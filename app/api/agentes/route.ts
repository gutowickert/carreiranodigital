import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Estado de liberação dos agentes da aula (Módulo 1).
//  GET  -> { ok, liberados, total }           (a página dos alunos lê isto em loop)
//  POST -> { acao:'liberar'|'voltar'|'set'|'reset', valor?, senha }  (só o professor)
//
// A "trava" é só ritmo de aula: os links dos GPTs são públicos. Por isso a senha
// é um segredo simples do professor, não segurança de verdade.

export const dynamic = 'force-dynamic'

const CHAVE = 'modulo1'
const TOTAL = 10
const PROF_KEY = process.env.AGENTES_PROF_KEY || 'Guto#1985'

const clamp = (n: number) => Math.max(0, Math.min(TOTAL, n))

async function ler(): Promise<number> {
  const { data } = await supabase.from('aula_agentes_estado').select('liberados').eq('chave', CHAVE).maybeSingle()
  return data ? data.liberados : 1
}

export async function GET() {
  try {
    const liberados = await ler()
    return NextResponse.json({ ok: true, liberados, total: TOTAL })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro', liberados: 1, total: TOTAL }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    if ((b.senha || '') !== PROF_KEY) return NextResponse.json({ ok: false, error: 'senha' }, { status: 200 })

    const atual = await ler()
    let alvo = atual
    if (b.acao === 'liberar') alvo = atual + 1
    else if (b.acao === 'voltar') alvo = atual - 1
    else if (b.acao === 'reset') alvo = 1
    else if (b.acao === 'set') alvo = parseInt(b.valor)
    if (isNaN(alvo)) alvo = atual
    alvo = clamp(alvo)

    const { error } = await supabase.from('aula_agentes_estado')
      .update({ liberados: alvo, atualizado_em: new Date().toISOString() }).eq('chave', CHAVE)
    if (error) throw error
    return NextResponse.json({ ok: true, liberados: alvo, total: TOTAL })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
