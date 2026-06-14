import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { aplicarRateio } from '@/lib/rateio'
import { sendLead } from '@/lib/capi'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const ev = await req.json()

    if (ev.type && ev.type !== 'ReceivedCallback') return NextResponse.json({ ok: true, skip: 'nao e mensagem' })
    if (ev.isGroup) return NextResponse.json({ ok: true, skip: 'grupo' })
    if (ev.isNewsletter) return NextResponse.json({ ok: true, skip: 'newsletter' })

    const rawPhone = (ev.phone || '').toString()
    const ehLid = rawPhone.includes('@lid') || rawPhone.length > 14
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

    // Lead via botão de WhatsApp: a 1ª mensagem traz o ref [XXXX] gerado em /wa.
    // Só cria lead quando vier do botão (tem ref válido e ainda não consumido).
    let leadCriado: { id: string; nome: string | null } | null = null
    const refMatch = !fromMe && !ehLid ? (texto || '').match(/\[([0-9A-Fa-f]{6,12})\]/) : null
    if (refMatch) {
      const ref = refMatch[1].toUpperCase()
      const { data: click } = await supabase.from('wa_clicks')
        .select('*').eq('ref', ref).is('consumido_em', null).maybeSingle()
      if (click) {
        let turmaId: string | null = null
        let codigoTurma: string | null = click.codigo_turma || null
        if (codigoTurma) {
          const { data: turma } = await supabase.from('turmas').select('id, codigo').ilike('codigo', codigoTurma).maybeSingle()
          if (turma) { turmaId = turma.id; codigoTurma = turma.codigo }
        }
        const vendedorId = turmaId ? await aplicarRateio(supabase, turmaId) : null
        const nomeLead = chatName || ev.senderName || null
        const { data: novoLead } = await supabase.from('leads').insert({
          nome: nomeLead || 'Lead WhatsApp',
          whatsapp: telefone,
          turma_id: turmaId,
          codigo_turma: codigoTurma,
          vendedor_id: vendedorId,
          etapa: 'aguardando_atendimento',
          origem: 'whatsapp',
          fbclid: click.fbclid,
          fbc: click.fbc,
          fbp: click.fbp,
          utm_source: click.utm_source,
          utm_medium: click.utm_medium,
          utm_campaign: click.utm_campaign,
          utm_content: click.utm_content,
        }).select('id, nome').single()
        if (novoLead) {
          leadCriado = novoLead
          await supabase.from('lead_andamentos').insert({
            lead_id: novoLead.id,
            vendedor_id: vendedorId,
            tipo: 'criado',
            etapa_nova: 'aguardando_atendimento',
            observacao: 'Lead criado via botão de WhatsApp',
          })
          // CAPI Lead com atribuição completa (fbc/fbp guardados no clique). Falha não quebra.
          try {
            const capi = await sendLead({
              eventId: click.event_id || randomUUID(),
              eventSourceUrl: click.event_source_url,
              phone: telefone,
              firstName: nomeLead,
              fbc: click.fbc,
              fbp: click.fbp,
              clientIp: click.client_ip,
              userAgent: click.user_agent,
              externalId: novoLead.id,
              codigoTurma: codigoTurma,
            })
            if (!capi.ok) console.error('CAPI Lead (WhatsApp) falhou:', capi.error)
          } catch (e) { console.error('CAPI Lead (WhatsApp) exception:', e) }
          await supabase.from('wa_clicks').update({
            consumido_em: new Date().toISOString(),
            lead_id: novoLead.id,
          }).eq('id', click.id)
        }
      }
    }

    const sufixo = telefone.slice(-8)
    const lead = leadCriado || (ehLid ? null : (await supabase.from('leads').select('id, nome').ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1)).data?.[0])
    const aluno = ehLid ? null : (await supabase.from('alunos').select('id, nome').ilike('whatsapp', `%${sufixo}%`).limit(1)).data?.[0]

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
    if (!conversa && chatName) {
      const { data: c1 } = await supabase.from('wa_conversas').select('*').ilike('nome', chatName).order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(1)
      if (c1 && c1[0]) conversa = c1[0]
      if (!conversa) {
        const { data: ld } = await supabase.from('leads').select('id').ilike('nome', chatName).limit(1)
        if (ld && ld[0]) {
          const { data: c2 } = await supabase.from('wa_conversas').select('*').eq('lead_id', ld[0].id).limit(1)
          if (c2 && c2[0]) conversa = c2[0]
        }
      }
      if (!conversa) {
        const { data: al } = await supabase.from('alunos').select('id').ilike('nome', chatName).limit(1)
        if (al && al[0]) {
          const { data: c3 } = await supabase.from('wa_conversas').select('*').eq('aluno_id', al[0].id).limit(1)
          if (c3 && c3[0]) conversa = c3[0]
        }
      }
    }

    if (!conversa) {
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
    // 23505 = violacao do indice unico (zapi_id repetido = eco do "notificar enviadas"). Ignora.
    if (errMsg && errMsg.code === '23505') return NextResponse.json({ ok: true, skip: 'duplicada (unique)' })

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