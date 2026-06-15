import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { marcarChatLido } from '@/lib/zapi'

// Marca o chat como lido no WhatsApp (some o não-lida no celular) quando a
// conversa é aberta no sistema. Também zera o não-lida no banco.
export async function POST(req: NextRequest) {
  try {
    const { conversaId, telefone, chatLid } = await req.json()

    if (conversaId) {
      await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', conversaId)
    }

    // alvo no WhatsApp: número real (10–13 díg) usa o número; senão o @lid
    const digits = (telefone || '').toString().replace(/\D/g, '')
    let alvo = ''
    if (digits.length >= 10 && digits.length <= 13) alvo = digits
    else if (chatLid) alvo = chatLid.toString()
    else if (digits.length > 13) alvo = `${digits}@lid`
    else alvo = digits

    if (alvo) await marcarChatLido(alvo)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
