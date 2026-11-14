// Maia: o teste da ABA SOCIAL do painel da equipe (14/11). Pro 1º cliente da social (uma lotérica), ligar na quinta 19/11.
// Roda contra o servidor em MODO LOCAL, pelo MESMO caminho que a tela usa (/api/maia/social e /api/maia/operacao, com a senha),
// e depois abre a aba num Chrome sem janela (computador e celular), confere a tela, publica pela tela (com a confirmação
// dentro da página) e tira os prints. Sem MAIA_META_REAL a social é simulada (ids sim_): nada sai pra Meta.
// Telefones de teste começam com 55000.
//
// Servidor (pasta limpa; a rede do ensaio recusa toda saída pra internet e simula a IA, inclusive os slides do carrossel):
//   rm -rf .maia-teste/social-aba
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.maia-teste/social-aba MAIA_PAINEL_SENHA=teste123 MAIA_SEM_AVISO=1 MAIA_SEM_IA_MIDIA=1 \
//   MAIA_CRIPTO_CHAVE=cripto-do-teste ANTHROPIC_API_KEY=ia-falsa NODE_OPTIONS=--import=./scripts/maia-ensaio-rede.mjs \
//   npx next dev --webpack -p 3241
//   (sem MAIA_META_REAL, MAIA_SOCIAL_TOKEN, MAIA_ADS_TOKEN nem FB_ADS_TOKEN no ambiente)
// Teste:
//   node scripts/maia-teste-social-aba.mjs http://localhost:3241 teste123 .maia-teste/social-aba [pasta dos prints]
//   PORTA_CHROME=9353 (padrão). CHROME_PATH se o Chrome não estiver no lugar padrão do Windows.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const RAIZ = path.resolve(import.meta.dirname, '..')
const [URL_ = 'http://localhost:3241', SENHA = 'teste123', PASTA = '.maia-teste/social-aba', PRINTS = 'C:/Users/carre/Desktop/Maia-teste-social-aba-14-11'] = process.argv.slice(2)
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORTA = Number(process.env.PORTA_CHROME || 9353)
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra ? '→ ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '') } }
const etapa = (t) => console.log('\n' + t)
const espera = (ms) => new Promise(r => setTimeout(r, ms))

// ── o mesmo caminho da tela: as duas rotas, com a senha no cabeçalho
const cab = { 'x-senha': SENHA }
async function chama(rota, corpo) {
  const r = await fetch(URL_ + rota, corpo ? { method: 'POST', headers: { ...cab, 'content-type': 'application/json' }, body: JSON.stringify({ por: 'teste-social-aba', ...corpo }) } : { headers: cab })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.erro) throw new Error(j?.erro || 'erro ' + r.status)
  return j
}
const so = (acao, corpo = {}) => chama('/api/maia/social', { acao, ...corpo })
const soVer = (acao, q = {}) => chama('/api/maia/social?' + new URLSearchParams({ acao, ...q }))
const op = (acao, corpo = {}) => chama('/api/maia/operacao', { acao, ...corpo })
const opVer = (acao, q = {}) => chama('/api/maia/operacao?' + new URLSearchParams({ acao, ...q }))
const erroDe = async (fn) => { try { await fn(); return null } catch (e) { return String(e.message || e) } }
const arquivo = (tab) => JSON.parse(fs.readFileSync(path.join(RAIZ, PASTA, tab + '.json'), 'utf8'))

const resumo = await opVer('resumo')
if (resumo.modo !== 'local') throw new Error('o sistema não está em modo local: teste cancelado')
if (resumo.meta_real) throw new Error('o servidor está com MAIA_META_REAL: teste cancelado (nada pode sair pra Meta)')
console.log('Maia · teste da aba Social do painel da equipe em ' + URL_)

etapa('1. o negócio e a ligação')
const sufixo = String(Date.now()).slice(-5)
const neg = await op('criar_negocio', { nome: 'Lotérica Teste Social', nicho: 'lotérica', cidade: 'Lajeado', dono_nome: 'Lu', dono_whatsapp: '550009991' + sufixo, contexto: { whatsapp: '550009992' + sufixo } })
confere('negócio de teste criado', !!neg.id, neg)
let lig = await soVer('ligacao', { negocio: neg.id })
confere('a ligação começa com o que falta: a página', !lig.pronto && lig.faltas.some(f => /falta a página/.test(f)), lig.faltas)
confere('a ligação mostra a chave como não guardada e o modo simulado (só leitura)', lig.chave_guardada === false && lig.meta_real === false && lig.faltas.some(f => /modo simulado/.test(f)), lig)
confere('a ligação diz se a social está ligada no servidor (MAIA_SOCIAL_LIGADO)', typeof lig.social_ligado === 'boolean' && lig.faltas.some(f => /desligada no servidor/.test(f)) === !lig.social_ligado)
confere('o link da bio sai com "Vim pelo Instagram"', /wa\.me\/550009992\d+\?text=Vim%20pelo%20Instagram/.test(lig.link_perfil || ''), lig.link_perfil)
const e1 = await erroDe(() => so('salvar_ligacao', { negocio_id: neg.id, page_id: 'minha-pagina' }))
confere('página com letra: erro claro', /só números/.test(e1 || ''), e1)
confere('achar o Instagram sem página: erro claro', /falta a página do negócio/.test(await erroDe(() => so('achar_instagram', { negocio_id: neg.id })) || ''))
lig = await so('salvar_ligacao', { negocio_id: neg.id, page_id: '102938475610293' })
confere('salvou a página', lig.page_id === '102938475610293' && !lig.faltas.some(f => /falta a página/.test(f)), lig)
confere('chave curta demais: erro claro', /não parece certa/.test(await erroDe(() => so('salvar_ligacao', { negocio_id: neg.id, social_token: 'abc' })) || ''))
const CHAVE = 'EAATesteChaveDaPagina' + sufixo + 'xYz0123456789'
lig = await so('salvar_ligacao', { negocio_id: neg.id, social_token: CHAVE })
confere('a chave volta só como "guardada" (nunca o texto)', lig.chave_guardada === true && !JSON.stringify(lig).includes(CHAVE) && lig.cifrada === true, lig)
let n = await opVer('negocio', { id: neg.id })
confere('o negócio que vai pro painel mostra "(guardada)"', n.meta?.social_token === '(guardada)' && !JSON.stringify(n).includes(CHAVE), n.meta)
const gravado = arquivo('negocios').find(x => x.id === neg.id)?.meta?.social_token || ''
confere('no arquivo do banco a chave está cifrada (enc1:), sem o texto', gravado.startsWith('enc1:') && !gravado.includes(CHAVE) && !fs.readFileSync(path.join(RAIZ, PASTA, 'negocios.json'), 'utf8').includes(CHAVE), gravado.slice(0, 20))
lig = await so('salvar_ligacao', { negocio_id: neg.id, social_token: '(guardada)' })
confere('mandar "(guardada)" de volta não troca a chave', (arquivo('negocios').find(x => x.id === neg.id)?.meta?.social_token) === gravado)
const ach = await so('achar_instagram', { negocio_id: neg.id })
confere('achar o Instagram no modo simulado: avisa e não inventa id', ach.simulado === true && !ach.ig_id && /modo simulado/.test(ach.aviso), ach)
lig = await so('salvar_ligacao', { negocio_id: neg.id, ig_id: '17841400000000001' })
confere('o Instagram pode ser preenchido (como se achado) e a falta some', lig.ig_id === '17841400000000001' && !lig.faltas.some(f => /Instagram/.test(f)), lig.faltas)
// a aba Dados salva o meta inteiro: a chave e a página continuam
await op('atualizar_negocio', { id: neg.id, meta: { ...n.meta, page_id: '102938475610293', ig_id: '17841400000000001' } })
confere('salvar pela aba Dados não apaga a chave cifrada', (arquivo('negocios').find(x => x.id === neg.id)?.meta?.social_token) === gravado)

etapa('2. o banco de mídias e criar post')
const fotos = ['cena1-heroi.jpg', 'cena2-mergulho.jpg', 'cena3-presente.jpg'].map(f => path.join(RAIZ, 'public/bocadinho/img', f))
const midias = []
for (const f of fotos) midias.push(await op('material_subir', { negocio_id: neg.id, mime: 'image/jpeg', nome: path.basename(f), arquivo_b64: fs.readFileSync(f).toString('base64') }))
const banco = (await opVer('material', { negocio: neg.id })).banco
confere('3 fotos no banco (o mesmo que a aba lista)', banco.length === 3 && banco.every(m => m.link), banco.length)
const ids = banco.map(m => m.id)
const amanha = new Date(Date.now() - 3 * 3600e3 + 86400e3).toISOString().slice(0, 10)
const e2 = await erroDe(() => so('criar_post', { negocio_id: neg.id, tipo: 'foto', midia_ids: [], legenda: 'x', quando: amanha + 'T11:00' }))
confere('post sem foto: erro claro', /post de foto leva 1 foto/.test(e2 || ''), e2)
const p1 = await so('criar_post', { negocio_id: neg.id, tipo: 'foto', midia_ids: [ids[0]], legenda: 'O bolão da Mega abriu. Venha conferir as cotas.', quando: amanha + 'T11:00', tema: 'bolão', redes: ['instagram', 'facebook'] })
confere('post de foto criado com a foto do banco (caminho da pasta do negócio)', p1.id && p1.detalhe?.midias?.[0]?.caminho?.startsWith(neg.id + '/') && p1.detalhe.status === 'rascunho', p1.detalhe)
const e3 = await erroDe(() => so('criar_post', { negocio_id: neg.id, tipo: 'carrossel', midia_ids: [ids[0]], legenda: 'x', quando: amanha + 'T18:00' }))
confere('carrossel com 1 foto: erro claro', /carrossel leva de 2 a 10/.test(e3 || ''), e3)
const c1 = await so('criar_carrossel', { negocio_id: neg.id, tema: 'como funciona o bolão', tipo: 'dica', midia_ids: ids, quando: amanha + 'T18:00', redes: ['instagram'] })
confere('carrossel com texto criado (a Maia escreveu os slides)', c1.post_id && (c1.slides || []).length >= 5, c1)

etapa('3. a agenda e os status')
let ag = await soVer('agenda', { negocio: neg.id })
const a1 = () => ag.find(p => p.id === p1.id), a2 = () => ag.find(p => p.id === c1.post_id)
confere('a agenda mostra os 2 posts', ag.length === 2, ag.map(p => p.status))
confere('o post de foto: esperando a equipe, com a prévia da imagem e a legenda', a1()?.status === 'rascunho' && a1()?.peca_status === 'revisao_equipe' && a1()?.links?.length === 1 && /bolão da Mega/.test(a1()?.legenda), a1())
confere('o carrossel: a oficina está montando (peça gerando), 1 rede', a2()?.status === 'rascunho' && a2()?.peca_status === 'gerando' && a2()?.redes?.join() === 'instagram', a2())
await so('editar_legenda', { post_id: p1.id, legenda: 'O bolão da Mega da Virada abriu. São poucas cotas: venha garantir a sua.' })
ag = await soVer('agenda', { negocio: neg.id })
confere('editar a legenda antes de aprovar', /Mega da Virada abriu/.test(a1()?.legenda), a1()?.legenda)
await so('aprovar_equipe', { post_id: p1.id })
ag = await soVer('agenda', { negocio: neg.id })
confere('aprovado pela equipe: vai pro dono (status aprovado_equipe)', a1()?.status === 'aprovado_equipe' && a1()?.peca_status === 'com_dono', a1())
confere('depois de aprovar não dá mais pra editar a legenda (erro claro)', /antes da equipe aprovar/.test(await erroDe(() => so('editar_legenda', { post_id: p1.id, legenda: 'nova' })) || ''))
const e4 = await erroDe(() => so('publicar_agora', { post_id: p1.id }))
confere('publicar sem o 👍 do dono: erro claro', /dois 👍/.test(e4 || ''), e4)
await so('aprovar_dono', { post_id: p1.id })
ag = await soVer('agenda', { negocio: neg.id })
confere('o 👍 do dono: agendado', a1()?.status === 'agendado', a1()?.status)
const pub = await so('publicar_agora', { post_id: p1.id })
confere('publicar agora (simulado): publicado com ids sim_ no Instagram e no Facebook', pub.detalhe?.status === 'publicado' && /^sim_/.test(pub.detalhe?.ig?.media_id) && /^sim_/.test(pub.detalhe?.fb?.post_id), pub.detalhe)
const lidos = await so('ler_resultados_agora', { negocio_id: neg.id })
confere('ler resultados agora (simulado): 1 post lido', lidos.length === 1 && lidos[0].ig && !lidos[0].erro, lidos)
const res = await soVer('resultados', { negocio: neg.id })
confere('os resultados guardados têm alcance, curtidas, comentários e salvamentos', res.length === 1 && ['reach', 'likes', 'comments', 'saved'].every(k => typeof res[0].ig?.[k] === 'number'), res[0])
ag = await soVer('agenda', { negocio: neg.id })
confere('a agenda mostra o resultado no post publicado', a1()?.status === 'publicado' && typeof a1()?.resultado?.ig?.reach === 'number')
confere('descartar post já publicado: erro claro', /já saiu/.test(await erroDe(() => so('descartar_post', { post_id: p1.id })) || ''))
await so('descartar_post', { post_id: c1.post_id })
ag = await soVer('agenda', { negocio: neg.id })
confere('descartar o carrossel: sai da agenda (descartado)', a2()?.status === 'descartado', a2()?.status)
confere('a análise do mês não quebra a aba (lista vazia por enquanto)', Array.isArray(await soVer('analise', { negocio: neg.id })))

// um 3º post, aprovado pelos dois, pra publicar PELA TELA
const p3 = await so('criar_post', { negocio_id: neg.id, tipo: 'foto', midia_ids: [ids[1]], legenda: 'Resultado da Lotofácil saiu: confira seu jogo aqui na loja.', quando: amanha + 'T18:00', tema: 'resultado' })
await so('aprovar_equipe', { post_id: p3.id }); await so('aprovar_dono', { post_id: p3.id })
// e um 4º esperando a equipe (pra tela mostrar os botões de aprovar)
const p4 = await so('criar_post', { negocio_id: neg.id, tipo: 'foto', midia_ids: [ids[2]], legenda: 'Dica: guarde sempre o comprovante do seu jogo.', quando: amanha + 'T11:00', tema: 'dica' })

etapa('4. a tela (Chrome sem janela): computador e celular')
fs.mkdirSync(PRINTS, { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maia-social-aba-'))
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(tmp, 'perfil')}`, `--remote-debugging-port=${PORTA}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' })
let alvo
for (let i = 0; i < 60 && !alvo; i++) { await espera(500); alvo = await fetch(`http://127.0.0.1:${PORTA}/json`).then(r => r.json()).then(l => l.find(x => x.type === 'page')).catch(() => null) }
if (!alvo) { chrome.kill(); throw new Error('o Chrome não abriu na porta ' + PORTA) }
const ws = new WebSocket(alvo.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0; const pend = new Map(); const errosJs = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errosJs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errosJs.push('console.error: ' + (m.params.args || []).map(a => a.value || a.description).join(' '))
})
const cdp = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
const ate = async (expr, ms = 20000) => { for (let t = 0; t < ms; t += 250) { if (await js(expr)) return true; await espera(250) } return false }
const abre = async (u) => { await cdp('Page.navigate', { url: u }); await espera(600); await ate('document.readyState==="complete"') }
async function print(nome, largura) {
  const alto = await js('Math.ceil(document.documentElement.scrollHeight)')
  const p = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: largura, height: Math.min(alto, 16000), scale: 1 } })
  const f = path.join(PRINTS, nome); fs.writeFileSync(f, Buffer.from(p.result.data, 'base64')); console.log('  print: ' + f)
}
try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await abre(URL_ + '/maia/operacao/')
  confere('a tela de login abriu', await ate('!!document.querySelector("#f-login")'))
  await js(`(function(){ var i=document.querySelector('#senha'); i.value=${JSON.stringify(SENHA)}; document.querySelector('#f-login').requestSubmit(); return true })()`)
  confere('entrou com a senha', await ate('!document.querySelector("#f-login")'))
  await abre(URL_ + '/maia/operacao/#negocio/' + neg.id + '/social')
  await js('location.reload()'); await espera(800)
  confere('a sub-aba "Social" aparece no negócio e abre', await ate('!!document.querySelector("#subabas a.on") && /Social/.test(document.querySelector("#subabas a.on").innerText) && !!document.querySelector("#sl-page")'))
  confere('a ligação na tela: página preenchida, chave "guardada", Instagram achado', await ate(`document.querySelector("#sl-page").value==="102938475610293" && /guardada/.test(document.querySelector("#soc-lig").innerText) && /achado/.test(document.querySelector("#soc-lig").innerText)`))
  confere('a chave nunca aparece na tela (campo vazio, nem no HTML)', await js(`document.querySelector("#sl-chave").value==="" && document.documentElement.outerHTML.indexOf(${JSON.stringify(CHAVE)})<0`))
  confere('os selos do servidor: modo simulado e social ligada/desligada', await js('/modo simulado/.test(document.querySelector("#soc-lig").innerText) && /social (ligada|desligada) no servidor/.test(document.querySelector("#soc-lig").innerText)'))
  confere('o banco de mídias aparece pra escolher (3 fotos)', await js('document.querySelectorAll("#sn-banco [data-midia]").length===3'))
  confere('a agenda mostra os 4 posts do mês com selo de status', await ate('document.querySelectorAll("#soc-agenda [data-post]").length===4'), await js('document.querySelectorAll("#soc-agenda [data-post]").length'))
  confere('o post esperando a equipe tem "Aprovar", "Pedir ajuste" e "Editar a legenda"', await js(`(function(){ var c=document.querySelector('[data-post="${p4.id}"]'); return !!c && !!c.querySelector('[data-sp=aprovar]') && !!c.querySelector('[data-sp=ajustar]') && !!c.querySelector('[data-sp=editar]') })()`))
  confere('os resultados mostram o post publicado com alcance', await js('/alcance/.test(document.querySelector("#soc-res").innerText) && /publicados/.test(document.querySelector("#soc-res").innerText)'))
  // filtro por status
  await js('document.querySelector("[data-filtro=publicado]").click()')
  confere('o filtro "Publicados" deixa só o publicado', await ate('document.querySelectorAll("#soc-agenda [data-post]").length===1'))
  await js('document.querySelector("[data-filtro=todos]").click()')
  await ate('document.querySelectorAll("#soc-agenda [data-post]").length===4')
  // escolher foto mantém o que foi escrito
  await js(`(function(){ document.querySelector('#sn-leg').value='texto que não pode sumir'; document.querySelector('[data-midia]').click(); return true })()`)
  confere('escolher a foto marca a escolha e não apaga a legenda escrita', await ate(`document.querySelector('#sn-leg').value==='texto que não pode sumir' && document.querySelector('[data-midia]').getAttribute('aria-pressed')==='true'`))
  await print('social-computador.png', 1280)
  // publicar pela tela: a confirmação é dentro da página (sem confirm())
  await js('window.confirm=function(){ window.__usouConfirm=true; return true }; true')
  await js(`document.querySelector('[data-post="${p3.id}"] [data-sp=publicar]').click()`)
  confere('"Publicar agora" abre a confirmação dentro da página', await ate(`!!document.querySelector('[data-post="${p3.id}"] [data-sp="publicar-sim"]') && /Modo simulado/.test(document.querySelector('[data-post="${p3.id}"]').innerText)`))
  await js(`document.querySelector('[data-post="${p3.id}"] [data-sp="publicar-sim"]').click()`)
  confere('publicado pela tela (aparece "Publicado (simulado).")', await ate('document.body.innerText.indexOf("Publicado (simulado).")>=0'))
  confere('não usou confirm() do navegador', !(await js('!!window.__usouConfirm')))
  ag = await soVer('agenda', { negocio: neg.id })
  confere('o post publicado pela tela está "publicado" na agenda', ag.find(p => p.id === p3.id)?.status === 'publicado')
  // aprovar pela tela
  await ate(`!!document.querySelector('[data-post="${p4.id}"] [data-sp=aprovar]')`)
  await js(`document.querySelector('[data-post="${p4.id}"] [data-sp=aprovar]').click()`)
  confere('aprovar pela tela: o post vai pro dono', await ate('document.body.innerText.indexOf("Aprovado: foi pro dono")>=0'))
  ag = await soVer('agenda', { negocio: neg.id })
  confere('na agenda ele está "com o dono" (aprovado_equipe)', ag.find(p => p.id === p4.id)?.status === 'aprovado_equipe')
  // celular
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await js('location.reload()'); await espera(800)
  confere('no celular a aba abre', await ate('document.querySelectorAll("#soc-agenda [data-post]").length===4'))
  confere('no celular não tem rolagem pro lado', await js('document.documentElement.scrollWidth<=window.innerWidth+1'), await js('document.documentElement.scrollWidth+" > "+window.innerWidth'))
  await print('social-celular.png', 390)
  confere('nenhum erro de JavaScript na tela', errosJs.length === 0, errosJs)
} finally {
  try { ws.close() } catch { /* nada */ }
  chrome.kill()
}

etapa('5. nada saiu pra internet')
const rede = fs.existsSync(path.join(RAIZ, PASTA, 'ensaio-rede.jsonl')) ? fs.readFileSync(path.join(RAIZ, PASTA, 'ensaio-rede.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
const bloq = rede.filter(x => x.tipo === 'bloqueada' && !/nextjs|vercel|telemetry|registry.npmjs.org/i.test(x.host || ''))
confere('nenhuma tentativa de sair pra Meta ou pra internet', !bloq.length && !rede.some(x => /facebook/.test(x.host || '')), bloq)
confere('a IA usada foi só a simulada (os slides do carrossel)', rede.some(x => x.tipo === 'ia_falsa' && x.o === 'carrossel'))

console.log(`\n${ok} de ${ok + falha} conferências passaram.`)
if (falha) process.exitCode = 1
