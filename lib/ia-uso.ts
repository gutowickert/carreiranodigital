import { supabaseAdmin } from '@/lib/supabase-admin'

// Log de uso de IA (tokens) por evento — pra medir custo real por tipo de chamada.
// Grava em webhook_logs (origem='ia-uso'); nunca quebra o fluxo (try/catch).
// Valida a base de custo do SaaS (quanto a IA custa por atendimento/lead).
export async function logIaUso(evento: string, model: string, usage: any, extra?: Record<string, any>) {
  try {
    if (!usage) return
    const inp = usage.input_tokens || 0
    const out = usage.output_tokens || 0
    const cr = usage.cache_read_input_tokens || 0
    const cw = usage.cache_creation_input_tokens || 0
    // custo estimado em USD por modelo (entrada/saída por 1M; cache read ~0.1x, write ~1.25x)
    const P: Record<string, [number, number]> = {
      'claude-sonnet-4-6': [3, 15], 'claude-sonnet-5': [3, 15],
      'claude-haiku-4-5': [1, 5], 'claude-opus-4-8': [5, 25], 'claude-opus-4-6': [5, 25],
    }
    const [pin, pout] = P[model] || [3, 15]
    const custo = (inp * pin + cw * pin * 1.25 + cr * pin * 0.1 + out * pout) / 1_000_000
    await supabaseAdmin.from('webhook_logs').insert({
      origem: 'ia-uso', evento, status: 'processado', // status tem CHECK constraint; o modelo vai no payload
      payload: { model, input: inp, output: out, cache_read: cr, cache_write: cw, custo_usd: Math.round(custo * 1e6) / 1e6, ...(extra || {}) },
    })
  } catch { /* silencioso */ }
}
