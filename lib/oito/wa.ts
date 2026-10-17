// Oito Posts: o WhatsApp de venda (14/10). Um número só pras marcas, separado do número da escola.
// Cloud API da Meta. O número fica numa conta de WhatsApp própria (WABA), no mesmo gerenciador da escola,
// e os eventos dela chegam em /api/oito/whats/webhook (endereço próprio, configurado na WABA): o webhook da escola não vê nada.
// Variáveis: OITO_WA_PHONE_ID (o número), OITO_WA_WABA_ID (a conta, pros modelos), OITO_WA_TOKEN (se não houver, usa o WA_OFICIAL_TOKEN da escola).
import { oitoDb as db } from './db'

const GRAPH = 'https://graph.facebook.com/v25.0'
const TOKEN = () => process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || ''
const PHONE = () => process.env.OITO_WA_PHONE_ID || ''
export const waLigado = () => !!(TOKEN() && PHONE())

// só dígitos; número brasileiro sem DDI ganha o 55 (o cadastro já grava com o código do país; isto é só uma rede de segurança)
// 17/10: números completos da América Latina também têm 11 dígitos e NÃO levam o 55: Peru 51+9, Chile 56+9, América Central 502-507+8,
// Bolívia 591+8, Uruguai 598+8, Rep. Dominicana e Porto Rico 1+10
const LATAM_11 = /^(519\d{8}|569\d{8}|50[2-7]\d{8}|59[18]\d{8}|1(809|829|849|787|939)\d{7})$/
export function fone(raw: string) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d && d.length >= 10 && d.length <= 11 && !LATAM_11.test(d)) d = '55' + d
  return d
}

// 15/10: telefones de simulação (começam com 55000) não saem pra Meta: a validação do agente roda sem mandar nada de verdade
export const ehSimulado = (tel: string) => /^55000/.test(String(tel || ''))
async function manda(corpo: any) {
  if (corpo.to && ehSimulado(corpo.to)) return { ok: true, wamid: 'sim-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) }
  if (corpo.status === 'read' && String(corpo.message_id || '').startsWith('sim-')) return { ok: true }
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

// imagem por link público (o post pronto, a fatura...), com legenda
export const enviaImagem = (para: string, link: string, legenda?: string) => manda({ to: fone(para), type: 'image', image: { link, ...(legenda ? { caption: legenda.slice(0, 1000) } : {}) } })

// baixa uma mídia recebida (foto, logo): a Meta dá um endereço temporário, que só abre com o token
export async function baixaMidia(id: string) {
  const r = await fetch(`${GRAPH}/${id}`, { headers: { Authorization: 'Bearer ' + TOKEN() }, signal: AbortSignal.timeout(15000) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j.url) throw new Error('mídia: ' + (j?.error?.message || r.status))
  const b = await fetch(j.url, { headers: { Authorization: 'Bearer ' + TOKEN() }, signal: AbortSignal.timeout(30000) })
  if (!b.ok) throw new Error('mídia: download ' + b.status)
  return { buf: Buffer.from(await b.arrayBuffer()), mime: String(j.mime_type || b.headers.get('content-type') || 'image/jpeg') }
}

// a janela de 24 h: dentro dela vale texto livre; fora, só modelo aprovado
export const janelaAberta = (cv: any) => !!cv?.janela_ate && cv.janela_ate > new Date().toISOString()

export const marcaLida = (wamid: string) => manda({ status: 'read', message_id: wamid })

// acha ou cria a conversa de um telefone, já ligada ao cliente (pelo WhatsApp do formulário)
export async function conversaDe(telefone: string, extra: { nome?: string | null } = {}) {
  const tel = fone(telefone)
  let cv = await db.um('wa_conversas', { telefone: tel })
  if (cv) return cv
  // 15/10: a Meta às vezes manda o celular brasileiro sem o 9 (554498479803) e o cadastro tem com o 9 (5544998479803), ou o contrário
  // 17/10: no México a Meta manda 521 + 10 dígitos e o cadastro tem 52 + 10; na Argentina, 549 + 10 e às vezes 54 + 10
  const outro = /^55\d{10}$/.test(tel) ? tel.slice(0, 4) + '9' + tel.slice(4) : /^55\d{2}9\d{8}$/.test(tel) ? tel.slice(0, 4) + tel.slice(5)
    : /^521\d{10}$/.test(tel) ? '52' + tel.slice(3) : /^52\d{10}$/.test(tel) ? '521' + tel.slice(2)
    : /^549\d{10}$/.test(tel) ? '54' + tel.slice(3) : /^54\d{10}$/.test(tel) ? '549' + tel.slice(2) : ''
  if (outro) { cv = await db.um('wa_conversas', { telefone: outro }); if (cv) return cv }
  const cli = (await db.lista('clientes', { whatsapp: tel }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
    || (outro ? (await db.lista('clientes', { whatsapp: outro }, { ordem: 'criado_em', desc: true, limite: 1 }))[0] : undefined)
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
