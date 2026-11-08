// Maia: tira os prints do painel do dono no tamanho de celular (07/11). Roda contra o sistema em MODO LOCAL.
// Uso: node scripts/maia-prints-painel-dono.mjs [url] [senha] [nome do negócio]
//   padrão: http://localhost:3190 teste123 "Ótica"  → salva em docs/maia-painel-dono/
// Precisa do Chrome (CHROME_PATH, ou o caminho padrão do Windows).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const URL_ = process.argv[2] || 'http://localhost:3190'
const SENHA = process.argv[3] || 'teste123'
const QUAL = process.argv[4] || 'Ótica'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PASTA = path.join(process.cwd(), 'docs', 'maia-painel-dono').replace(/\\/g, '/')
fs.mkdirSync(PASTA, { recursive: true })

async function op(acao, corpo = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) })
  const j = await r.json(); if (!r.ok) throw new Error(acao + ': ' + j.erro); return j
}
const resumo = await fetch(URL_ + '/api/maia/operacao?acao=resumo', { headers: { 'x-senha': SENHA } }).then(r => r.json())
if (resumo.modo !== 'local') throw new Error('o sistema não está em modo local')
const negs = await fetch(URL_ + '/api/maia/operacao?acao=negocios', { headers: { 'x-senha': SENHA } }).then(r => r.json())
const neg = negs.find(n => n.nome.includes(QUAL)) || negs[0]
const { link } = await op('link_painel_dono', { negocio_id: neg.id })
const t = new URL(link).searchParams.get('t')
const dados = await fetch(URL_ + '/api/maia/painel?acao=tudo', { headers: { cookie: 'maia_dono=' + t } }).then(r => r.json())
// a conversa com mais mensagens (pra mostrar aberta)
let cv = dados.conversas[0], max = -1
for (const c of dados.conversas) {
  const m = await fetch(URL_ + '/api/maia/painel?acao=conversa&id=' + c.id, { headers: { cookie: 'maia_dono=' + t } }).then(r => r.json())
  if ((m.msgs || []).length > max) { max = m.msgs.length; cv = c }
}

// o Chrome tem largura mínima de janela (~500 px): o tamanho de celular vai pelo protocolo de depuração (Emulation)
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'maia-print-'))
const porta = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${perfil}`, `--remote-debugging-port=${porta}`, 'about:blank'], { stdio: 'ignore' })
const espera = (ms) => new Promise(r => setTimeout(r, ms))
let alvo
for (let i = 0; i < 60 && !alvo; i++) { await espera(500); alvo = await fetch(`http://127.0.0.1:${porta}/json`).then(r => r.json()).then(l => l.find(x => x.type === 'page')).catch(() => null) }
const ws = new WebSocket(alvo.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0; const pend = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const cdp = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
async function tela(largura, alto, escala, url, saida) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: alto, deviceScaleFactor: escala, mobile: largura < 600 })
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await cdp('Page.navigate', { url })
  await espera(4500)
  const r = await cdp('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(saida, Buffer.from(r.result.data, 'base64'))
  console.log('  ' + saida)
}
async function print(nome, hash, alto = 932) {
  await cdp('Page.navigate', { url: 'about:blank' })
  await cdp('Network.clearBrowserCookies').catch(() => null)
  await tela(430, alto, 2, `${URL_}/maia/painel?t=${t}${hash}`, `${PASTA}/${nome}.png`)
  return `${nome}.png`
}
console.log('Prints do painel de ' + neg.nome)
const fotos = []
for (const [n, h, legenda] of [
  ['1-topo', '', 'Topo: números do período'],
  ['2-funil', '#funil', 'Funil em colunas'],
  ['3-retomadas', '#retomadas', 'Retomadas (follow-up)'],
  ['4-atendimento', '#conversas', 'Atendimento'],
  ['5-conversa', cv ? '#conversa=' + cv.id : '#conversas', 'Conversa aberta'],
]) fotos.push([await print(n, h), legenda])
await print('6-anuncios', '#anuncios')

// a imagem lado a lado
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#141826;font:600 22px system-ui;color:#f5f0e6;display:flex;gap:24px;padding:28px}
figure{margin:0;width:430px}img{width:430px;border-radius:22px;display:block;box-shadow:0 8px 30px rgba(0,0,0,.4)}figcaption{margin-top:12px;text-align:center}</style>
${fotos.map(([f, l]) => `<figure><img src="${f}"><figcaption>${l}</figcaption></figure>`).join('')}`
fs.writeFileSync(`${PASTA}/_lado-a-lado.html`, html)
await tela(fotos.length * 454 + 32, 1060, 1, `file:///${PASTA}/_lado-a-lado.html`, `${PASTA}/lado-a-lado.png`)
fs.rmSync(`${PASTA}/_lado-a-lado.html`)
ws.close(); chrome.kill()
await espera(800)
try { fs.rmSync(perfil, { recursive: true, force: true }) } catch {}
process.exit(0)
