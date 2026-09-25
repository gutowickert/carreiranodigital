import { NextRequest, NextResponse } from 'next/server'
import { recursoLigado } from '@/lib/recurso'
import { executarPendencia } from '@/lib/pendencias'
import { quemUsaMaquina } from '@/lib/maquina-acesso'

// Executa uma proposta que a pessoa confirmou na Máquina.
//
// Mesma lógica do Agente Interno (lib/pendencias); porta diferente: aqui entra quem tem login
// ativo E é admin/comercial. E o registro leva o NOME de quem confirmou — "a IA mudou o lead"
// nunca é resposta aceitável pra "quem mexeu nisso?".
export async function POST(req: NextRequest) {
  try {
    if (!(await recursoLigado('maquina'))) return NextResponse.json({ ok: false, error: 'a Máquina ainda não está ligada nesta empresa' }, { status: 200 })
    const perfil = await quemUsaMaquina(req.headers.get('authorization'))
    if (!perfil) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const r = await executarPendencia(b.pendencia, perfil.email || perfil.nome)
    return NextResponse.json(r, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
