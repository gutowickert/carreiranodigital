import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Tira este aparelho da lista de avisos.
//
// ⚠️ A ORDEM IMPORTA, E ELA ESTÁ NA TELA. Quem desliga sai do navegador PRIMEIRO e do servidor
// depois: a tela se reapresenta ao servidor a cada carga, então apagar só a linha faria a inscrição
// voltar sozinha no próximo F5. Um botão de desligar que não desliga é pior que não ter botão.
export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json().catch(() => ({} as any))
    if (!endpoint) return NextResponse.json({ ok: false, error: 'faltou o aparelho' }, { status: 200 })
    await sb.from('wa_push_subs').delete().eq('endpoint', endpoint)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
