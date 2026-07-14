import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { aplicarRateio } from '@/lib/rateio'
import { sendLead } from '@/lib/capi'
import { enviarPush } from '@/lib/push'
import { lidDoTelefone } from '@/lib/zapi'
import { classificarTemperatura } from '@/lib/temperatura'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const ev = await req.json()

    if (ev.type && ev.type !== 'ReceivedCallback') return NextResponse.json({ ok: true, skip: 'nao e mensagem' })
    if (ev.isNewsletter) return NextResponse.json({ ok: true, skip: 'newsletter' })

    const ehGrupo = !!ev.isGroup
    const rawPhone = (ev.phone || '').toString()
    const ehLid = !ehGrupo && (rawPhone.includes('@lid') || rawPhone.length > 14)
    const telefone = rawPhone.replace(/\D/g, '')
    if (!telefone) return NextResponse.json({ ok: true, skip: 'sem telefone' })

    const zapiId = ev.messageId || null
    const fromMe = !!ev.fromMe
    const chatName = ev.chatName || null
    const chatLid = ev.chatLid ? ev.chatLid.toString().replace(/\D/g, '') : null

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

    // Em grupo, prefixa quem falou pra dar contexto na conversa
    if (ehGrupo && !fromMe) {
      const remetente = ev.senderName || ev.participantPhone || ''
      if (texto && remetente) texto = `${remetente}: ${texto}`
    }

    if (zapiId) {
      const { data: ja } = await supabase.from('wa_mensagens').select('id').eq('zapi_id', zapiId).limit(1)
      if (ja && ja.length) return NextResponse.json({ ok: true, skip: 'duplicada' })
    }

    const sufixo = telefone.slice(-8)
    const leadExistente = (ehLid || ehGrupo) ? null : (await supabase.from('leads').select('id, nome').ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1)).data?.[0]
    const aluno = (ehLid || ehGrupo) ? null : (await supabase.from('alunos').select('id, nome').ilike('whatsapp', `%${sufixo}%`).limit(1)).data?.[0]

    // Lead via botão de WhatsApp: a 1ª mensagem traz o CÓDIGO DA TURMA (o mesmo
    // do sistema). Se o número ainda não é lead nem aluno e a mensagem cita um
    // código de turma conhecido, cria o lead completo (turma + rateio + CAPI).
    let leadCriado: { id: string; nome: string | null } | null = null
    if (!fromMe && !ehGrupo && !leadExistente && !aluno && texto) {
      const txtLower = texto.toLowerCase()
      const { data: turmas } = await supabase.from('turmas').select('id, codigo').not('codigo', 'is', null)

      // 1) Casa pelo `ref` (#A1B2C3D4) que o /wa colou na mensagem: é o clique
      // EXATO desta pessoa, então a UTM/criativo vem certinho. Esse é o caminho
      // bom. Se não houver ref (mensagem antiga ou botão direto pro wa.me), cai
      // no fallback por turma mais embaixo.
      const refMatch = texto.match(/#([0-9A-Fa-f]{8})\b/)
      const ref = refMatch ? refMatch[1].toUpperCase() : null
      let click = ref
        ? (await supabase.from('wa_clicks')
            .select('*').eq('ref', ref).is('consumido_em', null)
            .order('criado_em', { ascending: false }).limit(1).maybeSingle()).data
        : null

      // A turma vem do clique (quando casou por ref) ou do código no texto.
      const acharTurma = (cod?: string | null) =>
        (turmas || []).find(t => t.codigo && cod && t.codigo.toLowerCase() === cod.toLowerCase())
      const turmaPorTexto = (turmas || []).find(t => t.codigo && t.codigo.length >= 4 && txtLower.includes(t.codigo.toLowerCase()))
      const turmaMatch = (click ? acharTurma(click.codigo_turma) : null) || turmaPorTexto
      if (turmaMatch) {
        // Fallback (sem ref): pega o clique mais recente não-consumido da turma.
        if (!click) {
          const { data } = await supabase.from('wa_clicks')
            .select('*').eq('codigo_turma', turmaMatch.codigo).is('consumido_em', null)
            .order('criado_em', { ascending: false }).limit(1).maybeSingle()
          click = data || null
        }
        const vendedorId = await aplicarRateio(supabase, turmaMatch.id)
        const nomeLead = chatName || ev.senderName || null
        const { data: novoLead } = await supabase.from('leads').insert({
          nome: nomeLead || 'Lead WhatsApp',
          whatsapp: telefone,
          turma_id: turmaMatch.id,
          codigo_turma: turmaMatch.codigo,
          vendedor_id: vendedorId,
          etapa: 'aguardando_atendimento',
          origem: 'whatsapp',
          fbclid: click?.fbclid ?? null,
          fbc: click?.fbc ?? null,
          fbp: click?.fbp ?? null,
          utm_source: click?.utm_source ?? null,
          utm_medium: click?.utm_medium ?? null,
          utm_campaign: click?.utm_campaign ?? null,
          utm_content: click?.utm_content ?? null,
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
          // 1ª tarefa do funil na chegada — SEGURADA até a equipe testar a cadência no simulador.
          // (quando ligar: descomente o import e a linha; já lê o fluxo EDITÁVEL do Agente Interno)
          // await gerarPrimeira(supabase, novoLead.id, 'aguardando_atendimento', novoLead.nome || 'Lead', vendedorId)
          // CAPI Lead. Telefone só entra se não for @lid (senão o hash é lixo). Falha não quebra.
          try {
            const capi = await sendLead({
              eventId: click?.event_id || randomUUID(),
              eventSourceUrl: click?.event_source_url,
              phone: ehLid ? null : telefone,
              firstName: nomeLead,
              fbc: click?.fbc,
              fbp: click?.fbp,
              clientIp: click?.client_ip,
              userAgent: click?.user_agent,
              externalId: novoLead.id,
              codigoTurma: turmaMatch.codigo,
            })
            if (!capi.ok) console.error('CAPI Lead (WhatsApp) falhou:', capi.error)
          } catch (e) { console.error('CAPI Lead (WhatsApp) exception:', e) }
          if (click) {
            await supabase.from('wa_clicks').update({
              consumido_em: new Date().toISOString(),
              lead_id: novoLead.id,
            }).eq('id', click.id)
          }
        }
      }
    }

    const lead = leadCriado || leadExistente

    let conversa: any = null
    let conversaCriada = false
    // 1) casa pelo chatLid (identificador estável) — une recebida (nº real) com enviada (@lid)
    if (chatLid) {
      const { data: porLid } = await supabase.from('wa_conversas').select('*').eq('chat_lid', chatLid).maybeSingle()
      conversa = porLid || null
    }
    // 1b) mensagem enviada do CELULAR (@lid): casa pelo @lid guardado na conversa do número real
    if (!conversa && ehLid) {
      const { data: porLidGuardado } = await supabase.from('wa_conversas').select('*').eq('chat_lid', telefone).maybeSingle()
      conversa = porLidGuardado || null
    }
    // 2) casa pelo telefone exato — nº real ou dígitos do @lid
    if (!conversa) {
      const { data: porFone } = await supabase.from('wa_conversas').select('*').eq('telefone', telefone).eq('canal', 'zapi').maybeSingle()
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
    if (!conversa && !ehLid && !ehGrupo) {
      const { data: c } = await supabase.from('wa_conversas').select('*').ilike('telefone', `%${sufixo}%`).limit(1)
      if (c && c[0]) conversa = c[0]
    }
    if (!conversa && chatName && !ehGrupo) {
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
      const nome = chatName || (lead && lead.nome) || (aluno && aluno.nome) || (!fromMe ? ev.senderName : null) || null
      const { data: nova, error: errNova } = await supabase.from('wa_conversas').insert({
        telefone,
        nome,
        lead_id: lead ? lead.id : null,
        aluno_id: aluno ? aluno.id : null,
      }).select().single()
      if (errNova) console.log('ZAPI erro criar conversa:', errNova.message)
      conversa = nova
      conversaCriada = !!nova
      // marca grupo num passo separado pra não quebrar a criação caso a coluna não exista
      if (conversa && ehGrupo) {
        await supabase.from('wa_conversas').update({ eh_grupo: true }).eq('id', conversa.id)
      }
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

    // guarda o @lid na conversa pra casar as mensagens enviadas do CELULAR (que chegam só com @lid)
    if (chatLid && !conversa.chat_lid) {
      await supabase.from('wa_conversas').update({ chat_lid: chatLid }).eq('id', conversa.id)
    } else if (conversaCriada && !conversa.chat_lid && !ehLid && !ehGrupo && telefone) {
      // conversa nova de número real: resolve o @lid no Z-API e guarda (best-effort; falha não quebra)
      try {
        const lid = await lidDoTelefone(telefone)
        if (lid) await supabase.from('wa_conversas').update({ chat_lid: lid }).eq('id', conversa.id)
      } catch { /* ignore */ }
    }

    // Auto-vincula conversa @lid (sem lead) a um lead pelo NOME do contato,
    // quando há exatamente um lead com aquele nome. Resolve a conversa duplicada
    // (card do lead × caixa) que o @lid cria por esconder o número real.
    let leadVinc: any = lead
    if (!leadVinc && !conversa.lead_id && chatName && !chatName.includes('@lid')) {
      const { data: porNome } = await supabase.from('leads').select('id').ilike('nome', chatName).limit(2)
      if (porNome && porNome.length === 1) leadVinc = porNome[0]
    }

    const resumo = texto || (tipo === 'imagem' ? '📷 Imagem' : tipo === 'audio' ? '🎤 Áudio' : tipo === 'video' ? '🎬 Vídeo' : '📎 Documento')
    await supabase.from('wa_conversas').update({
      ultima_msg: resumo,
      ultima_msg_em: new Date().toISOString(),
      nao_lidas: fromMe ? (conversa.nao_lidas || 0) : (conversa.nao_lidas || 0) + 1,
      nome: conversa.nome || chatName || null,
      lead_id: conversa.lead_id || (leadVinc ? leadVinc.id : null),
    }).eq('id', conversa.id)

    // Notificação no celular (push) quando chega mensagem de cliente
    if (!fromMe && !ehGrupo) {
      try {
        const nomeContato = conversa.nome || chatName || telefone
        await enviarPush('Nova mensagem 💬', `${nomeContato}: ${resumo}`, '/dashboard/whatsapp')
      } catch { /* ignore */ }
    }

    // [TEMP] diagnóstico de mensagens enviadas (fromMe): onde caiu. Remover depois.
    if (fromMe) {
      try {
        await supabase.from('webhook_logs').insert({
          origem: 'zapi-debug',
          evento: `conv=${conversa.id} criada=${conversaCriada} lid=${chatLid || ''} tel=${telefone} nome=${chatName || ''} err=${(errMsg && errMsg.code) || ''}`,
          payload: ev,
          status: 'recebido',
        })
      } catch { /* ignore */ }
    }

    // Atualiza a temperatura do lead (quente/morno/frio) após mensagem do CLIENTE
    const leadTemp = conversa.lead_id || (leadVinc ? leadVinc.id : null)
    if (!fromMe && !ehGrupo && leadTemp) { await classificarTemperatura(leadTemp, conversa.id) }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.log('ZAPI catch:', (e && e.message) || 'erro')
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}