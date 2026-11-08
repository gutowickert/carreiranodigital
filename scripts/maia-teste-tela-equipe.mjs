// Maia: teste da TELA do painel da equipe num navegador de verdade (08/11), sem IA: logo, "usar as cores da marca" e os dias
// que o negócio abre. Até aqui esses campos só tinham sido testados pela API.
// Roda contra o sistema em MODO LOCAL. Precisa do Chrome (CHROME_PATH, ou o caminho padrão do Windows).
// Uso: node scripts/maia-teste-tela-equipe.mjs [url] [senha]     (padrão http://localhost:3195 teste123)
//   PORTA_CHROME=9351 (padrão; a 9334 costuma estar em uso). PRINT=<arquivo.png> salva um print da aba Dados no fim.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const URL_ = process.argv[2] || 'http://localhost:3195'
const SENHA = process.argv[3] || 'teste123'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORTA = Number(process.env.PORTA_CHROME || 9351)
const log = (...a) => console.log(...a)
const relatorio = []
const anota = (ok, o) => { relatorio.push({ ok: !!ok, o }); log((ok ? '  ✔ ' : '  ✘ ') + o) }
const espera = (ms) => new Promise(r => setTimeout(r, ms))
const cab = { 'x-senha': SENHA }
const op = (acao, corpo = {}) => fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { ...cab, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste-tela', ...corpo }) }).then(r => r.json())
const ver = (acao, q = {}) => fetch(URL_ + '/api/maia/operacao?' + new URLSearchParams({ acao, ...q }), { headers: cab }).then(r => r.json())

const resumo = await ver('resumo')
if (resumo.modo !== 'local') throw new Error('o sistema não está em modo local: teste cancelado')
log('Maia · teste da tela do painel da equipe em ' + URL_)
const neg = await op('criar_negocio', { nome: 'Tela Teste (logo e cores)', nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Tê', dono_whatsapp: '550007777' + String(Date.now()).slice(-5), contexto: { horario: 'terça a sábado, das 10h às 19h' } })
anota(neg.id, 'negócio de teste criado pela API')
if (!neg.id) throw new Error('não criou o negócio de teste: ' + (neg.erro || '?'))

// um PNG de 8x8 de verdade pro logo
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'maia-tela-'))
const png = path.join(pasta, 'logo-teste.png')
fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVR42mP8z8DAwMDAxMDAwMDAAAAWBgEB4m1N2AAAAABJRU5ErkJggg==', 'base64'))

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(pasta, 'perfil')}`, `--remote-debugging-port=${PORTA}`, '--window-size=1280,2400', 'about:blank'], { stdio: 'ignore' })
let alvo
for (let i = 0; i < 60 && !alvo; i++) { await espera(500); alvo = await fetch(`http://127.0.0.1:${PORTA}/json`).then(r => r.json()).then(l => l.find(x => x.type === 'page')).catch(() => null) }
if (!alvo) { chrome.kill(); throw new Error('o Chrome não abriu na porta ' + PORTA) }
const ws = new WebSocket(alvo.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0; const pend = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const cdp = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
const ate = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { if (await js(expr)) return true; await espera(250) } return false }
const abre = async (u) => { await cdp('Page.navigate', { url: u }); await espera(600); await ate('document.readyState==="complete"') }

try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('DOM.enable')
  // entra com a senha pela tela de login, como a equipe faz
  await abre(URL_ + '/maia/operacao/')
  anota(await ate('!!document.querySelector("#f-login")'), 'a tela de login abriu')
  await js(`(function(){ var i=document.querySelector('#senha'); i.value=${JSON.stringify(SENHA)}; document.querySelector('#f-login').requestSubmit(); return true })()`)
  anota(await ate('!document.querySelector("#f-login")'), 'entrou com a senha')
  await abre(URL_ + '/maia/operacao/#negocio/' + neg.id + '/dados')
  await js('location.reload()'); await espera(800)
  anota(await ate('!!document.querySelector("#f-dados") && !!document.querySelector("#f-atend")'), 'a aba Dados do negócio abriu (formulário de dados e o jeito de atender)')

  // ---- logo + "usar as cores da marca" ----
  const doc = await cdp('DOM.getDocument', { depth: -1 })
  const inp = await cdp('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#f-dados input[name=logo]' })
  await cdp('DOM.setFileInputFiles', { nodeId: inp.result.nodeId, files: [png] })
  await js(`(function(){ var f=document.querySelector('#f-dados'); f.usa_cores.checked=true; f.cor_primaria.value='#123456'; f.cor_secundaria.value='#abcdef'; f.cor_texto.value='#fefefe'; f.requestSubmit(); return true })()`)
  anota(await ate('document.body.innerText.indexOf("Dados salvos.")>=0', 20000), 'salvou pela tela (apareceu "Dados salvos.")')
  let n = await ver('negocio', { id: neg.id })
  anota(/\/marca\/logo-.*\.png$/.test(n.marca?.logo_path || ''), 'o logo escolhido na tela foi guardado: ' + (n.marca?.logo_path || '-'))
  anota(n.marca?.cores?.primaria === '#123456' && n.marca?.cores?.secundaria === '#abcdef' && n.marca?.cores?.texto === '#fefefe', 'marcado "usar as cores da marca": as 3 cores foram salvas no negócio')
  // a tela mostra o estado salvo depois de recarregar
  await js('location.reload()'); await espera(800); await ate('!!document.querySelector("#f-dados")')
  anota(await js('document.querySelector("#f-dados").usa_cores.checked && document.querySelector("#f-dados").cor_primaria.value==="#123456" && /já tem um/.test(document.querySelector("label[for=n-logo]").innerText)'), 'recarregando, a caixa continua marcada, a cor certa e o logo aparece como "já tem um"')
  await js(`(function(){ var f=document.querySelector('#f-dados'); f.usa_cores.checked=false; f.requestSubmit(); return true })()`)
  await ate('document.body.innerText.indexOf("Dados salvos.")>=0', 20000); await espera(500)
  n = await ver('negocio', { id: neg.id })
  anota(!n.marca?.cores && n.marca?.logo_path, 'desmarcado: as cores saíram (volta pro neutro) e o logo ficou')

  // ---- dias que o negócio abre ----
  anota(await js('document.querySelectorAll("#f-atend input[name=dias]").length===7'), 'o campo dos dias que o negócio abre aparece (7 caixas, domingo a sábado)')
  await js(`(function(){ var f=document.querySelector('#f-atend'); f.querySelectorAll('input[name=dias]').forEach(function(i){ i.checked=['2','3','4','5','6'].indexOf(i.value)>=0 }); f.requestSubmit(); return true })()`)
  anota(await ate('document.body.innerText.indexOf("Jeito de atender salvo.")>=0', 20000), 'salvou o jeito de atender pela tela')
  n = await ver('negocio', { id: neg.id })
  anota(JSON.stringify(n.meta?.atendimento?.dias) === '[2,3,4,5,6]', 'dias salvos no negócio: ' + JSON.stringify(n.meta?.atendimento?.dias))
  await js('location.reload()'); await espera(800); await ate('!!document.querySelector("#f-atend")')
  anota(await js('Array.from(document.querySelectorAll("#f-atend input[name=dias]")).filter(function(i){return i.checked}).map(function(i){return i.value}).join(",")==="2,3,4,5,6"'), 'recarregando, os dias continuam marcados (terça a sábado)')
  await js(`(function(){ var f=document.querySelector('#f-atend'); f.querySelectorAll('input[name=dias]').forEach(function(i){ i.checked=false }); f.requestSubmit(); return true })()`)
  await espera(1500)
  n = await ver('negocio', { id: neg.id })
  anota(!n.meta?.atendimento?.dias, 'nenhum dia marcado: o campo sai e a Maia volta a ler os dias do horário da base')
  if (process.env.PRINT) {
    const p = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(process.env.PRINT, Buffer.from(p.result.data, 'base64')); log('  print: ' + process.env.PRINT)
  }
} finally {
  try { ws.close() } catch { /* nada */ }
  chrome.kill()
}
const falhas = relatorio.filter(x => !x.ok)
log(`\n${relatorio.length - falhas.length} de ${relatorio.length} conferências da tela passaram.`)
if (falhas.length) { log('Falharam:\n' + falhas.map(f => ' - ' + f.o).join('\n')); process.exitCode = 1 }
