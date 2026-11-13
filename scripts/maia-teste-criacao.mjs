// Maia: teste da LOCUÇÃO e do CARROSSEL (13/11), de ponta a ponta, com a IA, a voz e a oficina DE VERDADE e o banco em MODO LOCAL.
//   1. um negócio de teste (dados da Wood) com vídeos e fotos REAIS dela (vídeos brutos que o Anderson gravou);
//   2. geraAnuncios pede 1 anúncio com locução → a fila; criaCarrossel monta um carrossel de dica → a fila;
//   3. um servidor local responde as rotas de verdade (/api/maia/oficina e /api/maia/arquivo) e a oficina (node oficina.js
//      --uma-vez) pega as tarefas, gera a voz (na rota), monta o vídeo e os slides e devolve;
//   4. confere: peças na revisão da equipe, slides no post da agenda, custo por tipo (custo.ts) e copia tudo pra pasta de saída.
// Nada sai pra Meta nem pro WhatsApp: o fetch deste processo só deixa passar a IA (Anthropic), a voz (ElevenLabs), a Deepgram e
// o servidor local. As chaves vêm do .env.local do repositório principal (só lidas aqui, nunca mostradas).
// Uso: node scripts/maia-teste-criacao.mjs [pasta de saída]
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
const SAIDA = process.argv[2] || 'C:/Users/carre/Desktop/Maia-teste-locucao-carrossel-13-11'
const WOOD = 'C:/Users/carre/Desktop/Wood - Segatto'
const PASTA = '.maia-teste/criacao'
fs.rmSync(path.join(RAIZ, PASTA), { recursive: true, force: true })
fs.mkdirSync(SAIDA, { recursive: true })

// as chaves (só as 3 que o teste usa)
const ENV = ['C:/carreiranodigital/.env.local', path.join(RAIZ, '.env.local')].find(f => fs.existsSync(f))
for (const l of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*(ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|DEEPGRAM_API_KEY)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
for (const k of ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY']) if (!process.env[k]) { console.log('falta a chave ' + k); process.exit(1) }
Object.assign(process.env, { MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: PASTA, MAIA_OFICINA_CHAVE: 'oficina-teste-1311', MAIA_SEM_AVISO: '1', MAIA_SOCIAL_LIGADO: '', MAIA_META_REAL: '' })
process.chdir(RAIZ)

// ---------- o fetch vigiado: só a IA, a voz, a Deepgram e o servidor local ----------
const PODE = ['api.anthropic.com', 'api.elevenlabs.io', 'api.deepgram.com', '127.0.0.1']
const ia = [], voz = []
const fetchReal = globalThis.fetch
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url))
  if (!PODE.includes(u.hostname)) throw new Error('o teste não deixa chamar ' + u.hostname)
  const r = await fetchReal(url, opts)
  if (u.hostname === 'api.anthropic.com') { const j = await r.clone().json().catch(() => ({})); ia.push({ modelo: j.model, usage: j.usage }) }
  if (u.hostname === 'api.elevenlabs.io') voz.push({ caracteres: JSON.parse(opts.body).text.length })
  return r
}

const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const { maiaDb: db } = await jiti.import(path.join(RAIZ, 'lib/maia/db.ts'))
const { geraAnuncios } = await jiti.import(path.join(RAIZ, 'lib/maia/pecas.ts'))
const { criaCarrossel } = await jiti.import(path.join(RAIZ, 'lib/maia/carrossel.ts'))
const { custoDoNegocio, usd, usdVoz } = await jiti.import(path.join(RAIZ, 'lib/maia/custo.ts'))
const rotaOficina = await jiti.import(path.join(RAIZ, 'app/api/maia/oficina/route.ts'))
const rotaArquivo = await jiti.import(path.join(RAIZ, 'app/api/maia/arquivo/route.ts'))
const oficina = createRequire(import.meta.url)(path.join(RAIZ, 'maia-oficina/comum.js'))
const DOLAR = 5.5

// ---------- 1. o negócio e as mídias reais ----------
const inicio = new Date(Date.now() - 1000).toISOString()
const neg = await db.insere('negocios', {
  nome: 'Wood Arte a Laser', nicho: 'copos, garrafas e cuias personalizados com gravação a laser', cidade: 'Lajeado', regiao: 'Lajeado e Arroio do Meio',
  dono_nome: 'Anderson', dono_whatsapp: '5500077770013', plano: 'completa', status: 'ativo',
  marca: { cores: { primaria: '#3d4f54', secundaria: '#f2efe8' } },
  contexto: {
    produtos: 'copo térmico 473 ml R$ 69,90; garrafa térmica 650 ml R$ 79,90; garrafa térmica 800 ml R$ 89,90; copo de café 360 ml R$ 49,90; cuia R$ 49,90. Tudo com gravação a laser (nome, frase, desenho ou foto).',
    publico: 'quem quer dar um presente personalizado (mães, casais, aniversário, empresas); quem compra é mais mulher de 35 a 64 anos',
    como_pedir: 'pelo WhatsApp: a pessoa manda o nome ou a arte e a gente mostra como fica antes de gravar',
    atende: 'Lajeado e Arroio do Meio', whatsapp_publico: '5551992858341', video_locucao: true,
  },
})
await db.atualiza('negocios', { id: neg.id }, { marca: { ...neg.marca, logo_path: await db.sobe(`${neg.id}/marca/logo.jpg`, fs.readFileSync(`${WOOD}/marca/logo-wood.jpg`), 'image/jpeg') } })
const B = `${WOOD}/videos-brutos`
const VIDEOS = [
  [`${B}/6 - copo girando no prato preto/WhatsApp Video 2026-10-28 at 15.12.36 (1).mp4`, 'Vídeo sem fala: copo térmico gravado a laser girando num prato preto, bem nítido.'],
  [`${B}/3 - cozinha, cafe caindo no copo/IMG_6902.MOV`, 'Vídeo sem fala: café sendo servido no copo gravado, na cozinha. Nítido.'],
  [`${B}/1 - crianca pequena em casa com a garrafa/IMG_6892.MOV`, 'Vídeo sem fala: criança pequena em casa segurando a garrafa gravada.'],
  [`${B}/5 - moca tomando no copo no sofa/IMG_6904.MOV`, 'Vídeo sem fala: moça tomando no copo gravado, sentada no sofá.'],
  [`${B}/2 - turma no skate com as garrafas/IMG_6911.MOV`, 'Vídeo sem fala: turma de amigos no skate com as garrafas gravadas.'],
]
const videos = []
for (const [arq, descricao] of VIDEOS) {
  const s = oficina.sonda(arq), ext = path.extname(arq).toLowerCase()
  const caminho = await db.sobe(`${neg.id}/midias/v${videos.length}${ext}`, fs.readFileSync(arq), ext === '.mov' ? 'video/quicktime' : 'video/mp4')
  videos.push(await db.insere('midias', { negocio_id: neg.id, tipo: 'video', path: caminho, mime: ext === '.mov' ? 'video/quicktime' : 'video/mp4', descricao: `Vídeo de ${Math.round(s.dur)} s. ${descricao}`, duracao: s.dur }))
}
// as fotos do carrossel: quadros dos vídeos reais (o HDR do iPhone convertido) + fotos reais da Wood
const QUADROS = [
  [`${B}/6 - copo girando no prato preto/WhatsApp Video 2026-10-28 at 15.12.36 (1).mp4`, 0.4, 'copo térmico gravado com nome, no prato preto'],
  [`${B}/3 - cozinha, cafe caindo no copo/IMG_6902.MOV`, 0.5, 'café caindo no copo gravado, na cozinha'],
  [`${B}/5 - moca tomando no copo no sofa/IMG_6904.MOV`, 0.5, 'moça tomando no copo gravado, no sofá'],
  [`${B}/1 - crianca pequena em casa com a garrafa/IMG_6893.MOV`, 0.4, 'criança pequena com a garrafa gravada, em casa'],
  [`${B}/4 - cozinha, geladeira e garrafa com agua/IMG_6899.MOV`, 0.5, 'garrafa gravada com água, na cozinha perto da geladeira'],
  [`${B}/2 - turma no skate com as garrafas/IMG_6913.MOV`, 0.5, 'turma de amigos no skate com as garrafas gravadas'],
]
const fotos = []
const tmp = path.join(RAIZ, PASTA, 'quadros'); fs.mkdirSync(tmp, { recursive: true })
for (const [arq, f, descricao] of QUADROS) {
  const s = oficina.sonda(arq), jpg = path.join(tmp, `q${fotos.length}.jpg`)
  oficina.ff(['-ss', (s.dur * f).toFixed(2), '-i', arq, '-frames:v', '1', '-vf', (s.hdr ? oficina.COR_HDR() : '') + 'format=yuvj420p', '-q:v', '2', jpg])
  fotos.push(await db.insere('midias', { negocio_id: neg.id, tipo: 'foto', path: await db.sobe(`${neg.id}/midias/f${fotos.length}.jpg`, fs.readFileSync(jpg), 'image/jpeg'), mime: 'image/jpeg', descricao: `Foto nítida: ${descricao}.` }))
}
fotos.push(await db.insere('midias', { negocio_id: neg.id, tipo: 'foto', path: await db.sobe(`${neg.id}/midias/f-abridor.jpg`, fs.readFileSync(`${B}/7 - outros produtos (abridor)/WhatsApp Image 2026-11-06 at 08.19.17.jpeg`), 'image/jpeg'), mime: 'image/jpeg', descricao: 'Foto nítida: abridor de garrafa gravado a laser (outro produto da Wood).' }))
console.log(`negócio ${neg.id}: ${videos.length} vídeos e ${fotos.length} fotos reais`)

// ---------- 2. as peças ----------
const r1 = await geraAnuncios(neg, { quantidade: 1, locucao: true, midia_ids: videos.map(v => v.id) })
console.log('anúncio:', JSON.stringify(r1.pecas || r1))
const r2 = await criaCarrossel(neg.id, { quando: '2026-11-20T18:00', tema: 'Como escolher o presente personalizado de Natal sem errar', tipo: 'dica', midia_ids: fotos.map(f => f.id), quantos: 7 })
console.log(`carrossel: ${r2.slides.length} slides →`, r2.slides.map(s => `[${s.estilo}] ${s.texto}`).join(' | '))

// ---------- 3. o servidor local com as rotas de verdade + a oficina ----------
const servidor = http.createServer(async (req, res) => {
  try {
    const corpo = await new Promise(ok => { const b = []; req.on('data', c => b.push(c)); req.on('end', () => ok(Buffer.concat(b))) })
    const url = `http://127.0.0.1:${servidor.address().port}${req.url}`
    const r = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo })
    const rota = req.url.startsWith('/api/maia/oficina') ? rotaOficina : req.url.startsWith('/api/maia/arquivo') ? rotaArquivo : null
    const h = rota && rota[req.method]
    const resp = h ? await h(r) : new Response('não', { status: 404 })
    res.writeHead(resp.status, Object.fromEntries(resp.headers)); res.end(Buffer.from(await resp.arrayBuffer()))
  } catch (e) { console.log('erro na rota:', e.message); res.writeHead(500); res.end(String(e.message)) }
})
await new Promise(ok => servidor.listen(0, '127.0.0.1', ok))
const MAIA_URL = `http://127.0.0.1:${servidor.address().port}`
const rodaOficina = () => new Promise((ok, falha) => {
  const p = spawn(process.execPath, ['oficina.js', '--uma-vez'], { cwd: path.join(RAIZ, 'maia-oficina'), stdio: 'inherit', env: { ...process.env, MAIA_URL, MAIA_OFICINA_CHAVE: process.env.MAIA_OFICINA_CHAVE } })
  p.on('exit', c => (c === 0 ? ok() : falha(new Error('a oficina saiu com ' + c))))
})
const t0 = Date.now()
for (let i = 0; i < 6; i++) {
  const fila = (await db.lista('tarefas', { negocio_id: neg.id })).filter(t => t.status === 'fila' && (t.tipo === 'arte' || t.tipo === 'video'))
  if (!fila.length) break
  await rodaOficina()
}
servidor.close()
console.log(`oficina: ${((Date.now() - t0) / 1000).toFixed(0)} s`)

// ---------- 4. confere e copia ----------
const pecas = await db.lista('pecas', { negocio_id: neg.id })
const tarefas = await db.lista('tarefas', { negocio_id: neg.id })
let ok = true
for (const p of pecas) {
  const t = tarefas.find(x => x.peca_id === p.id) || {}
  const nome = t.dados?.variante || p.tipo
  console.log(`- ${p.status} · ${p.tipo}${t.dados?.variante ? ' (' + t.dados.variante + ')' : ''} · "${p.gancho || p.titulo}" · ${p.arquivo_path || 'sem arquivo'}`)
  if (p.status !== 'revisao_equipe' || !p.arquivo_path) { ok = false; console.log('   tarefa:', t.status, JSON.stringify(t.resultado || {})) }
  if (t.dados?.variante === 'locucao' && p.arquivo_path) {
    fs.copyFileSync(db.arquivoLocal(p.arquivo_path), path.join(SAIDA, 'video-locucao.mp4'))
    const loc = t.dados.locucao || {}
    if (loc.caminho) fs.copyFileSync(db.arquivoLocal(loc.caminho), path.join(SAIDA, 'locucao.mp3'))
    fs.writeFileSync(path.join(SAIDA, 'locucao-roteiro.txt'), `GANCHO: ${p.gancho}\nTEXTO: ${p.texto}\nCTA: ${p.cta}\n\nROTEIRO DA LOCUÇÃO (${(loc.duracao || 0).toFixed(1)} s):\n${(loc.partes || []).map(x => `[${x.papel}] ${x.texto}`).join('\n')}\n`)
    fs.writeFileSync(path.join(SAIDA, 'locucao-palavras.json'), JSON.stringify(loc.palavras || []))
  }
  if (t.dados?.variante === 'carrossel') {
    const post = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'social_post' }))[0]
    const midias = post?.detalhe?.midias || []
    if (midias.length !== (t.dados.slides || []).length) { ok = false; console.log('   o post da agenda ficou com', midias.length, 'slides') }
    midias.forEach((m, i) => fs.copyFileSync(db.arquivoLocal(m.caminho), path.join(SAIDA, `carrossel-${String(i + 1).padStart(2, '0')}.jpg`)))
    fs.writeFileSync(path.join(SAIDA, 'carrossel-textos.txt'), `${t.dados.slides.map((s, i) => `${i + 1}. [${s.estilo}] ${s.texto}${s.apoio ? '\n   ' + s.apoio : ''}`).join('\n')}\n\nLEGENDA:\n${p.texto}\n`)
  }
  void nome
}

// o custo: o que o custo.ts mostra pro negócio (por tipo) + a conta de cada chamada deste teste
const c = await custoDoNegocio(neg.id, inicio)
const iaUsd = ia.reduce((a, x) => a + usd({ modelo: x.modelo, entrada: x.usage?.input_tokens, saida: x.usage?.output_tokens, cache_lido: x.usage?.cache_read_input_tokens, cache_gravado: x.usage?.cache_creation_input_tokens }), 0)
const vozUsd = voz.reduce((a, x) => a + usdVoz(x), 0)
const resumo = { custo_por_tipo_reais: c.por_tipo, total_reais: c.reais, chamadas_ia: ia.length, voz_caracteres: voz.reduce((a, x) => a + x.caracteres, 0), conferencia: { ia_reais: +(iaUsd * DOLAR).toFixed(4), voz_reais: +(vozUsd * DOLAR).toFixed(4) } }
console.log('custo:', JSON.stringify(resumo, null, 1))
fs.writeFileSync(path.join(SAIDA, 'custo.json'), JSON.stringify(resumo, null, 1))
console.log(ok ? `\nOK: vídeo com locução e carrossel feitos pela oficina e na revisão da equipe. Arquivos em ${SAIDA}` : '\nFALHOU: veja acima')
process.exit(ok ? 0 : 1)
