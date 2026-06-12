import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Webhook Z-API "ao receber mensagem" (e enviadas pelo celular, se habilitado)
export async function POST(req: NextRequest) {
  try {
    const ev = await req.json()
    console.log('ZAPI WEBHOOK RECEBIDO:', JSON.stringify(ev))

    if (ev.isGroup) return NextResponse.json({ ok: true, skip: 'grupo' })

    const telefone = (ev.phone || '').toString().replace(/\D/g, '')
    if (!telefone) return NextResponse.json({ ok: true, skip: 'sem telefone' })

    const zapiId = ev.messageId || null
    const fromMe = !!ev.fromMe

    let tipo = 'texto'
    let texto: string | null = null
    let midiaUrl: string | null = null
    let midiaMime: string | null = null

    if (ev.text && ev.text.message) { texto = ev.text.message }
    else if (ev.image) { tipo = 'imagem'; midiaUrl = ev.image.imageUrl; midiaMime = ev.image.mimeType || 'image/jpeg'; texto = ev.image.caption || null }
    else if (ev.audio) { tipo = 'audio'; midiaUrl = ev.audio.audioUrl; midiaMime = ev.audio.mimeType || 'audio/ogg' }
    else if (ev.video) { tipo = 'video'; midiaUrl = ev.video.videoUrl; midiaMime = ev.video.mimeType || 'video/mp4'; texto = ev.video.caption || null }
    else if (ev.document) { tipo = 'documento'; midiaUrl = ev.document.documentUrl; midiaMime = ev.document.mimeType || null; texto = ev.document.fileName || null }
    else if (ev.sticker) { tipo = 'imagem'; midiaUrl = ev.sticker.stickerUrl; midiaMime = 'image/webp' }
    else return NextResponse.json({ ok: true, skip: 'tipo nao tratado' })

    if (zapiId) {
      const { data: ja } = await supabase.from('wa_mensagens').select('id').eq('zapi_id', zapiId).limit(1)
      if (ja && ja.length) return NextResponse.json({ ok: true, skip: 'duplicada' })
    }

    let { data: conversa } = await supabase.from('wa_conversas').select('*').eq('telefone', telefone).maybeSingle()

    if (!conversa) {
      const sufixo = telefone.slice(-8)
      const { data: leadMatch } = await supabase.from('leads')
        .select('id, nome').ilike('whatsapp', `%${sufixo}%`)
        .order('criado_em', { ascending: false }).limit(1)
      const { data: alunoMatch } = await supabase.from('alunos')
        .select('id, nome').ilike('whatsapp', `%${sufixo}%`).limit(1)

      const lead = leadMatch && leadMatch[0]
      const aluno = alunoMatch && alunoMatch[0]
      const nome = ev.senderName || ev.chatName || (lead && lead.nome) || (aluno && aluno.nome) || null

      const { data: nova } = await supabase.from('wa_conversas').insert({
        telefone,
        nome,
        lead_id: lead ? lead.id : null,
        aluno_id: aluno ? aluno.id : null,
      }).select().single()
      conversa = nova
    }
    if (!conversa) return NextResponse.json({ ok: false, error: 'conversa nao criada' }, { status: 200 })

    await supabase.from('wa_mensagens').insert({
      conversa_id: conversa.id,
      zapi_id: zapiId,
      direcao: fromMe ? 'enviada' : 'recebida',
      tipo,
      texto,
      midia_url: midiaUrl,
      midia_mime: midiaMime,
      status: fromMe ? 'enviada' : 'recebida',
    })

    const resumo = texto || (tipo === 'imagem' ? '📷 Imagem' : tipo === 'audio' ? '🎤 Áudio' : tipo === 'video' ? '🎬 Vídeo' : '📎 Documento')
    await supabase.from('wa_conversas').update({
      ultima_msg: resumo,
      ultima_msg_em: new Date().toISOString(),
      nao_lidas: fromMe ? (conversa.nao_lidas || 0) : (conversa.nao_lidas || 0) + 1,
      nome: conversa.nome || ev.senderName || null,
    }).eq('id', conversa.id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}