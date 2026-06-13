import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const ev = await req.json()

    if (ev.type && ev.type !== 'ReceivedCallback') return NextResponse.json({ ok: true, skip: 'nao e mensagem' })
    if (ev.isGroup) return NextResponse.json({ ok: true, skip: 'grupo' })
    if (ev.isNewsletter) return NextResponse.json({ ok: true, skip: 'newsletter' })

    const rawPhone = (ev.phone || '').toString()
    const ehLid = rawPhone.includes('@lid') || rawPhone.length > 14  // telefone "fake" (chatLid)
    const telefone = rawPhone.replace(/\D/g, '')
    if (!telefone) return NextResponse.json({ ok: true, skip: 'sem telefone' })

    const zapiId = ev.messageId || null
    const fromMe = !!ev.fromMe
    const chatName = ev.chatName || null

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

    const sufixo = telefone.slice(-8)
    // So tenta casar lead/aluno por telefone se NAO for lid
    const lead = ehLid ? null : (await supabase.from('leads').select('id, nome').ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1)).data?.[0]
    const aluno = ehLid ? null : (await supabase.from('alunos').select('id, nome').ilike('whatsapp', `%${sufixo}%`).limit(1)).data?.[0]

    // Acha conversa: telefone exato -> lead -> aluno -> sufixo -> (se lid) por chatName
    let conversa: any = null
    if (!ehLid) {
      const { data: porFone } = await supabase.from('wa_conversas').select('*').eq('telefone', telefone).maybeSingle()
      conversa = porFone || null
    }
    if (!conversa && lead) {
      const { data: c } = await supabase.from('wa_conversas').select('*').eq('lead_id', lead.id).limit(1)
      if (c && c[0]) conversa = c[0]
    }
    if (!conversa && aluno) {
      const { data: c } = await supabase.from('wa_conversas').select('*').eq('aluno_id', aluno.id).limit(1)
      if (c && c[0]) conversa = c[0]
    }
    if (!conversa && !ehLid) {
      const { data: c } = await supabase.from('wa_conversas').select('*').ilike('telefone', `%${sufixo}%`).limit(1)
      if (c && c[0]) conversa = c[0]
    }
    // Ultimo recurso (fromMe com @lid): casa pela conversa cujo nome OU lead/aluno bate com chatName
    if (!conversa && chatName) {
      // 1) conversa com mesmo nome
      const { data: c1 } = await supabase.from('wa_conversas').select('*').ilike('nome', chatName).order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(1)
      if (c1 && c1[0]) conversa = c1[0]
      // 2) lead com esse nome -> sua conversa
      if (!conversa) {
        const { data: ld } = await supabase.from('leads').select('id').ilike('nome', chatName).limit(1)
        if (ld && ld[0]) {
          const { data: c2 } = await supabase.from('wa_conversas').select('*').eq('lead_id', ld[0].id).limit(1)
          if (c2 && c2[0]) conversa = c2[0]
        }
      }
      // 3) aluno com esse nome -> sua conversa
      if (!conversa) {
        const { data: al } = await supabase.from('alunos').select('id').ilike('nome', chatName).limit(1)
        if (al && al[0]) {
          const { data: c3 } = await supabase.from('wa_conversas').select('*').eq('aluno_id', al[0].id).limit(1)
          if (c3 && c3[0]) conversa = c3[0]
        }
      }
    }

    if (!conversa) {
      // So cria conversa nova se tiver um telefone de verdade (nao cria pra @lid orfao)
      if (ehLid) return NextResponse.json({ ok: true, skip: 'lid sem conversa' })
      const nome = chatName || ev.senderName || (lead && lead.nome) || (aluno && aluno.nome) || null
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
      nome: conversa.nome || (!ehLid ? chatName : null) || null,
    }).eq('id', conversa.id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.log('ZAPI catch:', (e && e.message) || 'erro')
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}