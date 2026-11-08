// Maia: o áudio e a foto que o CLIENTE do negócio manda (07/11, piloto). Antes chegavam só como "(mandou um áudio)".
// Agora: o arquivo é guardado na pasta do negócio (maia/<negocio>/clientes/<conversa>/...), o áudio é transcrito (Deepgram,
// a mesma função do dono) e a foto é descrita pela IA (com a marca de COMPROVANTE quando for um).
// Se não der pra ouvir ou ver, o texto vai marcado e a Maia diz com honestidade que não conseguiu (nunca finge).
// Comprovante de pagamento: a Maia NÃO confirma pagamento sozinha: chama o dono (atendente.ts).
// Os arquivos ficam anotados em maia_eventos 'midia_cliente' (conversa e caminho, sem dado pessoal), pra poder apagar (LGPD).
import crypto from 'node:crypto'
import { maiaDb as db, maiaLocal } from './db'
import { emJson } from './ia'

// as marcas que vão no texto da mensagem (a IA e o atendente leem)
export const NAO_OUVIU = '[não deu pra ouvir o áudio]'
export const NAO_VIU = '[não deu pra ver a foto]'
export const COMPROVANTE = '[COMPROVANTE DE PAGAMENTO]'
export const midiaFalhou = (t: string) => String(t || '').includes(NAO_OUVIU) || String(t || '').includes(NAO_VIU)
export const ehComprovante = (t: string) => String(t || '').includes(COMPROVANTE)

// no modo de teste (e só nele) o teste manda o que "seria" a transcrição ou a descrição, sem chamar o Deepgram nem a IA
export type MidiaSimulada = { transcricao?: string; descricao?: string; comprovante?: boolean; falhar?: boolean }
export type MidiaCliente = { buf: Buffer; mime: string; simulado?: MidiaSimulada | null }

async function descreveFotoCliente(buf: Buffer, mime: string, neg: any): Promise<{ descricao: string; comprovante: boolean } | null> {
  try {
    const r = await emJson<{ descricao: string; comprovante: boolean }>(
      'Tu descreves fotos que CLIENTES mandam pro WhatsApp de um pequeno negócio, pra assistente virtual entender o que chegou. Objetivo, em português, até 30 palavras. Se a foto for um comprovante de pagamento (pix, transferência, boleto pago, recibo), marca comprovante true e diz o valor e a data se estiverem legíveis. Não leia em voz alta números de documento ou de conta.',
      `Foto que um cliente mandou pro ${neg.nome} (${neg.nicho || ''}). Devolve {"descricao":"...","comprovante":false}`,
      [{ b64: buf.toString('base64'), mime: /png/.test(mime) ? 'image/png' : /webp/.test(mime) ? 'image/webp' : 'image/jpeg' }])
    return r && r.descricao ? { descricao: String(r.descricao).slice(0, 300), comprovante: r.comprovante === true } : null
  } catch { return null }
}

async function transcreveCliente(buf: Buffer, mime: string): Promise<string> {
  // modo de teste: nunca chama o Deepgram (a não ser que peçam com MAIA_LOCAL_DEEPGRAM=1)
  if (maiaLocal() && process.env.MAIA_LOCAL_DEEPGRAM !== '1') return ''
  try { const { transcreve } = await import('./demo'); return await transcreve(buf, mime) } catch { return '' }
}

// devolve o texto que fica na conversa (o que a Maia "ouviu" ou "viu") e o caminho do arquivo guardado
export async function textoDaMidia(neg: any, cv: any, tipo: 'audio' | 'image', midia: MidiaCliente | null, legenda?: string | null): Promise<{ texto: string; caminho: string | null; comprovante: boolean; falhou: boolean }> {
  const leg = legenda ? ' ' + String(legenda).slice(0, 500) : ''
  if (!midia) return tipo === 'audio' ? { texto: `(mandou um áudio) ${NAO_OUVIU}`, caminho: null, comprovante: false, falhou: true } : { texto: `(mandou uma foto) ${NAO_VIU}${leg}`, caminho: null, comprovante: false, falhou: true }
  const sim = maiaLocal() ? midia.simulado || null : null
  // guarda o arquivo na pasta do negócio (nunca na biblioteca de fotos dos anúncios)
  let caminho: string | null = null
  try {
    const ext = tipo === 'audio' ? (/mpeg|mp3/.test(midia.mime) ? 'mp3' : /mp4|m4a|aac/.test(midia.mime) ? 'm4a' : 'ogg') : /png/.test(midia.mime) ? 'png' : /webp/.test(midia.mime) ? 'webp' : 'jpg'
    caminho = await db.sobe(`${neg.id}/clientes/${cv.id}/${crypto.randomUUID().slice(0, 8)}.${ext}`, midia.buf, midia.mime)
    await db.evento('midia_cliente', neg.id, { conversa_id: cv.id, caminho, tipo, mime: midia.mime })
  } catch { caminho = null }

  if (tipo === 'audio') {
    const t = sim ? (sim.falhar ? '' : String(sim.transcricao || '')) : await transcreveCliente(midia.buf, midia.mime)
    if (!t.trim()) return { texto: `(mandou um áudio) ${NAO_OUVIU}`, caminho, comprovante: false, falhou: true }
    return { texto: '(áudio) ' + t.trim().slice(0, 2000), caminho, comprovante: false, falhou: false }
  }
  const d = sim ? (sim.falhar ? null : { descricao: String(sim.descricao || 'uma foto'), comprovante: sim.comprovante === true }) : await descreveFotoCliente(midia.buf, midia.mime, neg)
  if (!d) return { texto: `(mandou uma foto) ${NAO_VIU}${leg}`, caminho, comprovante: false, falhou: true }
  return { texto: `(mandou uma foto: ${d.comprovante ? COMPROVANTE + ' ' : ''}${d.descricao})${leg}`, caminho, comprovante: d.comprovante, falhou: false }
}
