// Peças comuns da oficina: o .env, o ffmpeg, o Chrome, as cores e as fontes da marca.
// (Parte disso veio do editor da ótica Tempo de Visão: a leitura do vídeo e a conversão de cor do HDR do iPhone.)
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process')

const PASTA = __dirname
const P = (...a) => path.join(PASTA, ...a)

// lê o .env da própria pasta (se existir) sem precisar de biblioteca. O que já está no ambiente vale mais.
function carregaEnv(arq = P('.env')) {
  if (!fs.existsSync(arq)) return
  for (const linha of fs.readFileSync(arq, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
carregaEnv()

const FFMPEG = () => process.env.FFMPEG || 'ffmpeg'
const FFPROBE = () => process.env.FFPROBE || (FFMPEG() === 'ffmpeg' ? 'ffprobe' : FFMPEG().replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'))

// roda o ffmpeg; se der erro, mostra só o final da mensagem (o começo é sempre a mesma ladainha)
function ff(args) {
  const r = spawnSync(FFMPEG(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw new Error('não consegui rodar o ffmpeg (' + r.error.message + '). Confere a variável FFMPEG.')
  if (r.status !== 0) throw new Error('ffmpeg falhou: ' + String(r.stderr || '').trim().split('\n').slice(-4).join(' | '))
}

// o que tem no arquivo de vídeo: tamanho já girado (o iPhone grava deitado e marca "gire 90°"), duração, HDR, som
function sonda(arq) {
  const out = execFileSync(FFPROBE(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', arq], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  const j = JSON.parse(out)
  const v = (j.streams || []).find(s => s.codec_type === 'video')
  const a = (j.streams || []).find(s => s.codec_type === 'audio')
  let rot = 0
  if (v) {
    for (const sd of v.side_data_list || []) if (sd.rotation != null) rot = +sd.rotation
    if (v.tags && v.tags.rotate) rot = +v.tags.rotate
  }
  let w = v ? v.width : 0, h = v ? v.height : 0
  if (Math.abs(rot) % 180 === 90) [w, h] = [h, w]
  const dur = +(j.format && j.format.duration) || +(v && v.duration) || 0
  const hdr = !!v && /arib-std-b67|smpte2084/.test(v.color_transfer || '')
  return { w, h, dur, hdr, audio: !!a, video: !!v }
}

// será que este ffmpeg tem o zscale (precisa pra converter o HDR do iPhone)? Pergunta uma vez só.
let _zscale = null
function temZscale() {
  if (_zscale === null) {
    const r = spawnSync(FFMPEG(), ['-hide_banner', '-filters'], { encoding: 'utf8' })
    _zscale = /\bzscale\b/.test(r.stdout || '')
  }
  return _zscale
}
// HDR do iPhone → cor comum (bt709), segurando os brancos pra não estourar em tela comum (veio do editor da ótica)
const COR_HDR = () => temZscale()
  ? "zscale=t=arib-std-b67:p=bt709:m=bt709:r=tv,format=yuv420p,curves=all='0/0 0.5/0.42 0.8/0.68 1/0.93',eq=saturation=1.1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,"
  : "format=yuv420p,curves=all='0/0 0.5/0.45 0.8/0.72 1/0.95',"

// o Chrome: CHROME_PATH, ou o lugar de sempre no Windows / no Linux
function navegador() {
  const c = [process.env.CHROME_PATH,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/chromium',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(x => fs.existsSync(x))
  if (!c) throw new Error('não achei o Chrome. Põe o caminho dele na variável CHROME_PATH.')
  return c
}
async function abreNavegador() {
  const puppeteer = require('puppeteer-core')
  return puppeteer.launch({ executablePath: navegador(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] })
}

// ── cores ──
function hexOk(c) { return typeof c === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.trim()) }
function hex(c) { c = c.trim().replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return '#' + c.toLowerCase() }
function luz(c) { // luminância relativa (0 = preto, 1 = branco)
  const n = parseInt(hex(c).slice(1), 16), f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
}
const contraste = (a, b) => { const x = luz(a), y = luz(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
// texto que aparece bem em cima de uma cor: branco ou quase preto
const textoSobre = fundo => contraste(fundo, '#ffffff') >= contraste(fundo, '#141414') ? '#ffffff' : '#141414'

// as cores do negócio. Aceita {cores:{primaria,secundaria,texto}} e também cor_primaria/cor_secundaria soltas.
// 08/11 (teste completo, 8b): sem marca, um NEUTRO ELEGANTE (grafite quente com areia), nunca o roxo da Maia: o anúncio é
// do negócio do cliente, não da Maia
const NEUTRO = { primaria: '#1f1d1a', destaque: '#d8c3a0' }
function coresDaMarca(marca = {}) {
  const c = marca.cores || {}
  const pega = (...k) => k.map(x => c[x] != null ? c[x] : marca[x]).find(hexOk)
  const primaria = hex(pega('primaria', 'cor_primaria', 'principal') || NEUTRO.primaria)
  const secundaria = hex(pega('secundaria', 'cor_secundaria', 'destaque') || (pega('primaria', 'cor_primaria') ? primaria : NEUTRO.destaque))
  let texto = pega('texto', 'cor_texto')
  texto = texto && contraste(hex(texto), primaria) >= 4.5 ? hex(texto) : textoSobre(primaria)
  // o botão do CTA precisa aparecer em cima da barra: se a secundária some na primária, usa a areia neutra ou o branco
  let botao = secundaria
  if (contraste(botao, primaria) < 1.6) botao = contraste(NEUTRO.destaque, primaria) >= 1.6 ? NEUTRO.destaque : '#ffffff'
  return { primaria, secundaria, texto, botao, textoBotao: textoSobre(botao), textoSecundaria: textoSobre(secundaria) }
}

// as fontes: {fontes:{titulo,texto}} ou ['Titulo','Texto'] ou 'Fonte'. Sem marca: Montserrat (tem acento e peso 900).
function fontesDaMarca(marca = {}) {
  let f = marca.fontes, titulo, texto
  if (typeof f === 'string') titulo = texto = f
  else if (Array.isArray(f)) { titulo = f[0]; texto = f[1] || f[0] }
  else if (f && typeof f === 'object') { titulo = f.titulo || f.principal || f.texto; texto = f.texto || f.corpo || titulo }
  titulo = titulo || marca.fonte_titulo || 'Montserrat'; texto = texto || marca.fonte_texto || titulo
  const limpa = x => String(x).replace(/[^\w \-]/g, '').trim() || 'Montserrat'
  titulo = limpa(titulo); texto = limpa(texto)
  const fam = [...new Set([titulo, texto])].map(x => 'family=' + x.replace(/ /g, '+') + ':wght@400;600;700;800;900').join('&')
  return { titulo, texto, link: `https://fonts.googleapis.com/css2?${fam}&display=block` }
}
// fontes de reserva se o Google Fonts não carregar (sem internet, Linux sem a fonte etc.)
const RESERVA = `"Montserrat","Inter","Segoe UI","Noto Sans","DejaVu Sans",Arial,sans-serif`

// abre o HTML e espera as fontes (sem travar se o Google Fonts não responder)
async function carregaPagina(pg, html, fontes) {
  await pg.setContent(html, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
  await pg.evaluate(async (a, b) => {
    const espera = Promise.all([`900 40px "${a}"`, `800 40px "${a}"`, `700 40px "${b}"`, `600 40px "${b}"`].map(f => document.fonts.load(f, 'Ação ÉÍÓÚ')))
    await Promise.race([espera, new Promise(r => setTimeout(r, 8000))]).catch(() => {})
    await document.fonts.ready
  }, fontes.titulo, fontes.texto).catch(() => {})
}

// encolhe o texto até caber (mesma ideia da arte). 13/11: veio do video.js pra cá (o carrossel usa também)
// itens = [[id, tamanho mínimo, id da caixa que não pode passar]]
const encolhe = (pg, itens) => pg.evaluate(itens => {
  // passou do espaço? (mede as linhas de verdade; folga pequena pro acento do Ó/É, que sobe acima da linha)
  const passa = (el, tf) => {
    const t = tf || parseFloat(getComputedStyle(el).fontSize) || 20, q = el.getBoundingClientRect(), rg = document.createRange()
    rg.selectNodeContents(el)
    const fora = [...rg.getClientRects()].some(x => x.right > q.right + 2 || x.left < q.left - 2)
    return fora || el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + Math.max(2, t * 0.15)
  }
  const out = {}
  for (const [id, min, caixa] of itens) {
    const el = document.getElementById(id); if (!el) continue
    const box = document.getElementById(caixa || id)
    const t0 = parseFloat(getComputedStyle(el).fontSize)
    let t = t0
    // o que é pra caber numa linha só (o botão do CTA) tenta numa linha até ~2/3 do tamanho; depois deixa quebrar
    if (getComputedStyle(el).whiteSpace === 'nowrap') {
      while ((passa(box, t) || passa(el)) && t > t0 * 0.66) { t -= 2; el.style.fontSize = t + 'px' }
      if (passa(box, t) || passa(el)) { el.style.whiteSpace = 'normal'; t = t0; el.style.fontSize = t + 'px' }
    }
    while ((passa(box, t) || passa(el)) && t > min) { t -= 2; el.style.fontSize = t + 'px' }
    if (passa(box, t) || passa(el)) { el.style.overflowWrap = 'anywhere'; while ((passa(box, t) || passa(el)) && t > 18) { t -= 2; el.style.fontSize = t + 'px' } }
    out[id] = t
  }
  return out
}, itens)

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// número estável a partir de um texto (pra escolher o layout sempre igual pra mesma peça)
function numeroDe(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }

const dataUri = (buf, mime) => `data:${mime};base64,` + Buffer.from(buf).toString('base64')
function mimeDoArquivo(arq) {
  const e = path.extname(arq).toLowerCase()
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }[e] || ''
}

module.exports = { PASTA, P, carregaEnv, FFMPEG, FFPROBE, ff, sonda, COR_HDR, temZscale, navegador, abreNavegador, coresDaMarca, fontesDaMarca, RESERVA, carregaPagina, encolhe, esc, numeroDe, dataUri, mimeDoArquivo, textoSobre, contraste, fs, path }
