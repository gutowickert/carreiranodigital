import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { logIaUso } from '@/lib/ia-uso'

// Classifica a temperatura de compra do lead (quente/morno/frio) via Haiku, a cada mensagem.
// Debounce de 2min por lead pra não reclassificar em rajada. NUNCA quebra o webhook (try/catch total).
export async function classificarTemperatura(leadId?: string, convId?: string) {
  try {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key || !leadId || !convId) return
    const { data: l } = await supabase.from('leads').select('temperatura_em').eq('id', leadId).maybeSingle()
    if (l?.temperatura_em && Date.now() - +new Date(l.temperatura_em) < 120000) return // 2 min

    const { data: msgs } = await supabase.from('wa_mensagens')
      .select('direcao, status, texto, criado_em').eq('conversa_id', convId).order('criado_em', { ascending: false }).limit(14)
    const linhas = (msgs || []).reverse().filter(m => (m.texto || '').trim())
      .map(m => `${(m.direcao === 'recebida' || m.status === 'recebida') ? 'CLIENTE' : 'NÓS'}: ${(m.texto || '').slice(0, 220)}`)
    if (linhas.length < 2) return

    const client = new Anthropic({ apiKey: key })
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 6,
      system: 'Classifique a TEMPERATURA de compra do lead nesta conversa em UMA palavra só: "quente" (quer comprar agora — perguntou preço/forma de pagamento/quando começa, disse quero/como faço), "morno" (interessado mas indeciso ou sem urgência), "frio" (pouco interesse, evasivo, ou sumido). Responda APENAS a palavra.',
      messages: [{ role: 'user', content: linhas.join('\n') }],
    })
    await logIaUso('temperatura', 'claude-haiku-4-5', r.usage, { lead_id: leadId })
    const raw = (r.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').toLowerCase()
    const temp = raw.includes('quente') ? 'quente' : raw.includes('morno') ? 'morno' : raw.includes('frio') ? 'frio' : null
    if (temp) await supabase.from('leads').update({ temperatura: temp, temperatura_em: new Date().toISOString() }).eq('id', leadId)
  } catch { /* nunca derruba o webhook */ }
}
