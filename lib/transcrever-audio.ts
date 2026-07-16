import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Transcreve um áudio de mensagem do WhatsApp (wa_mensagens) via Deepgram e guarda no PRÓPRIO `texto`
// — assim o motor de IA, a fila e a conversa já leem automaticamente, sem outra mudança. Não lança.
export async function transcreverAudioMsg(msgId: string): Promise<string | null> {
  try {
    const dgKey = process.env.DEEPGRAM_API_KEY || ''
    if (!dgKey) return null
    const { data: m } = await sb.from('wa_mensagens').select('id, tipo, texto, midia_url, midia_mime').eq('id', msgId).maybeSingle()
    if (!m || m.tipo !== 'audio' || !m.midia_url) return null
    if (m.texto && m.texto.trim()) return m.texto // já tem texto/transcrição
    // Pega os BYTES do áudio: data URI (nossos áudios enviados) = decodifica base64; senão baixa a URL.
    let buf: Buffer, ct: string
    if (m.midia_url.startsWith('data:')) {
      const virg = m.midia_url.indexOf(',')
      ct = (m.midia_url.slice(5, virg).split(';')[0]) || m.midia_mime || 'audio/ogg'
      buf = Buffer.from(m.midia_url.slice(virg + 1), 'base64')
    } else {
      const dl = await fetch(m.midia_url)
      if (!dl.ok) return null
      ct = dl.headers.get('content-type') || m.midia_mime || 'audio/ogg'
      buf = Buffer.from(await dl.arrayBuffer())
    }
    if (!buf.length) return null
    const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true', {
      method: 'POST', headers: { Authorization: `Token ${dgKey}`, 'Content-Type': ct }, body: buf,
    })
    const j: any = await r.json().catch(() => null)
    const txt = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
    if (!r.ok || typeof txt !== 'string') return null // falha real — tenta depois
    const final = txt.trim() ? `🎤 ${txt.trim()}` : '🎤 (áudio sem fala)'
    await sb.from('wa_mensagens').update({ texto: final }).eq('id', m.id)
    return final
  } catch { return null }
}
