import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { listarChats, buscarMensagens, foneZapi } from '@/lib/zapi'

export const maxDuration = 300

// Recupera do APARELHO (Z-API /chats + /chat-messages) as conversas que chegaram enquanto o
// WhatsApp esteve desconectado (ban). Grava em wa_conversas/wa_mensagens (dedup por zapi_id) e
// cria/vincula lead pros contatos novos. Processa UMA página de chats por chamada (a tela repete até acabar).

const ms = (v: any) => { let n = Number(v || 0); if (n && n < 1e12) n *= 1000; return n }
const suf = (p: string) => (p || '').replace(/\D/g, '').slice(-8)

function parseMsg(m: any) {
  const zapiId = m.messageId || m.id || null
  if (!zapiId) return null
  const fromMe = !!m.fromMe
  const mo = ms(m.momment || m.moment || m.messageTimestamp)
  let tipo = 'texto', texto: string | null = null, midiaUrl: string | null = null, midiaMime: string | null = null
  if (m.text && m.text.message) texto = m.text.message
  else if (typeof m.text === 'string' && m.text) texto = m.text
  else if (m.image) { tipo = 'imagem'; midiaUrl = m.image.imageUrl || null; midiaMime = m.image.mimeType || 'image/jpeg'; texto = m.image.caption || null }
  else if (m.audio) { tipo = 'audio'; midiaUrl = m.audio.audioUrl || null; midiaMime = m.audio.mimeType || 'audio/ogg' }
  else if (m.video) { tipo = 'video'; midiaUrl = m.video.videoUrl || null; midiaMime = m.video.mimeType || 'video/mp4'; texto = m.video.caption || null }
  else if (m.document) { tipo = 'documento'; midiaUrl = m.document.documentUrl || null; midiaMime = m.document.mimeType || null; texto = m.document.fileName || null }
  else if (m.sticker) { tipo = 'imagem'; midiaUrl = m.sticker.stickerUrl || null; midiaMime = 'image/webp' }
  else if (m.buttonsResponseMessage?.message) texto = m.buttonsResponseMessage.message
  else if (m.listResponseMessage?.message) texto = m.listResponseMessage.message
  else return null
  return { zapiId, fromMe, mo, tipo, texto, midiaUrl, midiaMime }
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    const dias = Math.min(Math.max(Number(b.dias) || 5, 1), 30)
    const page = Math.max(Number(b.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(b.pageSize) || 25, 1), 50)
    const cutoff = Date.now() - dias * 864e5

    const rc = await listarChats(page, pageSize)
    if (!rc.ok) return NextResponse.json({ ok: false, error: 'Z-API /chats falhou: ' + (rc.error || '?') }, { status: 200 })
    const chatsRaw: any[] = Array.isArray(rc.data) ? rc.data : (rc.data?.chats || [])
    // só conversas 1-a-1 dentro da janela
    const naJanela = chatsRaw.filter((ch: any) => !ch.isGroup && ms(ch.lastMessageTime || ch.messageTimestamp || ch.t) >= cutoff)

    let convProcessadas = 0, msgsNovas = 0, leadsCriados = 0, leadsVinculados = 0

    for (const ch of naJanela) {
      const phone = (ch.phone || '').toString().replace(/\D/g, '')
      if (!phone) continue
      const fone = foneZapi(phone)
      const s = suf(phone)
      const nome = ch.name || ch.messageName || null

      const rm = await buscarMensagens(phone, 80)
      const msgsRaw: any[] = Array.isArray(rm.data) ? rm.data : (rm.data?.messages || [])
      const parsed = msgsRaw.map(parseMsg).filter(Boolean).filter((m: any) => m.mo >= cutoff) as any[]
      if (!parsed.length) continue

      // lead: acha por telefone; senão cria (se teve mensagem RECEBIDA e não é aluno)
      let leadId: string | null = null
      if (s.length === 8) {
        const { data: ld } = await sb.from('leads').select('id').eq('org_id', org).ilike('whatsapp', `%${s}`).limit(1).maybeSingle()
        if (ld) leadId = ld.id
      }
      const temRecebida = parsed.some((m: any) => !m.fromMe && (m.texto || m.midiaUrl))
      let ehAluno = false
      if (!leadId && s.length === 8) {
        const { data: al } = await sb.from('alunos').select('id').ilike('whatsapp', `%${s}`).limit(1).maybeSingle()
        ehAluno = !!al
      }
      if (!leadId && temRecebida && !ehAluno) {
        const { data: novo } = await sb.from('leads').insert({ org_id: org, nome: nome || fone, whatsapp: fone, etapa: 'aguardando_atendimento', origem: 'whatsapp' }).select('id').single()
        if (novo) { leadId = novo.id; leadsCriados++ }
      }

      // conversa: acha por telefone/lead; senão cria
      let conversa: any = null
      const byFone = await sb.from('wa_conversas').select('id').eq('org_id', org).eq('telefone', fone).eq('canal', 'zapi').maybeSingle()
      if (byFone.data) conversa = byFone.data
      if (!conversa && leadId) { const c = await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', leadId).eq('canal', 'zapi').limit(1).maybeSingle(); if (c.data) conversa = c.data }
      if (!conversa) {
        const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: fone, nome, lead_id: leadId, canal: 'zapi' }).select('id').single()
        conversa = c.data
      } else if (leadId) {
        await sb.from('wa_conversas').update({ lead_id: leadId }).eq('id', conversa.id).is('lead_id', null)
        leadsVinculados++
      }
      if (!conversa) continue

      // grava mensagens (dedup por zapi_id via upsert ignoreDuplicates)
      const rows = parsed.map((m: any) => ({
        org_id: org, conversa_id: conversa.id, zapi_id: m.zapiId,
        direcao: m.fromMe ? 'enviada' : 'recebida', tipo: m.tipo, texto: m.texto,
        midia_url: m.midiaUrl, midia_mime: m.midiaMime,
        status: m.fromMe ? 'enviada' : 'recebida', criado_em: new Date(m.mo).toISOString(),
      }))
      const { data: ins } = await sb.from('wa_mensagens').upsert(rows, { onConflict: 'zapi_id', ignoreDuplicates: true }).select('id')
      msgsNovas += (ins || []).length

      // atualiza resumo da conversa com a última msg
      const ult = parsed.reduce((a: any, x: any) => (x.mo > a.mo ? x : a), parsed[0])
      const resumo = ult.texto || (ult.tipo === 'imagem' ? '📷 Imagem' : ult.tipo === 'audio' ? '🎤 Áudio' : ult.tipo === 'video' ? '🎬 Vídeo' : '📎 Documento')
      await sb.from('wa_conversas').update({ ultima_msg: (resumo || '').slice(0, 200), ultima_msg_em: new Date(ult.mo).toISOString() }).eq('id', conversa.id)
      convProcessadas++
    }

    const temMais = naJanela.length === chatsRaw.length && chatsRaw.length === pageSize
    return NextResponse.json({ ok: true, pagina: page, convProcessadas, msgsNovas, leadsCriados, leadsVinculados, temMais })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
