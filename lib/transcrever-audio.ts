import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { baixarMidia } from '@/lib/whatsapp-oficial'

// Transcreve um áudio de mensagem do WhatsApp (wa_mensagens) via Deepgram e guarda no PRÓPRIO `texto`
// — assim o motor de IA, a fila e a conversa já leem automaticamente, sem outra mudança. Não lança.
// PALAVRAS QUE O TRANSCRITOR NÃO CONHECE. Sem esta lista ele escreve o que parece: "Claude" virava
// "cloud" nas ligações, e o erro seguia adiante — chegou a sair numa proposta, no título de uma
// objeção ("não sabe mexer no Claude/cloud"). O Deepgram aceita um reforço por palavra; o número
// depois dos dois-pontos é o peso.
const TERMOS = ['Claude:2', 'Hotmart:2', 'Kiwify:2', 'Meta:1', 'Reels:1', 'tráfego:1']
const REFORCO = TERMOS.map(t => `&keywords=${encodeURIComponent(t)}`).join('')

export async function transcreverAudioMsg(msgId: string): Promise<string | null> {
  try {
    const dgKey = process.env.DEEPGRAM_API_KEY || ''
    if (!dgKey) return null
    const { data: m } = await sb.from('wa_mensagens').select('id, tipo, texto, midia_url, midia_mime').eq('id', msgId).maybeSingle()
    if (!m || m.tipo !== 'audio' || !m.midia_url) return null
    if (m.texto && m.texto.trim()) return m.texto // já tem texto/transcrição
    // Pega os BYTES do áudio: data URI (nossos áudios enviados) = decodifica base64; senão baixa a URL.
    let buf: Buffer, ct: string
    const idOficial = m.midia_url.startsWith('/api/wa-oficial/midia') ? (m.midia_url.match(/id=([^&]+)/)?.[1] || '') : ''
    if (m.midia_url.startsWith('data:')) {
      const virg = m.midia_url.indexOf(',')
      ct = (m.midia_url.slice(5, virg).split(';')[0]) || m.midia_mime || 'audio/ogg'
      buf = Buffer.from(m.midia_url.slice(virg + 1), 'base64')
    } else if (idOficial) {
      // ⚠️ O ÁUDIO DO WHATSAPP OFICIAL NÃO SE BAIXA POR URL. O que fica gravado é um caminho
      // RELATIVO do nosso próprio proxy (/api/wa-oficial/midia?id=…), que só existe pro navegador
      // — do servidor, esse fetch não vai a lugar nenhum. Por isso todo áudio do canal oficial
      // ficava mudo: o transcritor era chamado, tentava baixar e desistia calado. Aqui a mídia vem
      // pela Meta, pelo id, que é como ela é servida de verdade.
      const dl = await baixarMidia(idOficial)
      if (!dl.ok || !dl.buffer) return null
      ct = (dl.mime || m.midia_mime || 'audio/ogg').split(';')[0]
      buf = Buffer.from(dl.buffer)
    } else {
      const dl = await fetch(m.midia_url)
      if (!dl.ok) return null
      ct = dl.headers.get('content-type') || m.midia_mime || 'audio/ogg'
      buf = Buffer.from(await dl.arrayBuffer())
    }
    if (!buf.length) return null
    const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true' + REFORCO, {
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

/**
 * Transcreve TODO áudio ainda mudo das conversas de um lead — nos DOIS sentidos.
 *
 * ⚠️ O ÁUDIO QUE NÓS MANDAMOS VALE TANTO QUANTO O QUE O CLIENTE MANDA. Quem escreve proposta
 * precisa do que foi PROMETIDO, e a promessa sai da nossa boca: o preço falado, o prazo, o que
 * está incluso. O `entenderMidia` só olha o que chega, porque a função dele é a IA entender o
 * cliente — outra pergunta. Aqui a pergunta é "o que foi combinado nesta conversa".
 *
 * ⚠️ E NÃO DEPENDE DA IA TER ATENDIDO. A transcrição só acontecia quando a IA entrava na conversa
 * ou o copiloto rodava. Lead atendido na mão — que é o caso de todo lead quente — chegava na hora
 * da proposta com os áudios mudos, e a IA escrevia em cima de quatro mensagens de texto soltas.
 * Era o caso do Patrick Rosa: 6 áudios, nenhum transcrito.
 */
export async function transcreverAudiosDoLead(org: string, leadId: string, limite = 40): Promise<{ transcritos: number; pendentes: number }> {
  const { data: convs } = await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', leadId)
  const ids = (convs || []).map((c: any) => c.id)
  if (!ids.length) return { transcritos: 0, pendentes: 0 }

  const { data: msgs } = await sb.from('wa_mensagens')
    .select('id, texto').eq('tipo', 'audio').in('conversa_id', ids)
    .order('criado_em', { ascending: false }).limit(limite)

  const mudos = (msgs || []).filter((m: any) => !(m.texto || '').trim())
  let transcritos = 0
  for (const m of mudos) if (await transcreverAudioMsg(m.id)) transcritos++
  return { transcritos, pendentes: mudos.length - transcritos }
}
