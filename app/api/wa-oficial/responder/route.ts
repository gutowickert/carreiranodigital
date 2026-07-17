import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTexto, enviarMidia, uploadMidia } from '@/lib/whatsapp-oficial'

// Responde uma conversa da caixa "WhatsApp Disparos" (número novo / Cloud API).
// Texto, foto, documento ou áudio — mensagem de SESSÃO (só entrega dentro de 24h).
export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { conversaId, telefone, texto, audioBase64, anexoBase64, anexoNome, anexoTipo } = await req.json()
    if (!telefone) return NextResponse.json({ ok: false, error: 'sem telefone' }, { status: 200 })
    const dataUrl: string | null = audioBase64 || anexoBase64 || null
    if (!texto?.trim() && !dataUrl) return NextResponse.json({ ok: false, error: 'nada pra enviar' }, { status: 200 })

    let r: { ok: boolean; wamid?: string | null; error?: string }
    let tipoMsg = 'texto'
    let midiaMime: string | null = null

    if (dataUrl) {
      const mm = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!mm) return NextResponse.json({ ok: false, error: 'mídia inválida' }, { status: 200 })
      midiaMime = mm[1]
      const buffer = Buffer.from(mm[2], 'base64')
      const ehAudio = !!audioBase64
      const tipoEnvio = ehAudio ? 'audio' : (anexoTipo === 'imagem' ? 'image' : 'document')
      const filename = anexoNome || (ehAudio ? 'audio.ogg' : 'arquivo')
      const up = await uploadMidia(buffer, midiaMime, filename)
      if (!up.ok || !up.id) return NextResponse.json({ ok: false, error: 'falha no upload: ' + up.error }, { status: 200 })
      r = await enviarMidia(telefone, tipoEnvio, up.id, texto?.trim() || undefined, anexoNome)
      tipoMsg = ehAudio ? 'audio' : (anexoTipo === 'imagem' ? 'imagem' : 'documento')
    } else {
      r = await enviarTexto(telefone, texto.trim())
    }

    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error || 'falha ao enviar', foraJanela: /131047|24|re-?engage|template/i.test(r.error || '') }, { status: 200 })
    }

    if (conversaId) {
      await supabase.from('wa_mensagens').insert({
        org_id: org,
        conversa_id: conversaId, zapi_id: r.wamid || null, direcao: 'enviada',
        tipo: tipoMsg, texto: tipoMsg === 'documento' ? (anexoNome || null) : (texto?.trim() || null),
        midia_url: dataUrl, midia_mime: midiaMime, status: 'enviada', canal: 'oficial',
      })
      const resumo = tipoMsg === 'imagem' ? '📷 Imagem' : tipoMsg === 'audio' ? '🎤 Áudio' : tipoMsg === 'documento' ? `📎 ${anexoNome || 'documento'}` : (texto?.trim() || '')
      await supabase.from('wa_conversas').update({
        ultima_msg: resumo.slice(0, 200), ultima_msg_em: new Date().toISOString(),
      }).eq('org_id', org).eq('id', conversaId)
    }
    return NextResponse.json({ ok: true, wamid: r.wamid })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
