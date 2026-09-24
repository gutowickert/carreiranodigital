import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

// Guarda a inscrição de push de um aparelho.
//
// ⚠️ GRAVA DE QUEM É O APARELHO. Não gravava, e as três inscrições do sistema estavam todas com o
// dono em branco — não havia como responder a pergunta mais básica quando alguém reclamava de não
// receber aviso: "esse aparelho está inscrito?". Sem isso, o diagnóstico virava adivinhação.
//
// Continua aceitando cadastro SEM login: a tela reapresenta o aparelho a cada carga, e perder o
// cadastro por causa de uma sessão expirada seria trocar um problema por outro. Sem login, grava
// sem dono — que é exatamente o que acontecia antes.
export async function POST(req: NextRequest) {
  try {
    const { subscription } = await req.json()
    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ ok: false, error: 'subscription inválida' }, { status: 400 })
    }

    const auth = req.headers.get('authorization')
    let userId: string | null = null
    let org: string | null = null
    try {
      org = await orgDaRequest(auth)
      const quem = await quemEuVejo(auth, org)
      userId = quem?.eu.id || null
    } catch { /* sem login: grava sem dono, como antes */ }

    const linha: any = {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }
    // só sobrescreve o dono quando eu SEI quem é: uma carga sem sessão não pode apagar
    // a identificação que uma carga com sessão já tinha gravado
    if (userId) linha.user_id = userId
    if (org) linha.org_id = org

    await supabase.from('wa_push_subs').upsert(linha, { onConflict: 'endpoint' })
    return NextResponse.json({ ok: true, identificado: !!userId })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
