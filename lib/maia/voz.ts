// Maia: resposta em ÁUDIO pro cliente que mandou áudio (08/11, T12 do plano de passagem).
// 08/11 (Guto): era ligado por padrão; desde 12/11 é DESLIGADO (ver vozLigada): cliente que manda áudio recebe a resposta em áudio, sempre que ELEVENLABS_API_KEY existe no
// servidor. Pra desligar: MAIA_VOZ_RESPOSTA=0. Só responde em áudio quando o cliente MANDOU áudio (atendente.ts); texto tem resposta em texto.
// O texto da resposta fica salvo na conversa como "(áudio) <texto>" (canal.ts): o dono lê no painel e a Maia lê no histórico.
// A voz: meta.atendimento.voz_id do negócio, senão MAIA_VOZ_ID (não existe na Vercel), senão a voz padrão da Maia (5QMOJHwbSpbG7akM67Nn).
// O áudio (Ogg Opus, o formato do WhatsApp) fica em maia/<negócio>/clientes/<conversa>/ e vai por link pro cliente.
// Se a ElevenLabs falhar (ou o envio do áudio pela Meta falhar), a resposta vai em texto, como sempre.
import { maiaDb as db } from './db'

// 12/11 (Guto, custo): a Maia responde SÓ em texto. A voz era o maior custo por cliente. Quem manda áudio (cliente ou dono)
// continua sendo entendido (transcrição). Pra religar a voz: MAIA_VOZ_RESPOSTA=1
export const vozLigada = () => process.env.MAIA_VOZ_RESPOSTA === '1' && !!process.env.ELEVENLABS_API_KEY
const vozDo = (neg: any) => String(neg?.meta?.atendimento?.voz_id || process.env.MAIA_VOZ_ID || '5QMOJHwbSpbG7akM67Nn')

// o texto que vira fala: sem link, sem emoji e sem marcações
export const textoFalado = (t: string) => String(t || '').replace(/https?:\/\/\S+/g, '').replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '').replace(/[*_~]/g, '').replace(/\s+/g, ' ').trim()

export async function geraAudio(neg: any, texto: string): Promise<Buffer | null> {
  const k = process.env.ELEVENLABS_API_KEY
  const t = textoFalado(texto)
  if (!k || !t) return null
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vozDo(neg)}?output_format=opus_48000_64`, {
      method: 'POST', headers: { 'xi-api-key': k, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t.slice(0, 900), model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } }),
      signal: AbortSignal.timeout(40000),
    })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return buf.length > 500 ? buf : null
  } catch { return null }
}

// gera e guarda o áudio da resposta; devolve o caminho no armazenamento (ou null: aí vai texto)
export async function audioDaResposta(neg: any, cv: any, texto: string): Promise<string | null> {
  const buf = await geraAudio(neg, texto)
  if (!buf) return null
  await db.evento('voz_resposta', neg.id, { conversa_id: cv.id, caracteres: textoFalado(texto).length })
  return db.sobe(`${neg.id}/clientes/${cv.id}/maia-${Date.now().toString(36)}.ogg`, buf, 'audio/ogg')
}
