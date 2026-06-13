import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const ev = await req.json()
    console.log('ZAPI FULL:', JSON.stringify(ev))

    if (ev.type && ev.type !== 'ReceivedCallback') return NextResponse.json({ ok: true, skip: 'nao e mensagem' })
    if (ev.isGroup) { console.log('ZAPI skip grupo'); return NextResponse.json({ ok: true, skip: 'grupo' }) }
    if (ev.isNewsletter) { console.log('ZAPI skip newsletter'); return NextResponse.json({ ok: true, skip: 'newsletter' }) }

    const telefone = (ev.phone || '').toString().replace(/\D/g, '')
    if (!telefone) { console.log('ZAPI skip sem telefone'); return NextResponse.json({ ok: true, skip: 'sem telefone' }) }

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
    else { console.log('ZAPI tipo nao tratado:', JSON.stringify(ev)); return NextResponse.json({ ok: true, skip: 'tipo nao tratado' }) }

    console.log('ZAPI processando:', telefone, 'fromMe', fromMe, tipo, texto)

    if (zapiId) {
      const { data: ja } = await supabase.from('wa_mensagens').select('id').eq('zapi_id', zapiId).limit(1)
      if (ja && ja.length) { console.log('ZAPI skip duplicada', zapiId); return NextResponse.json({ ok: true, skip: 'duplicada' }) }
    }

    const sufixo = telefone.slice(-8)
    const { data: leadMatch } = await supabase.from('leads')
      .select('id, nome').ilike('whatsapp', `%${sufixo}%`)
      .order('criado_em', { ascending: false }).limit(1)
    const { data: alunoMatch } = await supabase.from('alunos')
      .select('id, nome').ilike('whatsapp', `%${sufixo}%`).limit(1)
    const lead = leadMatch && leadMatch[0]
    const aluno = alunoMatch && alunoMatch[0]

    let conversa: any = null
    const { data: porFone } = await supabase.from('wa_conversas').select('*').eq('telefone', telefone).maybeSingle()
    conversa = porFone || null
    if (!conversa && lead) {
      const { data: c } = await supabase.from('wa_conversas').select('*').eq('lead_id', lead.id).limit(1)
      if (c && c[0]) conversa = c[0]
    }
    if (!conversa && aluno) {
      const { data: c } = await supabase.from('wa_conversas').select('*').eq('aluno_id', aluno.id).limit(1)
      if (c && c[0]) conversa = c[0]
    }
    if (!conversa) {
      const { data: c } = await supabase.from('wa_conversas').select('*').ilike('telefone', `%${sufixo}%`).limit(1)
      if (c && c[0]) conversa = c[0]
    }

    if (!conversa) {
      const nome = ev.senderName || ev.chatName || (lead && lead.nome) || (aluno && aluno.nome) || null
      const { data: nova, error: errInsConv } = await supabase.from('wa_conversas').insert({
        telefone,
        nome,
        lead_id: lead ? lead.id : null,
        aluno_id: aluno ? aluno.id : null,
      }).select().single()
      if (errInsConv) console.log('ZAPI erro insert conversa:', JSON.stringify(errInsConv))
      conversa = nova
    }
    if (!conversa) { console.log('ZAPI conversa nula'); return NextResponse.json({ ok: false, error: 'conversa nao criada' }, { status: 200 }) }

    const { error: errMsg } = await supabase.from('wa_mensagens').insert({
      conversa_id: conversa.id,
      zapi_id: zapiId,
      direcao: fromMe ? 'enviada' : 'recebida',
      tipo,
      texto,
      midia_url: midiaUrl,
      midia_mime: midiaMime,
      status: fromMe ? 'enviada' : 'recebida',
    })
    if (errMsg) console.log('ZAPI erro insert mensagem:', JSON.stringify(errMsg))
    else console.log('ZAPI mensagem salva OK')

    const resumo = texto || (tipo === 'imagem' ? '📷 Imagem' : tipo === 'audio' ? '🎤 Áudio' : tipo === 'video' ? '🎬 Vídeo' : '📎 Documento')
    await supabase.from('wa_conversas').update({
      ultima_msg: resumo,
      ultima_msg_em: new Date().toISOString(),
      nao_lidas: fromMe ? (conversa.nao_lidas || 0) : (conversa.nao_lidas || 0) + 1,
      nome: conversa.nome || ev.senderName || null,
    }).eq('id', conversa.id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.log('ZAPI catch:', (e && e.message) || 'erro')
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}