import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { foneZapi } from '@/lib/zapi'
import { enviarTexto as enviarTextoOf, enviarMidia as enviarMidiaOf, uploadMidia as uploadMidiaOf, foneOficial } from '@/lib/whatsapp-oficial'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { telefone, texto, audioBase64, anexoBase64, anexoNome, anexoTipo, leadId, chatLid, enviadoPor } = body
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

    // ─── ENVIO 100% PELO NÚMERO OFICIAL (Cloud API) ───
    // O Z-API (número antigo) foi DESLIGADO — todo envio vai pelo oficial agora.
    // Fora da janela de 24h (cliente não respondeu), o Meta BLOQUEIA o texto livre →
    // devolvemos `foraJanela: true` pra UI oferecer um TEMPLATE de reabertura.
    const to = foneOficial(fone)
    if (!to) return NextResponse.json({ ok: false, error: 'telefone inválido' }, { status: 200 })

    // acha/cria a conversa OFICIAL do lead (a mensagem cai no card)
    let conversa: any = null
    if (leadId) {
      const { data } = await supabase.from('wa_conversas').select('*').eq('org_id', org).eq('lead_id', leadId).eq('canal', 'oficial').order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(1)
      if (data && data[0]) conversa = data[0]
    }
    if (!conversa) {
      const { data } = await supabase.from('wa_conversas').select('*').eq('org_id', org).eq('telefone', to).eq('canal', 'oficial').maybeSingle()
      conversa = data || null
    }
    if (!conversa) {
      const { data: nova } = await supabase.from('wa_conversas').insert({
        org_id: org, telefone: to, nome: leadInfo ? leadInfo.nome : null,
        lead_id: leadInfo ? leadInfo.id : (leadId || null), canal: 'oficial',
      }).select().single()
      conversa = nova
    }
    if (!conversa) return NextResponse.json({ ok: false, error: 'conversa não criada' }, { status: 200 })

    // envia via Cloud API (texto ou mídia)
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
    if (!ro.ok) return NextResponse.json({ ok: false, error: ro.error || 'falha ao enviar', foraJanela: /131047|131026|131051|re-?engag|template|outside|24\s*hour|janela/i.test(ro.error || '') }, { status: 200 })

    await supabase.from('wa_mensagens').insert({
      org_id: org, conversa_id: conversa.id, zapi_id: ro.wamid || null, direcao: 'enviada',
      tipo: tipoMsg, texto: tipoMsg === 'documento' ? (anexoNome || null) : (texto?.trim() || null),
      midia_url: dataUrl, midia_mime: midiaMime, status: 'enviada', canal: 'oficial', enviado_por: enviadoPor || null,
    })
    const resumoMsg = tipoMsg === 'imagem' ? '📷 Imagem' : tipoMsg === 'documento' ? `📎 ${anexoNome || 'documento'}` : tipoMsg === 'audio' ? '🎤 Áudio' : (texto || '').trim()
    await supabase.from('wa_conversas').update({ ultima_msg: (resumoMsg || '').slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conversa.id)

    return NextResponse.json({ ok: true, conversaId: conversa.id, canal: 'oficial' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
