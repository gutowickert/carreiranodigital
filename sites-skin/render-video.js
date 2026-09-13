// Renderiza o vídeo do hero (sites-skin/video-hero.tpl.html) em MP4:
//   1. inlina as imagens (vêm de public/deu-venda.html, achadas pelo alt)
//   2. abre o Chrome sem tela com o protocolo de depuração e captura 1 quadro por
//      passo de tempo (window.seek(t)) — determinístico, sem depender de relógio
//   3. junta os quadros com o ffmpeg (ffmpeg-static, instalado fora do projeto)
// Uso: node sites-skin/render-video.js [fps] [caminho-do-ffmpeg]
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn, execFileSync } = require('child_process')

const FPS = Number(process.argv[2] || 24)
const FFMPEG = process.argv[3] || process.env.FFMPEG || 'ffmpeg'
const PUB = path.join(__dirname, '..', 'public')
const SAIDA = path.join(PUB, 'deu-venda-video.html')
const QUADROS = path.join(process.env.TEMP || '/tmp', 'dv-quadros')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORTA = 9333
const DUR = 60

// 1. as imagens
const ALT = { logo: /^Carreira no Digital$/, maquina: /^A máquina de captação/, arte: /^A arte do anúncio/, pedido: /^Um pedido feito/, campanha: /^A campanha no Gerenciador/, leitura: /^A leitura da campanha/ }
const src = fs.readFileSync(path.join(PUB, 'deu-venda.html'), 'utf8').replace(/\r?\n/g, ' ')
const imgs = [...src.matchAll(/<img([^>]*?)>/g)].map(m => ({ src: (m[1].match(/src="(data:[^"]+)"/) || [])[1], alt: (m[1].match(/alt="([^"]*)"/) || [, ''])[1] })).filter(x => x.src)
const acha = n => { const i = imgs.find(x => ALT[n].test(x.alt)); if (!i) throw new Error('sem imagem ' + n); return i.src }
const html = fs.readFileSync(path.join(__dirname, 'video-hero.tpl.html'), 'utf8').replace(/\{\{IMG:([a-z]+)\}\}/g, (_, n) => acha(n))
fs.writeFileSync(SAIDA, html)
console.log('html:', SAIDA, Math.round(html.length / 1024) + ' kB')
if (process.argv.includes('--so-html')) process.exit(0)

// 2. o Chrome, por CDP
fs.rmSync(QUADROS, { recursive: true, force: true }); fs.mkdirSync(QUADROS, { recursive: true })
const perfil = path.join(process.env.TEMP || '/tmp', 'dv-chrome-prof')
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--remote-debugging-port=' + PORTA,
  '--user-data-dir=' + perfil, '--window-size=1280,720', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' })

const dormir = ms => new Promise(r => setTimeout(r, ms))
const getJson = url => new Promise((res, rej) => http.get(url, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)) } catch (e) { rej(e) } }) }).on('error', rej))

async function main() {
  let alvos = null
  for (let i = 0; i < 40 && !alvos; i++) { try { alvos = await getJson(`http://127.0.0.1:${PORTA}/json`) } catch { await dormir(250) } }
  if (!alvos) throw new Error('Chrome não respondeu na porta ' + PORTA)
  const pagina = alvos.find(a => a.type === 'page')
  const ws = new WebSocket(pagina.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0; const pend = new Map()
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
  const cmd = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })) })

  await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await cmd('Page.enable')
  await cmd('Page.navigate', { url: 'file:///' + SAIDA.replace(/\\/g, '/') + '?captura' })
  await dormir(1500)
  // espera fontes e imagens
  for (let i = 0; i < 40; i++) {
    const r = await cmd('Runtime.evaluate', { expression: 'document.fonts.status === "loaded" && [...document.images].every(i => i.complete)', returnByValue: true })
    if (r.result && r.result.result && r.result.result.value) break
    await dormir(250)
  }
  await cmd('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true })

  const total = DUR * FPS
  const t1 = Date.now()
  for (let f = 0; f < total; f++) {
    await cmd('Runtime.evaluate', { expression: `window.seek(${(f / FPS).toFixed(4)})` })
    const shot = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 92 })
    fs.writeFileSync(path.join(QUADROS, 'f' + String(f).padStart(5, '0') + '.jpg'), Buffer.from(shot.result.data, 'base64'))
    if (f % (FPS * 5) === 0) console.log(`quadro ${f}/${total} · ${((Date.now() - t1) / 1000).toFixed(0)}s`)
  }
  ws.close(); chrome.kill()

  // 3. ffmpeg
  const mp4 = path.join(PUB, 'deu-venda-hero.mp4')
  const poster = path.join(PUB, 'deu-venda-hero-poster.jpg')
  execFileSync(FFMPEG, ['-y', '-framerate', String(FPS), '-i', path.join(QUADROS, 'f%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' })
  fs.copyFileSync(path.join(QUADROS, 'f' + String(Math.round(3.5 * FPS)).padStart(5, '0') + '.jpg'), poster)   // o pôster: a abertura já montada
  console.log('mp4:', mp4, Math.round(fs.statSync(mp4).size / 1024) + ' kB', '· poster:', poster)
}
main().catch(e => { console.error(e); chrome.kill(); process.exit(1) })
