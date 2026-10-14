// Oito Posts: o WhatsApp de venda (14/10). Um número só pras marcas, separado do número da escola.
// Cloud API da Meta. O número fica numa conta de WhatsApp própria (WABA), no mesmo gerenciador da escola,
// e os eventos dela chegam em /api/oito/whats/webhook (endereço próprio, configurado na WABA): o webhook da escola não vê nada.
// Variáveis: OITO_WA_PHONE_ID (o número), OITO_WA_WABA_ID (a conta, pros modelos), OITO_WA_TOKEN (se não houver, usa o WA_OFICIAL_TOKEN da escola).
import { oitoDb as db } from './db'

const GRAPH = 'https://graph.facebook.com/v25.0'
const TOKEN = () => process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || ''
const PHONE = () => process.env.OITO_WA_PHONE_ID || ''
export const waLigado = () => !!(TOKEN() && PHONE())

// só dígitos; número brasileiro sem DDI ganha o 55
export function fone(raw: string) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d && d.length >= 10 && d.length <= 11) d = '55' + d
  return d
}

async function manda(corpo: any) {
  if (!waLigado()) return { ok: false, erro: 'WhatsApp do Oito não configurado (OITO_WA_PHONE_ID)' }
  try {
    const r = await fetch(`${GRAPH}/${PHONE()}/messages`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }), signal: AbortSignal.timeout(15000),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, erro: String(j?.error?.message || JSON.stringify(j)).slice(0, 300), codigo: j?.error?.code }
    return { ok: true, wamid: j?.messages?.[0]?.id as string | undefined }
  } catch (e: any) { return { ok: false, erro: e?.message || 'falha no envio' } }
}

export const enviaTexto = (para: string, texto: string) => manda({ to: fone(para), type: 'text', text: { body: texto.slice(0, 4000), preview_url: /https?:\/\//.test(texto) } })

export function enviaModelo(para: string, nome: string, idioma: string, corpo: string[], botoes: { tipo: 'url' | 'quick_reply'; indice: number; valor: string }[] = []) {
  const components: any[] = []
  if (corpo.length) components.push({ type: 'body', parameters: corpo.map(t => ({ type: 'text', text: String(t).replace(/[\n\t]+/g, ' ').replace(/\s{4,}/g, '   ').slice(0, 900) })) })
  for (const b of botoes) components.push({ type: 'button', sub_type: b.tipo, index: String(b.indice), parameters: [b.tipo === 'url' ? { type: 'text', text: b.valor } : { type: 'payload', payload: b.valor }] })
  return manda({ to: fone(para), type: 'template', template: { name: nome, language: { code: idioma }, ...(components.length ? { components } : {}) } })
}

export const marcaLida = (wamid: string) => manda({ status: 'read', message_id: wamid })

// acha ou cria a conversa de um telefone, já ligada ao cliente (pelo WhatsApp do formulário)
export async function conversaDe(telefone: string, extra: { nome?: string | null } = {}) {
  const tel = fone(telefone)
  let cv = await db.um('wa_conversas', { telefone: tel })
  if (cv) return cv
  const cli = (await db.lista('clientes', { whatsapp: tel }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
  try {
    cv = await db.insere('wa_conversas', { telefone: tel, cliente_id: cli?.id || null, marca: cli?.marca || null, nome: extra.nome || cli?.responsavel || cli?.nome_negocio || null })
  } catch (e: any) { if (/duplicate|23505/.test(e.message)) cv = await db.um('wa_conversas', { telefone: tel }); else throw e }
  if (!cv) throw new Error("conversa não criada")
  return cv
}

// grava a mensagem que saiu e atualiza a conversa
export async function registraSaida(cv: any, autor: 'ia' | 'dono' | 'sistema', texto: string, r: { ok: boolean; wamid?: string; erro?: string }, tipo = 'texto') {
  await db.insere('wa_msgs', { conversa_id: cv.id, autor, tipo, texto, wamid: r.wamid || null, status: r.ok ? 'enviado' : 'falhou', erro: r.ok ? null : r.erro || null })
  await db.atualiza('wa_conversas', { id: cv.id }, { ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
}
