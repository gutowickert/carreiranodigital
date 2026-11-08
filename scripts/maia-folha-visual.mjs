// Maia: a folha "antes × depois" do visual (08/11), a partir dos prints de docs/maia-visual (scripts/maia-prints-visual.mjs).
// Uso: node scripts/maia-folha-visual.mjs   → docs/maia-visual/antes-x-depois.jpg
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PASTA = path.join(process.cwd(), 'docs', 'maia-visual').replace(/\\/g, '/')
const pares = [
  ['Painel do dono · celular', 'dono-430-claro', 380, 1500],
  ['Painel da equipe · computador', 'equipe-hoje-1440-claro', 760, 760],
  ['Painel da equipe · celular', 'equipe-hoje-430-claro', 380, 1500],
  ['Site /maia · computador', 'site-1440-claro', 760, 760],
  ['Site /maia · celular', 'site-430-claro', 380, 1500],
]
const qual = (n) => fs.existsSync(`${PASTA}/${n}.png`) ? `${n}.png` : `${n}.jpg`   // os prints grandes do site ficam em JPG
const fig = (rot, arq, w, h) => `<figure style="width:${w}px"><div class="img" style="height:${h}px"><img src="${arq}"></div><figcaption>${rot}</figcaption></figure>`
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:M;src:url(../../public/maia/fontes/manrope-latin.woff2)}
body{margin:0;background:#f7f5fc;font:600 18px M,system-ui;color:#1b1530;padding:32px}
h1{font-size:30px;margin:0 0 6px}p{margin:0 0 26px;color:#6b6485;font-weight:500}
.par{display:flex;gap:28px;align-items:flex-start;margin-bottom:34px;padding:22px;background:#fff;border:1px solid #ebe6f5;border-radius:20px}
.par h2{font-size:20px;margin:0 0 14px;width:100%}
.col{display:flex;gap:24px;flex-wrap:wrap}
figure{margin:0}.img{overflow:hidden;border-radius:14px;border:1px solid #ebe6f5;background:#fff}
img{width:100%;display:block}figcaption{margin-top:8px;font-size:15px;color:#6b6485}
.tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-bottom:8px}
.a{background:#f3f0fa;color:#6b6485}.d{background:#f1ebfe;color:#6d28d9}
</style><h1>Maia · visual antes × depois (08/11)</h1><p>Fundo claro como padrão, a Maia em pessoa, retorno do anúncio como número-herói. Dados do teste local.</p>
${pares.map(([rot, n, w, h]) => `<section class="par"><div><h2>${rot}</h2><div class="col"><div><span class="tag a">antes</span>${fig('', qual(`antes-${n}`), w, h)}</div><div><span class="tag d">depois</span>${fig('', qual(`depois-${n}`), w, h)}</div></div></div></section>`).join('')}`
fs.writeFileSync(`${PASTA}/_folha.html`, html)

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'maia-folha-'))
const porta = 9800 + Math.floor(Math.random() * 100)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files', `--user-data-dir=${perfil}`, `--remote-debugging-port=${porta}`, 'about:blank'], { stdio: 'ignore' })
const espera = (ms) => new Promise(r => setTimeout(r, ms))
let alvo
for (let i = 0; i < 60 && !alvo; i++) { await espera(500); alvo = await fetch(`http://127.0.0.1:${porta}/json`).then(r => r.json()).then(l => l.find(x => x.type === 'page')).catch(() => null) }
const ws = new WebSocket(alvo.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0; const pend = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const cdp = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
await cdp('Emulation.setDeviceMetricsOverride', { width: 1700, height: 1000, deviceScaleFactor: 1, mobile: false })
await cdp('Page.navigate', { url: `file:///${PASTA}/_folha.html` })
await espera(2500)
const m = await cdp('Page.getLayoutMetrics')
const h = Math.ceil(m.result.cssContentSize.height)
await cdp('Emulation.setDeviceMetricsOverride', { width: 1700, height: h, deviceScaleFactor: 1, mobile: false })
await espera(600)
const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1700, height: h, scale: 1 } })
fs.writeFileSync(`${PASTA}/antes-x-depois.jpg`, Buffer.from(r.result.data, 'base64'))
fs.rmSync(`${PASTA}/_folha.html`)
ws.close(); chrome.kill()
console.log('docs/maia-visual/antes-x-depois.jpg')
