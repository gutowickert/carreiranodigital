import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Transcreve um áudio de mensagem do WhatsApp (wa_mensagens) via Deepgram e guarda no PRÓPRIO `texto`
// — assim o motor de IA, a fila e a conversa já leem automaticamente, sem outra mudança. Não lança.
export async function transcreverAudioMsg(msgId: string): Promise<string | null> {
  try {
    const dgKey = process.env.DEEPGRAM_API_KEY || ''
    if (!dgKey) return null
    const { data: m } = await sb.from('wa_mensagens').select('id, tipo, texto, midia_url').eq('id', msgId).maybeSingle()
    if (!m || m.tipo !== 'audio' || !m.midia_url) return null
    if (m.texto && m.texto.trim()) return m.texto // já tem texto/transcrição
    // Deepgram em modo URL (busca o áudio direto da URL da mídia)
    const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true', {
      method: 'POST', headers: { Authorization: `Token ${dgKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: m.midia_url }),
    })
    const j: any = await r.json().catch(() => null)
    const txt = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
    if (!r.ok || typeof txt !== 'string') return null // falha real — tenta depois
    const final = txt.trim() ? `🎤 ${txt.trim()}` : '🎤 (áudio sem fala)'
    await sb.from('wa_mensagens').update({ texto: final }).eq('id', m.id)
    return final
  } catch { return null }
}
