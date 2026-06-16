import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Guarda a inscrição de push de um aparelho.
export async function POST(req: NextRequest) {
  try {
    const { subscription } = await req.json()
    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ ok: false, error: 'subscription inválida' }, { status: 400 })
    }
    await supabase.from('wa_push_subs').upsert({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }, { onConflict: 'endpoint' })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
