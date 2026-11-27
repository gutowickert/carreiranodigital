// Maia: uma META DE MENTIRA pro teste do histórico da coexistência (27/11, scripts/maia-teste-historico.mjs).
// Carregar no servidor de teste com NODE_OPTIONS=--import=./scripts/maia-rede-meta-falsa-historico.mjs.
// Responde só o que o histórico usa; o que vai pro próprio computador passa; o resto da internet é recusado.
//   GET/POST /<app>/subscriptions  → a inscrição do app (começa com messages e message_echoes; o POST SUBSTITUI os campos,
//                                    pra o teste pegar se a união não for mandada)
//   POST /<phone>/smb_app_data     → aceita (request_id). Número terminado em 222: o "history" falha na 1ª vez
//   qualquer POST /<phone>/messages → anotado (o teste confere que o histórico nunca faz a Maia responder)
// Cada chamada vai pra MAIA_META_FALSA_LOG (uma linha JSON). A chave nunca é anotada: só se veio a esperada (chave_ok).
import fs from 'node:fs'
import path from 'node:path'

const original = globalThis.fetch
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const LOG = path.resolve(process.env.MAIA_META_FALSA_LOG || '.teste-maia-historico/meta-falsa.jsonl')
const ESTADO = LOG + '.estado.json'
const CHAVE_NEG = 'TOKEN-TESTE-HISTORICO'
const r = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } })
const anota = (o) => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ em: new Date().toISOString(), ...o }) + '\n') }
const estado = () => { try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')) } catch { return { campos: [{ name: 'messages', version: 'v25.0' }, { name: 'message_echoes', version: 'v25.0' }], falhou222: false } } }
const salva = (e) => { fs.mkdirSync(path.dirname(ESTADO), { recursive: true }); fs.writeFileSync(ESTADO, JSON.stringify(e)) }

globalThis.fetch = async (entrada, opc = {}) => {
  const u = new URL(typeof entrada === 'string' ? entrada : entrada.url || String(entrada))
  if (LOCAL.has(u.hostname)) return original(entrada, opc)
  if (u.hostname !== 'graph.facebook.com') return new Response('sem internet no teste', { status: 599 })
  const p = u.pathname.replace(/^\/v[\d.]+/, ''), metodo = (opc.method || 'GET').toUpperCase()
  const cab = new Headers(opc.headers || {}), auth = cab.get('authorization') || ''
  const corpo = typeof opc.body === 'string' ? opc.body : ''
  const appSub = p.match(/^\/(\d+)\/subscriptions$/)
  if (appSub) {
    const chaveApp = `${appSub[1]}|${process.env.MAIA_META_APP_SECRET || ''}`
    const chave_ok = auth === 'Bearer ' + chaveApp
    const e = estado()
    if (metodo === 'GET') {
      anota({ metodo, p, chave_ok })
      if (!chave_ok) return r({ error: { message: 'chave do app errada' } }, 400)
      return r({ data: [{ object: 'whatsapp_business_account', callback_url: 'https://carreiranodigital.com/api/maia/whats/webhook', active: true, fields: e.campos }] })
    }
    const f = new URLSearchParams(corpo)
    anota({ metodo, p, chave_ok, object: f.get('object'), callback_url: f.get('callback_url'), fields: f.get('fields'), verify_ok: f.get('verify_token') === (process.env.MAIA_WA_VERIFY_TOKEN || 'maia-wa-2026') })
    if (!chave_ok) return r({ error: { message: 'chave do app errada' } }, 400)
    e.campos = String(f.get('fields') || '').split(',').filter(Boolean).map(name => ({ name, version: 'v25.0' }))   // SUBSTITUI
    salva(e)
    return r({ success: true })
  }
  const smb = p.match(/^\/(\d+)\/smb_app_data$/)
  if (smb && metodo === 'POST') {
    const j = JSON.parse(corpo || '{}'), chave_ok = auth === 'Bearer ' + CHAVE_NEG
    anota({ metodo, p, phone: smb[1], sync_type: j.sync_type, messaging_product: j.messaging_product, chave_ok })
    if (!chave_ok) return r({ error: { message: 'chave do negócio errada', code: 190 } }, 401)
    if (smb[1].endsWith('222') && j.sync_type === 'history') {
      const e = estado()
      if (!e.falhou222) { e.falhou222 = true; salva(e); return r({ error: { message: 'erro temporário da Meta (teste)', code: 2 } }, 500) }
    }
    return r({ messaging_product: 'whatsapp', request_id: 'req-' + j.sync_type + '-' + smb[1] })
  }
  if (/\/messages$/.test(p)) { anota({ metodo, p, mensagem: true }); return r({ messages: [{ id: 'wamid.falso' + Date.now() }] }) }
  anota({ metodo, p, desconhecido: true })
  return r({ error: { message: 'meta falsa: ' + p } }, 400)
}
