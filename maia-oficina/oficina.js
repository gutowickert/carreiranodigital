// A OFICINA da Maia: pergunta a fila do sistema a cada 5 s, pega a tarefa (arte ou vídeo), baixa a foto/vídeo do dono,
// faz o arquivo e devolve. Também tem os modos de teste, que não falam com a fila.
//   node oficina.js                    → fica rodando (laço)
//   node oficina.js --uma-vez          → pega uma tarefa só (se tiver) e sai
//   node oficina.js --teste-arte  <foto>  "<gancho>" "<cta>" "<nome>"   → grava em saida/
//   node oficina.js --teste-video <video> "<gancho>" "<cta>" "<nome>"   → grava em saida/
// Opcional nos testes: --marca '{"cores":{"primaria":"#0b3d91","secundaria":"#f5a623"}}'  --logo <arquivo>  --id <id da peça>
const { P, fs, path, ff, dataUri, mimeDoArquivo } = require('./comum')
const { gerarArte } = require('./arte')
const { editarVideo } = require('./video')

const URL_BASE = () => (process.env.MAIA_URL || '').replace(/\/+$/, '')
const CHAVE = () => process.env.MAIA_OFICINA_CHAVE || ''
const hora = () => new Date().toLocaleTimeString('pt-BR')
const log = (...a) => console.log(`[${hora()}]`, ...a)

// link relativo (modo local: "/api/maia/arquivo?p=...") ganha o endereço do sistema na frente
const absoluto = u => !u ? null : /^https?:\/\//i.test(u) ? u : URL_BASE() + (u.startsWith('/') ? '' : '/') + u

async function baixa(url, destinoSemExt, mimeSugerido) {
  const r = await fetch(absoluto(url), { headers: { 'x-chave': CHAVE() } })
  if (!r.ok) throw new Error(`não consegui baixar a mídia (${r.status})`)
  const mime = (r.headers.get('content-type') || mimeSugerido || '').split(';')[0].trim()
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heic', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'image/svg+xml': '.svg' }[mime]
    || (mimeSugerido && { 'image/jpeg': '.jpg', 'image/png': '.png', 'video/mp4': '.mp4', 'video/quicktime': '.mov' }[mimeSugerido]) || '.bin'
  const arq = destinoSemExt + ext
  fs.writeFileSync(arq, Buffer.from(await r.arrayBuffer()))
  return { arq, mime }
}

async function logoComoDataUri(url, pasta) {
  if (!url) return null
  try {
    const { arq, mime } = await baixa(url, path.join(pasta, 'logo'), 'image/png')
    const m = mimeDoArquivo(arq) || mime
    return m.startsWith('image/') ? dataUri(fs.readFileSync(arq), m) : null
  } catch (e) { log('  (logo não baixou, segue sem: ' + e.message + ')'); return null }
}

// ── uma tarefa da fila
async function fazTarefa(job, navegador) {
  const { tarefa, peca, negocio, midia } = job
  const pasta = P('trabalho', String(tarefa.id).replace(/[^\w-]+/g, '_'))
  fs.mkdirSync(pasta, { recursive: true })
  try {
    if (!peca) throw new Error('a tarefa veio sem a peça')
    const neg = negocio || {}
    const marca = neg.marca || {}
    const logo = await logoComoDataUri(marca.logo_url, pasta)
    const base = { gancho: peca.gancho || '', cta: peca.cta || '', nome: neg.nome || '', marca, logo, chave: peca.id, navegador }
    if (tarefa.ajuste) log('  pedido de ajuste da equipe: ' + String(tarefa.ajuste).slice(0, 200) + ' (a versão nova troca o layout)')
    let saida, mime
    const arqMidia = midia && midia.url ? (await baixa(midia.url, path.join(pasta, 'midia'), midia.mime)).arq : null
    if (tarefa.tipo === 'arte') {
      if (!arqMidia) log('  sem foto do dono: a arte sai só com as cores da marca')
      saida = path.join(pasta, 'arte.jpg'); mime = 'image/jpeg'
      const r = await gerarArte({ ...base, foto: arqMidia, versao: peca.versao, saida })
      log(`  arte pronta (layout ${r.layout}${r.estourou.length ? ', ATENÇÃO texto apertado: ' + r.estourou.join(',') : ''})`)
    } else if (tarefa.tipo === 'video') {
      if (!arqMidia || (midia.tipo && midia.tipo !== 'video')) throw new Error('a tarefa de vídeo veio sem vídeo do dono')
      saida = path.join(pasta, 'video.mp4'); mime = 'video/mp4'
      const r = await editarVideo({ ...base, video: arqMidia, chaveDeepgram: process.env.DEEPGRAM_API_KEY, saida, pasta, log })
      log(`  vídeo pronto: ${r.duracao.toFixed(1)} s, ${(fs.statSync(saida).size / 1e6).toFixed(1)} MB`)
      saida = cabeNoEnvio(saida, r.duracao)
    } else throw new Error('tipo de tarefa que a oficina não faz: ' + tarefa.tipo)
    // em produção a fila manda um link de envio direto pro armazenamento (o vídeo não passa pela Vercel, que corta em ~4,5 MB);
    // sem link (modo de teste local), vai junto, em base64
    const up = job.upload && job.upload[tarefa.tipo === 'video' ? 'video' : 'arte']
    if (up && up.url) {
      const r = await fetch(up.url, { method: 'PUT', headers: { 'content-type': mime, 'x-upsert': 'true' }, body: fs.readFileSync(saida) })
      if (!r.ok) throw new Error(`o armazenamento não aceitou o arquivo (${r.status}): ${(await r.text()).slice(0, 200)}`)
      await devolve({ tarefa_id: tarefa.id, arquivo_path: up.caminho, mime })
    } else await devolve({ tarefa_id: tarefa.id, arquivo_b64: fs.readFileSync(saida).toString('base64'), mime })
    log('  entregue ✔')
  } catch (e) {
    log('  deu erro: ' + e.message)
    await devolve({ tarefa_id: tarefa.id, erro: e.message }).catch(x => log('  e nem consegui avisar o sistema: ' + x.message))
  } finally {
    if (!process.env.MANTER_TRABALHO) fs.rmSync(pasta, { recursive: true, force: true })
  }
}

// OFICINA_MAX_MB (opcional): o tamanho máximo que o sistema aceita receber de uma vez (a Vercel corta em ~4,5 MB).
// Se o vídeo passar, comprime de novo com a taxa certa pra caber (o arquivo em base64 fica ~33% maior).
function cabeNoEnvio(arq, dur) {
  const max = parseFloat(process.env.OFICINA_MAX_MB || '0')
  if (!max || fs.statSync(arq).size * 1.34 <= max * 1e6) return arq
  const kbps = Math.max(600, Math.floor((max * 1e6 / 1.34 * 0.92 * 8) / dur / 1000) - 96)
  const menor = arq.replace(/\.mp4$/, '-menor.mp4')
  ff(['-i', arq, '-c:v', 'libx264', '-preset', 'medium', '-b:v', kbps + 'k', '-maxrate', kbps + 'k', '-bufsize', kbps * 2 + 'k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', menor])
  log(`  comprimi pra caber no envio: ${(fs.statSync(menor).size / 1e6).toFixed(1)} MB (${kbps} kbps)`)
  return menor
}

async function devolve(corpo) {
  const r = await fetch(URL_BASE() + '/api/maia/oficina', { method: 'POST', headers: { 'content-type': 'application/json', 'x-chave': CHAVE() }, body: JSON.stringify(corpo) })
  if (!r.ok) throw new Error(`o sistema não aceitou a entrega (${r.status}): ${(await r.text()).slice(0, 200)}`)
}

async function pergunta() {
  const r = await fetch(URL_BASE() + '/api/maia/oficina', { headers: { 'x-chave': CHAVE() } })
  if (r.status === 401 || r.status === 403) throw new Error('chave recusada: confere MAIA_OFICINA_CHAVE')
  if (!r.ok) throw new Error(`a fila respondeu ${r.status}`)
  return r.json()
}

async function laco(umaVez) {
  if (!URL_BASE() || !CHAVE()) { console.log('Faltam as variáveis MAIA_URL e MAIA_OFICINA_CHAVE (põe no .env desta pasta).'); process.exit(1) }
  if (!process.env.DEEPGRAM_API_KEY) log('aviso: sem DEEPGRAM_API_KEY, os vídeos saem sem legenda')
  log(`oficina ligada, olhando ${URL_BASE()}${umaVez ? ' (uma vez só)' : ' a cada 5 s'}`)
  let parar = false
  process.on('SIGTERM', () => { parar = true; log('pedido pra desligar: termino a tarefa atual e saio') })
  process.on('SIGINT', () => { parar = true; log('desligando…'); if (!ocupado) process.exit(0) })
  let ocupado = false, erros = 0
  while (!parar) {
    try {
      const job = await pergunta(); erros = 0
      if (job && job.tarefa) {
        ocupado = true
        log(`tarefa ${job.tarefa.id}: ${job.tarefa.tipo} — "${(job.peca && job.peca.gancho || '').slice(0, 60)}" (${job.negocio && job.negocio.nome || '?'})`)
        await fazTarefa(job)
        ocupado = false
        if (umaVez) break
        continue // pode ter mais na fila: pergunta de novo já
      }
      if (umaVez) { log('fila vazia'); break }
    } catch (e) { ocupado = false; erros++; log('não falei com a fila: ' + e.message); if (umaVez) process.exit(1) }
    await new Promise(r => setTimeout(r, Math.min(60000, 5000 * Math.max(1, erros))))
  }
}

// ── modos de teste (sem fila)
function opcao(args, nome) { const i = args.indexOf(nome); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v }
async function teste(tipo, args) {
  const marca = JSON.parse(opcao(args, '--marca') || '{}')
  const logoArq = opcao(args, '--logo'), id = opcao(args, '--id'), nomeSaida = opcao(args, '--saida')
  const [midia, gancho, cta, nome] = args
  if (!midia || !fs.existsSync(midia) || !gancho) { console.log(`Uso: node oficina.js --teste-${tipo} <arquivo> "<gancho>" "<cta>" "<nome>"`); process.exit(1) }
  fs.mkdirSync(P('saida'), { recursive: true })
  const logo = logoArq ? dataUri(fs.readFileSync(logoArq), mimeDoArquivo(logoArq) || 'image/png') : null
  const base = (nomeSaida || `${tipo}-${path.basename(midia).replace(/\.[^.]+$/, '')}-${Date.now().toString(36)}`).replace(/[^\w-]+/g, '-')
  const t0 = Date.now()
  if (tipo === 'arte') {
    const saida = P('saida', base + '.jpg')
    const r = await gerarArte({ foto: midia, gancho, cta, nome, marca, logo, chave: id || gancho, versao: 1, saida })
    console.log(`Pronto: ${saida}\n  layout ${r.layout}, título ${r.tamanhos.tit}px, brilho ${r.brilho.toFixed(2)}${r.estourou.length ? ', TEXTO APERTADO: ' + r.estourou.join(',') : ''} (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  } else {
    const saida = P('saida', base + '.mp4'), pasta = P('saida', 'trabalho-' + base)
    const r = await editarVideo({ video: midia, gancho, cta, nome, marca, logo, chave: id || gancho, chaveDeepgram: process.env.DEEPGRAM_API_KEY, saida, pasta, log: console.log })
    console.log(`Pronto: ${saida}\n  ${r.duracao.toFixed(1)} s, ${(fs.statSync(saida).size / 1e6).toFixed(1)} MB, ${r.palavras} palavras, ${r.blocos} legendas, ${r.deitado ? 'deitado (fundo desfocado)' : 'em pé'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  }
}

const args = process.argv.slice(2)
;(async () => {
  if (args[0] === '--teste-arte') await teste('arte', args.slice(1))
  else if (args[0] === '--teste-video') await teste('video', args.slice(1))
  else await laco(args.includes('--uma-vez'))
})().catch(e => { console.log('Não deu: ' + e.message); process.exit(1) })

module.exports = { fazTarefa }
