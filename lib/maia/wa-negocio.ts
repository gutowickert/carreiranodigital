// Maia: o WhatsApp do PRÓPRIO negócio (05/11, pro Tech Provider). Cada negócio conecta o número dele pelo cadastro
// incorporado (Embedded Signup); o número fica em negocios.wa_phone_id e a chave em negocios.meta.wa.token.
// Daí a Maia atende os clientes do negócio por esse número, com a chave dele. Os eventos chegam em /api/maia/whats/webhook.
// Trava: só sai mensagem pra cliente com MAIA_CLIENTES_LIGADO=1 E o atendimento ligado no negócio (meta.wa.atende = true),
// que a equipe liga no painel depois de testar.
// 07/11: a chave fica cifrada no banco quando há MAIA_CRIPTO_CHAVE (lib/maia/segredo.ts)
import { tokenWa } from './segredo'

const GRAPH = 'https://graph.facebook.com/v25.0'

export type WaNegocio = { phone: string; token: string; waba?: string | null }
export const waDoNegocio = (neg: any): WaNegocio | null => {
  const token = neg?.wa_phone_id ? tokenWa(neg) : ''
  return token ? { phone: String(neg.wa_phone_id), token, waba: neg.meta?.wa?.waba_id || null } : null
}
export const atendimentoLigado = (neg: any) => process.env.MAIA_CLIENTES_LIGADO === '1' && neg?.meta?.wa?.atende === true && !!waDoNegocio(neg)

type Envio = { ok: boolean; wamid?: string; erro?: string; codigo?: number }
const so = (t: string) => String(t || '').replace(/\D/g, '')

async function manda(w: WaNegocio, corpo: any): Promise<Envio> {
  try {
    const r = await fetch(`${GRAPH}/${w.phone}/messages`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + w.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }), signal: AbortSignal.timeout(15000),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, erro: String(j?.error?.message || JSON.stringify(j)).slice(0, 300), codigo: j?.error?.code }
    return { ok: true, wamid: j?.messages?.[0]?.id }
  } catch (e: any) { return { ok: false, erro: e?.message || 'falha no envio' } }
}

export const enviaTextoNeg = (w: WaNegocio, para: string, texto: string) => manda(w, { to: so(para), type: 'text', text: { body: texto.slice(0, 4000), preview_url: /https?:\/\//.test(texto) } })
export const enviaImagemNeg = (w: WaNegocio, para: string, link: string, legenda?: string) => manda(w, { to: so(para), type: 'image', image: { link, ...(legenda ? { caption: legenda.slice(0, 1000) } : {}) } })
export const enviaVideoNeg = (w: WaNegocio, para: string, link: string, legenda?: string) => manda(w, { to: so(para), type: 'video', video: { link, ...(legenda ? { caption: legenda.slice(0, 1000) } : {}) } })
export const marcaLidaNeg = (w: WaNegocio, wamid: string) => manda(w, { status: 'read', message_id: wamid })
export function enviaModeloNeg(w: WaNegocio, para: string, nome: string, corpo: string[], idioma = 'pt_BR') {
  const components = corpo.length ? [{ type: 'body', parameters: corpo.map(t => ({ type: 'text', text: String(t).replace(/[\n\t]+/g, ' ').slice(0, 900) })) }] : []
  return manda(w, { to: so(para), type: 'template', template: { name: nome, language: { code: idioma }, ...(components.length ? { components } : {}) } })
}

// mídia que o cliente mandou pro número do negócio
export async function baixaMidiaNeg(w: WaNegocio, id: string) {
  const r = await fetch(`${GRAPH}/${id}`, { headers: { Authorization: 'Bearer ' + w.token }, signal: AbortSignal.timeout(15000) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j.url) throw new Error('mídia: ' + (j?.error?.message || r.status))
  const b = await fetch(j.url, { headers: { Authorization: 'Bearer ' + w.token }, signal: AbortSignal.timeout(30000) })
  if (!b.ok) throw new Error('mídia: download ' + b.status)
  return { buf: Buffer.from(await b.arrayBuffer()), mime: String(j.mime_type || b.headers.get('content-type') || 'image/jpeg') }
}
