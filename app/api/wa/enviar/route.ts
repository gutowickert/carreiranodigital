import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTexto, enviarAudio, enviarImagem, enviarDocumento, foneZapi } from '@/lib/zapi'

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