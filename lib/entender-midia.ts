import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { baixarMidia } from '@/lib/whatsapp-oficial'
import Anthropic from '@anthropic-ai/sdk'

// ENTENDE a mídia recebida do cliente e escreve em texto (pro copiloto ler no contexto):
//  • ÁUDIO → transcreve (Deepgram) → "🎤 ..."  (a resposta ao áudio vai pro TIME, mas a IA entende o conteúdo)
//  • IMAGEM → descreve (Claude vision) → "🖼️ [imagem] ..." (a IA LÊ e pode responder)
// Idempotente: só processa mídia recebida ainda sem texto.
const idDe = (url: string) => (url || '').match(/id=([^&]+)/)?.[1] || ''

export async function entenderMidia(conversaId: string): Promise<void> {
  try {
    const { data: msgs } = await sb.from('wa_mensagens').select('id, tipo, midia_url, texto, direcao, status').eq('conversa_id', conversaId).in('tipo', ['audio', 'imagem']).order('criado_em', { ascending: false }).limit(12)
    const pend = (msgs || []).filter((m: any) => (m.direcao === 'recebida' || m.status === 'recebida') && m.midia_url && !(m.texto || '').trim())
    for (const m of pend) {
      const id = idDe(m.midia_url); if (!id) continue
      const dl = await baixarMidia(id); if (!dl.ok || !dl.buffer) continue
      const buf = Buffer.from(dl.buffer)
      if (m.tipo === 'audio') {
        const dg = process.env.DEEPGRAM_API_KEY; if (!dg) continue
        const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true', { method: 'POST', headers: { Authorization: 'Token ' + dg, 'Content-Type': dl.mime || 'audio/ogg' }, body: buf })
        const j = await r.json().catch(() => null)
        const tx = (j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
        if (tx) await sb.from('wa_mensagens').update({ texto: '🎤 ' + tx }).eq('id', m.id)
      } else if (m.tipo === 'imagem') {
        const key = process.env.ANTHROPIC_API_KEY; if (!key) continue
        const client = new Anthropic({ apiKey: key })
        const mime = (dl.mime || 'image/jpeg').split(';')[0]
        const resp = await client.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 300,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mime as any, data: buf.toString('base64') } },
            { type: 'text', text: 'Descreva em 1-2 frases, em português direto, o que há nesta imagem que um VENDEDOR precisa saber pra atender. Se for comprovante de pagamento, diga o VALOR e a forma. Se for print de dúvida/conversa, resuma a dúvida. Se for foto pessoal/produto, diga o que é. Não invente.' },
          ] }],
        })
        const desc = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
        if (desc) await sb.from('wa_mensagens').update({ texto: '🖼️ [imagem] ' + desc }).eq('id', m.id)
      }
    }
  } catch { /* não quebra o atendimento */ }
}
