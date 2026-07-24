import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTexto, enviarAudio, enviarImagem, enviarDocumento, foneZapi } from '@/lib/zapi'
import { enviarTexto as enviarTextoOf, enviarMidia as enviarMidiaOf, uploadMidia as uploadMidiaOf, foneOficial } from '@/lib/whatsapp-oficial'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { telefone, texto, audioBase64, anexoBase64, anexoNome, anexoTipo, anexoExt, leadId, chatLid, enviadoPor } = body
    const org = await orgDaRequest(req.headers.get('authorization'))

    let fone = (telefone || '').toString()
    let leadInfo: any = null

    if (leadId) {
      const { data: lead } = await supabase.from('leads').select('id, nome, whatsapp').eq('org_id', org).eq('id', leadId).single()
      if (lead) { leadInfo = lead; if (!fone) fone = lead.whatsapp || '' }
    }
    fone = foneZapi(fone)
    if (!fone && !chatLid) return NextResponse.json({ ok: false, error: 'telefone invalido' }, { status: 400 })
    if (!texto && !audioBase64 && !anexoBase64) return NextResponse.json({ ok: false, error: 'nada pra enviar' }, { status: 400 })

    // ─── ROTEAMENTO DE CANAL ───
    // Detecta a conversa ATIVA do lead (a mais recente, qualquer canal). Se for do
    // canal OFICIAL (número novo / Cloud API), responde por lá — livre dentro das 24h,
    // sem passar pelo guardrail do Z-API. Caso contrário, segue no Z-API abaixo.
    let convAtiva: any = null
    if (leadId) {
      const { data } = await supabase.from('wa_conversas').select('*').eq('org_id', org).eq('lead_id', leadId).order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(1)
      if (data && data[0]) convAtiva = data[0]
    }
    if (!convAtiva && fone) {
      const foneOf = foneOficial(fone)
      const { data } = await supabase.from('wa_conversas').select('*').eq('org_id', org).in('telefone', [fone, foneOf]).order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(1)
      if (data && data[0]) convAtiva = data[0]
    }

    if (convAtiva?.canal === 'oficial') {
      const to = convAtiva.telefone || foneOficial(fone)
      let ro: { ok: boolean; wamid?: string | null; error?: string }
      let tipoMsg = 'texto'
      let midiaMime: string | null = null
      const dataUrl: string | null = audioBase64 || anexoBase64 || null
      if (dataUrl) {
        const mm = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
        if (!mm) return NextResponse.json({ ok: false, error: 'mídia inválida' }, { status: 200 })
        midiaMime = mm[1]
        const buffer = Buffer.from(mm[2], 'base64')
        const ehAudio = !!audioBase64
        const tipoEnvio = ehAudio ? 'audio' : (anexoTipo === 'imagem' ? 'image' : 'document')
        const up = await uploadMidiaOf(buffer, midiaMime, anexoNome || (ehAudio ? 'audio.ogg' : 'arquivo'))
        if (!up.ok || !up.id) return NextResponse.json({ ok: false, error: 'falha no upload: ' + up.error }, { status: 200 })
        ro = await enviarMidiaOf(to, tipoEnvio, up.id, texto?.trim() || undefined, anexoNome)
        tipoMsg = ehAudio ? 'audio' : (anexoTipo === 'imagem' ? 'imagem' : 'documento')
      } else {
        ro = await enviarTextoOf(to, (texto || '').trim())
      }
      if (!ro.ok) return NextResponse.json({ ok: false, error: ro.error || 'falha ao enviar', foraJanela: /131047|24|re-?engage|template/i.test(ro.error || '') }, { status: 200 })
      await supabase.from('wa_mensagens').insert({
        org_id: org, conversa_id: convAtiva.id, zapi_id: ro.wamid || null, direcao: 'enviada',
        tipo: tipoMsg, texto: tipoMsg === 'documento' ? (anexoNome || null) : (texto?.trim() || null),
        midia_url: dataUrl, midia_mime: midiaMime, status: 'enviada', canal: 'oficial', enviado_por: enviadoPor || null,
      })
      const resumoOf = tipoMsg === 'imagem' ? '📷 Imagem' : tipoMsg === 'documento' ? `📎 ${anexoNome || 'documento'}` : tipoMsg === 'audio' ? '🎤 Áudio' : (texto || '').trim()
      await supabase.from('wa_conversas').update({ ultima_msg: (resumoOf || '').slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', convAtiva.id)
      return NextResponse.json({ ok: true, conversaId: convAtiva.id, canal: 'oficial' })
    }

    // (Limite diário/por-minuto de contatos REMOVIDO — era proteção anti-ban do número Z-API.
    //  Com o atendimento no número OFICIAL, esse teto só atrapalhava. Envios livres.)

    // Alvo do envio: número real (10–13 dígitos) usa o número; senão usa o @lid
    // (do chatLid salvo, ou reconstruído dos dígitos do id). Z-API aceita @lid.
    const foneDigits = fone.replace(/\D/g, '')
    let alvo: string
    if (foneDigits.length >= 10 && foneDigits.length <= 13) alvo = fone
    else if (chatLid) alvo = chatLid.toString()
    else if (foneDigits.length > 13) alvo = `${foneDigits}@lid`
    else alvo = fone

    // Envia pelo Z-API
    let r
    if (anexoBase64) {
      if (anexoTipo === 'imagem') r = await enviarImagem(alvo, anexoBase64, texto || '')
      else r = await enviarDocumento(alvo, anexoBase64, anexoNome || 'arquivo', anexoExt || 'pdf')
    } else if (audioBase64) {
      r = await enviarAudio(alvo, audioBase64)
    } else {
      r = await enviarTexto(alvo, texto)
    }
    if (!r.ok) return NextResponse.json(r, { status: 200 })

    // Acha a conversa: PRIMEIRO pelo lead (fonte da verdade), depois por telefone exato
    let conversa: any = null
    if (leadInfo || leadId) {
      const lid = leadInfo ? leadInfo.id : leadId
      const { data: porLead } = await supabase.from('wa_conversas').select('*').eq('org_id', org).eq('lead_id', lid).eq('canal', 'zapi').order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(1)
      if (porLead && porLead[0]) conversa = porLead[0]
    }
    if (!conversa) {
      const { data: porFone } = await supabase.from('wa_conversas').select('*').eq('org_id', org).eq('telefone', fone).eq('canal', 'zapi').maybeSingle()
      conversa = porFone || null
    }
    if (!conversa) {
      const { data: nova } = await supabase.from('wa_conversas').insert({
        org_id: org,
        telefone: fone,
        nome: leadInfo ? leadInfo.nome : null,
        lead_id: leadInfo ? leadInfo.id : (leadId || null),
        canal: 'zapi',
      }).select().single()
      conversa = nova
    }

    if (conversa) {
      const tipoMsg = anexoBase64 ? (anexoTipo === 'imagem' ? 'imagem' : 'documento') : (audioBase64 ? 'audio' : 'texto')
      await supabase.from('wa_mensagens').insert({
        org_id: org,
        conversa_id: conversa.id,
        zapi_id: r.id,
        direcao: 'enviada',
        tipo: tipoMsg,
        texto: tipoMsg === 'documento' ? (anexoNome || null) : (texto || null),
        midia_url: anexoBase64 || audioBase64 || null,
        midia_mime: anexoBase64 ? (anexoTipo === 'imagem' ? 'image/*' : 'application/octet-stream') : (audioBase64 ? 'audio/ogg' : null),
        status: 'enviada',
        enviado_por: enviadoPor || null,
      })
      const resumoMsg = tipoMsg === 'imagem' ? '📷 Imagem' : tipoMsg === 'documento' ? `📎 ${anexoNome || 'documento'}` : tipoMsg === 'audio' ? '🎤 Áudio' : texto
      await supabase.from('wa_conversas').update({
        ultima_msg: resumoMsg,
        ultima_msg_em: new Date().toISOString(),
      }).eq('id', conversa.id)
    }

    return NextResponse.json({ ok: true, conversaId: conversa ? conversa.id : null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}