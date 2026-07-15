import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Baixa a gravação da API4COM (tenta várias estratégias de auth) e transcreve via Deepgram.
// Cacheia em ligacoes.metadata.transcricao. Não lança — retorna o texto ou null.

async function baixar(url: string, token: string) {
  const tentativas: { url?: string; headers?: any }[] = [
    { headers: { Authorization: token } },
    { headers: { Authorization: `Bearer ${token}` } },
    { headers: {} },
    { url: url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) },
  ]
  for (const t of tentativas) {
    try {
      const r = await fetch(t.url || url, { headers: t.headers || {} })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.includes('audio') || ct.includes('octet') || ct.includes('mpeg'))) {
        return { ok: true as const, buf: Buffer.from(await r.arrayBuffer()), ct }
      }
    } catch { /* tenta a próxima */ }
  }
  return { ok: false as const }
}

export async function transcreverLigacao(ligacaoId: string): Promise<string | null> {
  try {
    const token = process.env.API4COM_TOKEN || ''
    const dgKey = process.env.DEEPGRAM_API_KEY || ''
    if (!token || !dgKey) return null
    const { data: l } = await sb.from('ligacoes').select('id, gravacao_url, duracao, metadata').eq('id', ligacaoId).maybeSingle()
    if (!l || !l.gravacao_url || (l.duracao || 0) <= 10) return null
    if (l.metadata && (l.metadata as any).transcrita) return (l.metadata as any).transcricao || null // já processada (mesmo se vazia)
    const b = await baixar(l.gravacao_url, token)
    if (!b.ok) return null
    const tr = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true', {
      method: 'POST', headers: { Authorization: `Token ${dgKey}`, 'Content-Type': b.ct || 'audio/mpeg' }, body: b.buf,
    })
    const j: any = await tr.json().catch(() => null)
    const txt = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
    if (!tr.ok || typeof txt !== 'string') return null // falha real da API — tenta de novo depois
    // marca como PROCESSADA (transcrita:true) mesmo se vier vazia (ligação sem fala), pra não reprocessar eternamente
    await sb.from('ligacoes').update({ metadata: { ...(l.metadata || {}), transcricao: txt.trim(), transcrita: true } }).eq('id', l.id)
    return txt.trim() || null
  } catch { return null }
}
