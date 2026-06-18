import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { listarChats } from '@/lib/zapi'

// Espelha o nº de não-lidas do WhatsApp (estado real, ex: lido no celular) nas
// conversas do sistema. Chamado periodicamente pela caixa de entrada.
export async function POST() {
  try {
    const r = await listarChats(1, 100)
    if (!r.ok || !Array.isArray(r.data)) {
      return NextResponse.json({ ok: false, error: r.error || 'sem dados' }, { status: 200 })
    }

    const { data: conversas } = await supabase.from('wa_conversas').select('id, telefone, nao_lidas').eq('canal', 'zapi')
    const porTel: Record<string, { id: string; nao_lidas: number }> = {}
    ;(conversas || []).forEach((c: any) => { if (c.telefone) porTel[c.telefone] = { id: c.id, nao_lidas: c.nao_lidas || 0 } })

    let atualizadas = 0
    for (const chat of r.data) {
      const tel = (chat.phone || '').toString().replace(/\D/g, '')
      const unread = parseInt((chat.unread || '0').toString(), 10) || 0
      const conv = porTel[tel]
      if (conv && conv.nao_lidas !== unread) {
        await supabase.from('wa_conversas').update({ nao_lidas: unread }).eq('id', conv.id)
        atualizadas++
      }
    }
    return NextResponse.json({ ok: true, atualizadas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
