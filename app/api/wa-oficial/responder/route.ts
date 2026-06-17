import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { enviarTexto, foneOficial } from '@/lib/whatsapp-oficial'

// Responde uma conversa da caixa "WhatsApp Disparos" (número novo / Cloud API).
// Mensagem de SESSÃO (texto livre) — só entrega dentro da janela de 24h.
export async function POST(req: NextRequest) {
  try {
    const { conversaId, telefone, texto } = await req.json()
    if (!texto || !texto.trim()) return NextResponse.json({ ok: false, error: 'texto vazio' }, { status: 200 })
    if (!telefone) return NextResponse.json({ ok: false, error: 'sem telefone' }, { status: 200 })

    const r = await enviarTexto(telefone, texto.trim())
    if (!r.ok) {
      // erro típico fora da janela de 24h: a Meta exige template
      return NextResponse.json({ ok: false, error: r.error || 'falha ao enviar', foraJanela: /131047|24|re-?engage|template/i.test(r.error || '') }, { status: 200 })
    }

    const tel = foneOficial(telefone)
    if (conversaId) {
      await supabase.from('wa_mensagens').insert({
        conversa_id: conversaId, zapi_id: r.wamid || null, direcao: 'enviada',
        tipo: 'texto', texto: texto.trim(), status: 'enviada', canal: 'oficial',
      })
      await supabase.from('wa_conversas').update({
        ultima_msg: texto.trim().slice(0, 200), ultima_msg_em: new Date().toISOString(),
      }).eq('id', conversaId)
    }
    // se virou conversa e o contato estava como 'respondeu', mantém; nada a fazer aqui
    void tel
    return NextResponse.json({ ok: true, wamid: r.wamid })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
