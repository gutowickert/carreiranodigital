import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { foneOficial } from '@/lib/whatsapp-oficial'

// Webhook da API Oficial (Cloud API): recebe STATUS das mensagens enviadas
// (sent/delivered/read/failed) e atualiza cada envio do disparo pelo wamid.
// Também trata RESPOSTAS: quem manda "SAIR" entra no opt-out.
const VERIFY_TOKEN = process.env.WA_OFICIAL_VERIFY_TOKEN || 'cnd-wa-2026'

// palavras que disparam opt-out (resposta exata, sem acento, minúscula)
const PALAVRAS_OPTOUT = new Set(['sair', 'parar', 'pare', 'cancelar', 'descadastrar', 'remover', 'stop', 'sair.'])
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')

async function registrarOptout(telefone: string) {
  const tel = foneOficial(telefone)
  if (!tel || tel.length < 12) return
  const { data: ja } = await supabase.from('wa_optout').select('telefone').eq('telefone', tel).maybeSingle()
  if (!ja) await supabase.from('wa_optout').insert({ telefone: tel })
  await supabase.from('wa_contatos').update({ status: 'optout', atualizado_em: new Date().toISOString() }).eq('telefone', tel)
}

// Guarda uma RESPOSTA recebida no número de disparo (canal 'oficial'): cria/acha a
// conversa, grava a mensagem e atualiza o funil do contato (respondeu / opt-out).
async function registrarRecebida(m: any, value: any) {
  const tel = foneOficial(m.from || '')
  if (!tel || tel.length < 12) return
  const nome = value?.contacts?.[0]?.profile?.name || null

  let tipo = 'texto'
  let texto: string | null = null
  let midiaUrl: string | null = null
  let midiaMime: string | null = null
  const proxy = (mid: string) => `/api/wa-oficial/midia?id=${mid}`
  if (m.type === 'text') texto = m.text?.body || ''
  else if (m.type === 'image') { tipo = 'imagem'; texto = m.image?.caption || null; midiaMime = m.image?.mime_type || 'image/jpeg'; if (m.image?.id) midiaUrl = proxy(m.image.id) }
  else if (m.type === 'audio' || m.type === 'voice') { tipo = 'audio'; midiaMime = m.audio?.mime_type || 'audio/ogg'; if (m.audio?.id) midiaUrl = proxy(m.audio.id) }
  else if (m.type === 'video') { tipo = 'video'; texto = m.video?.caption || null; midiaMime = m.video?.mime_type || 'video/mp4'; if (m.video?.id) midiaUrl = proxy(m.video.id) }
  else if (m.type === 'document') { tipo = 'documento'; texto = m.document?.filename || 'documento'; midiaMime = m.document?.mime_type || null; if (m.document?.id) midiaUrl = proxy(m.document.id) }
  else if (m.type === 'sticker') { tipo = 'imagem'; midiaMime = 'image/webp'; if (m.sticker?.id) midiaUrl = proxy(m.sticker.id) }
  else if (m.type === 'button') texto = m.button?.text || ''
  else if (m.type === 'interactive') texto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
  else texto = `(${m.type || 'mensagem'})`

  // dedup por wamid (guardado em zapi_id)
  if (m.id) {
    const { data: ja } = await supabase.from('wa_mensagens').select('id').eq('zapi_id', m.id).limit(1)
    if (ja && ja.length) return
  }

  // acha/cria a conversa do canal oficial
  let { data: conv } = await supabase.from('wa_conversas').select('*').eq('telefone', tel).eq('canal', 'oficial').maybeSingle()
  if (!conv) {
    const { data: nova } = await supabase.from('wa_conversas').insert({ telefone: tel, nome, canal: 'oficial' }).select().single()
    conv = nova
  }
  if (!conv) return

  await supabase.from('wa_mensagens').insert({
    conversa_id: conv.id, zapi_id: m.id || null, direcao: 'recebida',
    tipo, texto, midia_url: midiaUrl, midia_mime: midiaMime, status: 'recebida', canal: 'oficial',
  })
  const resumo = texto || (tipo === 'imagem' ? '📷 Imagem' : tipo === 'audio' ? '🎤 Áudio' : tipo === 'video' ? '🎬 Vídeo' : tipo === 'documento' ? '📎 Documento' : '')
  await supabase.from('wa_conversas').update({
    ultima_msg: resumo.slice(0, 200), ultima_msg_em: new Date().toISOString(),
    nao_lidas: (conv.nao_lidas || 0) + 1, nome: conv.nome || nome || null,
  }).eq('id', conv.id)

  // funil do contato frio: "SAIR" => opt-out; qualquer outra resposta => respondeu
  const limpo = semAcento((m.text?.body || '').trim().toLowerCase())
  if (PALAVRAS_OPTOUT.has(limpo)) await registrarOptout(tel)
  else await supabase.from('wa_contatos').update({ status: 'respondeu', atualizado_em: new Date().toISOString() }).eq('telefone', tel).neq('status', 'optout')
}

// Verificação do webhook (a Meta chama via GET ao configurar)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || '', { status: 200 })
  }
  return new NextResponse('forbidden', { status: 403 })
}

const MAP: Record<string, string> = { sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'falha' }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const entries = body.entry || []
    for (const e of entries) {
      for (const ch of (e.changes || [])) {
        // respostas recebidas: guarda na caixa "WhatsApp Disparos" + funil (respondeu/opt-out)
        for (const m of (ch.value?.messages || [])) {
          if (m.from) await registrarRecebida(m, ch.value)
        }
        const statuses = ch.value?.statuses || []
        for (const st of statuses) {
          const wamid = st.id
          const novo = MAP[st.status] || st.status
          const erro = (st.errors && st.errors[0]) ? `${st.errors[0].code || ''} ${st.errors[0].title || st.errors[0].message || ''}`.trim() : null
          if (!wamid) continue
          const patch: any = { status: novo, atualizado_em: new Date().toISOString() }
          if (erro) patch.erro = erro
          await supabase.from('wa_disparo_envios').update(patch).eq('wamid', wamid)
        }
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
