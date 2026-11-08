// Maia: prints do visual (08/11) — painel do dono, painel da equipe e site /maia, em celular (430) e computador (1440),
// claro e escuro. Roda contra o sistema em MODO LOCAL, depois do scripts/maia-teste.mjs (e do maia-teste-painel-dono.mjs).
// Uso: node scripts/maia-prints-visual.mjs [url] [senha] [prefixo]   (padrão http://localhost:3197 teste123 depois)
//   salva em docs/maia-visual/<prefixo>-<tela>-<largura>-<tema>.png
// Precisa do Chrome (CHROME_PATH, ou o caminho padrão do Windows).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const URL_ = process.argv[2] || 'http://localhost:3197'
const SENHA = process.argv[3] || 'teste123'
const PRE = process.argv[4] || 'depois'
const SO = (process.env.SO || '').split(',').filter(Boolean)   // ex.: SO=dono,site pra tirar só algumas
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PASTA = path.join(process.cwd(), 'docs', 'maia-visual')
fs.mkdirSync(PASTA, { recursive: true })

const cab = { 'x-senha': SENHA }
const resumo = await fetch(URL_ + '/api/maia/operacao?acao=resumo', { headers: cab }).then(r => r.json())
if (resumo.modo !== 'local') throw new Error('o sistema não está em modo local')
const negs = await fetch(URL_ + '/api/maia/operacao?acao=negocios', { headers: cab }).then(r => r.json())
const neg = negs.find(n => /Ótica/.test(n.nome)) || negs[0]
const { link } = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { ...cab, 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'link_painel_dono', negocio_id: neg.id }) }).then(r => r.json())

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'maia-visual-'))
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
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

const saidas = []
// abre a url na largura, aplica o tema e salva a página inteira (até `max` px de altura)
async function print(nome, url, largura, tema, { max = 2600, antes = null, depois = 3500 } = {}) {
  const alto = largura < 600 ? 932 : 900
  await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: alto, deviceScaleFactor: largura < 600 ? 2 : 1, mobile: largura < 600 })
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema === 'escuro' ? 'dark' : 'light' }] })
  if (antes) await antes()
  await cdp('Page.navigate', { url })
  await espera(depois)
  await js(`(function(){var t='${tema === 'escuro' ? 'dark' : 'light'}';document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('maia_op_tema',t);localStorage.setItem('maia_dono_tema',t)}catch(e){};return 1})()`)
  await js("window.scrollTo(0,0)"); await espera(500)
  const larg = await js('document.documentElement.scrollWidth')
  const m = await cdp('Page.getLayoutMetrics')
  const h = Math.min(max, Math.ceil(m.result.cssContentSize?.height || m.result.contentSize.height))
  // a janela vira do tamanho da página (assim a barra lateral fixa e o topo grudado saem no lugar certo)
  await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: h, deviceScaleFactor: largura < 600 ? 2 : 1, mobile: largura < 600 })
  await espera(400)
  const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: largura, height: h, scale: 1 } })
  const arq = path.join(PASTA, `${PRE}-${nome}-${largura}-${tema}.png`)
  fs.writeFileSync(arq, Buffer.from(r.result.data, 'base64'))
  saidas.push(arq)
  console.log(`  ${path.relative(process.cwd(), arq)}${larg > largura ? `  ⚠ rolagem lateral (${larg}px)` : ''}`)
}
const entraEquipe = async () => { await cdp('Page.navigate', { url: URL_ + '/maia/operacao' }); await espera(1200); await js(`localStorage.setItem('maia_op_senha','${SENHA}')`); await cdp('Page.navigate', { url: 'about:blank' }); await espera(300) }
const quer = (n) => !SO.length || SO.includes(n)

console.log(`Prints "${PRE}" (${neg.nome})`)
for (const tema of ['claro', 'escuro']) {
  for (const w of [430, 1440]) {
    if (tema === 'escuro' && w === 1440 && PRE !== 'antes') continue   // escuro é opção: no computador, só o claro
    if (quer('dono')) {
      await print('dono', link, w, tema, { max: w < 600 ? 3400 : 2400, antes: () => cdp('Network.clearBrowserCookies').catch(() => null) })
      await print('dono-funil', link + '#funil', w, tema, { max: 1800, antes: () => cdp('Network.clearBrowserCookies').catch(() => null) })
    }
    if (quer('equipe')) {
      await print('equipe-hoje', URL_ + '/maia/operacao#hoje', w, tema, { max: w < 600 ? 3400 : 2200, antes: entraEquipe, depois: 5000 })
      await print('equipe-negocio', URL_ + '/maia/operacao#negocio/' + neg.id + '/numeros', w, tema, { max: 2200, antes: entraEquipe, depois: 5000 })
    }
    if (quer('site') && tema === 'claro') await print('site', URL_ + '/maia/index.html', w, tema, { max: w < 600 ? 7000 : 5200 })
  }
}
// a tela de quem abre /maia/painel sem link nem cookie
if (quer('dono') || quer('semlink')) await print('dono-sem-link', URL_ + '/maia/painel', 430, 'claro', { max: 932, antes: () => cdp('Network.clearBrowserCookies').catch(() => null) })
ws.close(); chrome.kill()
console.log(saidas.length + ' prints em docs/maia-visual/')
