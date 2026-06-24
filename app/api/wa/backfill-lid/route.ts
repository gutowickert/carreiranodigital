import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { lidDoTelefone } from '@/lib/zapi'

// Admin (rode abrindo a URL): resolve e guarda o @lid das conversas do Z-API que ainda
// não têm (pra casar as mensagens enviadas do CELULAR, que chegam só com @lid).
// Processa em lotes priorizando as conversas mais recentes. Abra de novo até "restantes: 0".
export async function GET() {
  const { data: convs } = await supabase.from('wa_conversas')
    .select('id, telefone')
    .or('canal.eq.zapi,canal.is.null')
    .is('chat_lid', null)
    .not('telefone', 'is', null)
    .order('ultima_msg_em', { ascending: false, nullsFirst: false })
    .limit(300)

  const alvos = (convs || []).filter(c => c.telefone && !c.telefone.includes('@lid') && c.telefone.replace(/\D/g, '').length >= 12)
  const lote = alvos.slice(0, 40)
  let resolvidos = 0
  for (const c of lote) {
    try {
      const lid = await lidDoTelefone(c.telefone)
      if (lid) { await supabase.from('wa_conversas').update({ chat_lid: lid }).eq('id', c.id); resolvidos++ }
    } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true, processados: lote.length, resolvidos, restantes: Math.max(0, alvos.length - lote.length) })
}
