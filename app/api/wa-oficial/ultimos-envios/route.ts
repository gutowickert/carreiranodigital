import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Diagnóstico: mostra os últimos envios de disparo com status e erro real.
export async function GET() {
  const { data } = await supabase.from('wa_disparo_envios')
    .select('telefone, status, erro, wamid, enviado_em, atualizado_em')
    .order('atualizado_em', { ascending: false })
    .limit(20)
  return NextResponse.json({ ok: true, envios: data || [] })
}
