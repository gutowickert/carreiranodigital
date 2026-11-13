// O VÍDEO do anúncio (vertical 1080x1920). Regras do Guto pra vídeo de cliente, que aqui são lei:
//   - o vídeo fica na sequência em que foi gravado: NÃO corta o meio e NÃO reordena;
//   - nada de texto inventado: a legenda é a fala transcrita, o cartão final é o gancho, o CTA e o nome;
//   - pode tirar o silêncio morto do começo e do fim.
// O que faz: legenda no tempo da fala (Deepgram nova-3, pt-BR) na parte de baixo, com a palavra falada em destaque;
// vídeo deitado vira vertical com fundo desfocado; cartão final de 2,5 s nas cores da marca;
// trilha bem baixa só se tiver um arquivo em trilhas/. Sai MP4 H.264 + AAC com faststart.
// (A base veio do editor da ótica Tempo de Visão: a conversão do HDR do iPhone, a legenda palavra a palavra
//  feita de PNGs do Chrome e a camada montada com o "concat" do ffmpeg.)
const crypto = require('crypto')
const { P, ff, sonda, COR_HDR, abreNavegador, coresDaMarca, fontesDaMarca, RESERVA, carregaPagina, encolhe, esc, numeroDe, fs, path } = require('./comum')
const { separaGancho } = require('./arte')

const W = 1080, H = 1920, FPS = 30
const FINAL = 2.5, TRANSICAO = 0.3
const MAXIMO = 60 - FINAL          // o vídeo inteiro fica em ~60 s
const ANTES = 0.3, DEPOIS = 0.5    // folga antes da 1ª palavra e depois da última (pra não comer o som)
const FAIXA = 420                  // altura da faixa da legenda
// 08/11 (teste completo, 8a): o vídeo do teste ficou 15 s sem NENHUM texto (sem fala = sem legenda; o gancho só no cartão
// final). Agora tem texto na tela desde o 1º quadro: o GANCHO em cima nos primeiros segundos e, sem fala, as frases do texto
// do anúncio embaixo, uma por vez (com fala, a legenda da fala como sempre). Nada inventado: só o texto da peça aprovada.
const GANCHO_ATE = 3.5             // segundos com o gancho em cima
const FAIXA_TOPO = 560, TOPO_Y = 210

// ── transcrição: palavras com o tempo de cada uma
// "termos" = o nome do negócio: ajuda a transcrição a escrever certo (ex.: "Tempo de Visão" e não "tempo de visão")
async function transcreve(wav, chave, pastaCache, log, termos = []) {
  const buf = fs.readFileSync(wav)
  const cache = path.join(pastaCache, 'transcricao-' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '.json')
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'))
  let ultimo = ''
  for (const modelo of ['nova-3', 'nova-2']) {
    const extra = termos.filter(Boolean).map(t => (modelo === 'nova-3' ? '&keyterm=' : '&keywords=') + encodeURIComponent(t)).join('')
    const r = await fetch(`https://api.deepgram.com/v1/listen?model=${modelo}&language=pt-BR&punctuate=true&smart_format=true${extra}`, {
      method: 'POST', headers: { Authorization: 'Token ' + chave, 'Content-Type': 'audio/wav' }, body: buf,
    })
    if (r.ok) {
      const j = await r.json()
      const alt = j.results && j.results.channels && j.results.channels[0].alternatives[0] || {}
      const palavras = (alt.words || []).map(w => ({ txt: w.punctuated_word || w.word, ini: w.start, fim: w.end }))
      const res = { modelo, texto: alt.transcript || '', palavras }
      fs.writeFileSync(cache, JSON.stringify(res))
      return res
    }
    ultimo = r.status + ' ' + (await r.text()).slice(0, 160)
    log(`  a transcrição com ${modelo} não deu (${r.status}); ${modelo === 'nova-3' ? 'tentando nova-2' : 'desisto'}`)
    if (r.status === 401 || r.status === 402 || r.status === 403) break
  }
  throw new Error('a transcrição falhou: ' + ultimo)
}

// ── as legendas: blocos curtos (até 4 palavras / ~22 letras), quebrando nas pausas e no fim de frase
function montaBlocos(palavras) {
  const blocos = []; let bl = null, ant = null
  for (const p of palavras) {
    const pausa = ant && p.ini - ant.fim > 0.6
    if (bl && (pausa || bl.p.length >= 4 || (bl.p.map(x => x.txt).join(' ') + ' ' + p.txt).length > 22)) { blocos.push(bl); bl = null }
    if (!bl) bl = { p: [] }
    bl.p.push(p); ant = p
    if (/[.?!,;:]$/.test(p.txt)) { blocos.push(bl); bl = null }
  }
  if (bl) blocos.push(bl)
  blocos.forEach((b, i) => {
    b.t0 = Math.max(0, b.p[0].ini - 0.05)
    const prox = blocos[i + 1], fimFala = b.p[b.p.length - 1].fim
    b.t1 = prox && prox.p[0].ini - fimFala < 0.6 ? Math.max(0, prox.p[0].ini - 0.05) : fimFala + 0.3
  })
  return blocos
}

const htmlLegenda = (b, ativa, cores, fontes) => {
  const ws = b.p.map((p, j) => j === ativa
    ? `<span class="w a">${esc(p.txt)}</span>`
    : `<span class="w"${j > ativa ? ' style="visibility:hidden"' : ''}>${esc(p.txt)}</span>`).join(' ')
  return `<!doctype html><html><head><meta charset="utf-8"><link href="${fontes.link}" rel="stylesheet"><style>
*{box-sizing:border-box;margin:0;padding:0}html,body{width:${W}px;height:${FAIXA}px;background:transparent;overflow:hidden}
#l{position:absolute;left:70px;right:70px;top:20px;max-height:${FAIXA - 40}px;text-align:center;font-family:"${fontes.texto}",${RESERVA};font-weight:800;font-size:80px;line-height:1.24;color:#fff;
 text-shadow:0 0 4px #000,0 3px 3px #000,0 4px 18px rgba(0,0,0,.85);-webkit-text-stroke:2px rgba(0,0,0,.55);paint-order:stroke fill;overflow:hidden}
.w{display:inline-block}
.a{background:${cores.botao};color:${cores.textoBotao};padding:0 16px;border-radius:14px;text-shadow:none;-webkit-text-stroke:0;box-shadow:0 8px 22px rgba(0,0,0,.45)}
</style></head><body><div id="l">${ws}</div></body></html>`
}

// o gancho em cima (caixa na cor da marca, como o cabeçalho da arte)
const htmlTopo = (gancho, cores, fontes) => `<!doctype html><html><head><meta charset="utf-8"><link href="${fontes.link}" rel="stylesheet"><style>
*{box-sizing:border-box;margin:0;padding:0}html,body{width:${W}px;height:${FAIXA_TOPO}px;background:transparent;overflow:hidden}
#c{position:absolute;left:60px;right:60px;top:10px;max-height:${FAIXA_TOPO - 40}px;display:flex;justify-content:center}
#g{display:inline-block;max-width:100%;background:${cores.primaria};color:${cores.texto};border-left:16px solid ${cores.botao};border-radius:10px 28px 28px 10px;
 padding:30px 42px 34px;font-family:"${fontes.titulo}",${RESERVA};font-weight:900;font-size:84px;line-height:1.08;letter-spacing:-.01em;text-align:left;
 box-shadow:0 18px 50px rgba(0,0,0,.4);overflow:hidden;overflow-wrap:break-word;max-height:${FAIXA_TOPO - 40}px}
</style></head><body><div id="c"><div id="g">${esc(gancho)}</div></div></body></html>`

// uma frase do texto do anúncio na faixa de baixo (vídeo sem fala): mesmo estilo da legenda, inteira na tela
const htmlFrase = (txt, cores, fontes) => `<!doctype html><html><head><meta charset="utf-8"><link href="${fontes.link}" rel="stylesheet"><style>
*{box-sizing:border-box;margin:0;padding:0}html,body{width:${W}px;height:${FAIXA}px;background:transparent;overflow:hidden}
#l{position:absolute;left:70px;right:70px;top:20px;max-height:${FAIXA - 40}px;text-align:center;font-family:"${fontes.texto}",${RESERVA};font-weight:800;font-size:72px;line-height:1.2;color:#fff;
 text-shadow:0 0 4px #000,0 3px 3px #000,0 4px 18px rgba(0,0,0,.85);-webkit-text-stroke:2px rgba(0,0,0,.55);paint-order:stroke fill;overflow:hidden}
</style></head><body><div id="l">${esc(txt)}</div></body></html>`

// o texto do anúncio em frases curtas (até ~40 letras), na ordem
function frasesDoTexto(texto) {
  const out = []
  for (const f of String(texto || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean)) {
    // frase comprida: divide em partes de tamanho parecido (nada de uma palavra sozinha numa tela)
    const ws = f.split(' '), partes = Math.ceil(f.length / 46), alvo = f.length / partes
    let atual = ''
    for (const w of ws) { if (atual && (atual + ' ' + w).length > alvo + 6 && out.length < 99) { out.push(atual); atual = w } else atual = (atual + ' ' + w).trim() }
    if (atual) out.push(atual)
  }
  return out
}

const htmlCartao = ({ gancho, cta, nome, logo, cores, fontes }) => {
  const { etiqueta, titulo } = separaGancho(gancho), C = cores, n = titulo.length
  const tam = n <= 22 ? 140 : n <= 40 ? 124 : n <= 64 ? 104 : 86
  return `<!doctype html><html><head><meta charset="utf-8"><link href="${fontes.link}" rel="stylesheet"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;font-family:"${fontes.texto}",${RESERVA};-webkit-font-smoothing:antialiased;
 background:radial-gradient(circle at 20% 15%, ${C.secundaria}44, transparent 55%), radial-gradient(circle at 85% 90%, ${C.botao}33, transparent 50%), ${C.primaria}}
.faixa{position:absolute;left:0;right:0;height:22px;background:${C.botao}}
#caixa{position:absolute;left:80px;right:80px;top:300px;height:1150px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:44px;overflow:hidden}
#caixa>*{flex:none}
#logo{height:190px;max-width:520px;background:#fff;border-radius:28px;padding:20px 28px;display:flex;align-items:center;justify-content:center;flex:none}
#logo img{max-height:150px;max-width:464px;object-fit:contain}
#etq{display:inline-block;max-width:100%;background:${C.botao};color:${C.textoBotao};font-weight:800;font-size:50px;line-height:1.15;padding:14px 32px;border-radius:18px;margin-bottom:28px}
#tit{font-family:"${fontes.titulo}",${RESERVA};font-weight:900;font-size:${tam}px;line-height:1.05;letter-spacing:-.015em;color:${C.texto};max-height:600px;padding-top:.08em;padding-bottom:.1em;overflow:hidden;overflow-wrap:break-word;width:100%}
#cta{max-width:100%;white-space:nowrap;background:${C.botao};color:${C.textoBotao};font-weight:800;font-size:66px;line-height:1.12;padding:32px 72px;border-radius:999px;box-shadow:0 16px 40px rgba(0,0,0,.3);overflow:hidden;overflow-wrap:break-word}
#nome{color:${C.texto};opacity:.92;font-weight:700;font-size:58px;line-height:1.15;max-width:100%;overflow-wrap:break-word}
</style></head><body><div class="faixa" style="top:0"></div><div class="faixa" style="bottom:0"></div>
<div id="caixa">${logo ? `<div id="logo"><img src="${logo}"></div>` : ''}
<div style="width:100%">${etiqueta ? `<div id="etq">${esc(etiqueta)}</div>` : ''}<div id="tit">${esc(titulo)}</div></div>
${cta ? `<div id="cta">${esc(cta)}</div>` : ''}<div id="nome">${esc(nome)}</div></div></body></html>`
}

// a camada de legenda: uma lista de PNGs com quanto tempo cada um fica na tela → um .mov com transparência
function camada(segs, dur, pasta, nome, vazio = 'vazio.png') {
  let tt = 0; const L = []
  const poe = (arq, d) => { if (d > 0.001) { L.push(`file '${arq}'\nduration ${d.toFixed(4)}`); tt += d } }
  for (const s of segs) { poe(vazio, s.t0 - tt); poe(s.arq, s.t1 - tt) }
  poe(vazio, dur - tt); L.push(`file '${vazio}'`)
  fs.writeFileSync(path.join(pasta, nome + '.txt'), L.join('\n'))
  const saida = path.join(pasta, nome + '.mov')
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(pasta, nome + '.txt'), '-vf', `fps=${FPS},format=rgba`, '-c:v', 'qtrle', '-t', dur.toFixed(3), saida])
  return saida
}

function escolheTrilha(chave) {
  const pasta = P('trilhas')
  if (!fs.existsSync(pasta)) return null
  const l = fs.readdirSync(pasta).filter(x => /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(x)).sort()
  return l.length ? path.join(pasta, l[numeroDe(chave) % l.length]) : null
}

// 13/11: as camadas de texto (cartão final, gancho em cima, legenda da fala ou frases do texto) saíram do editarVideo pra cá:
// o vídeo com locução (editarLocucao) usa as mesmas. "fala" = palavras com o tempo já contado a partir do início do vídeo
async function desenhaCamadas({ gancho, cta, texto, nome, logo, cores, fontes, fala, DUR, pasta, navegador, log = console.log }) {
  const blocos = fala.length ? montaBlocos(fala) : []
  const br = navegador || await abreNavegador()
  const segs = [], segsTopo = []
  // sem fala: as frases do texto do anúncio embaixo, depois do gancho, até o fim (cada uma pelo menos 2,2 s)
  const frases = !blocos.length ? frasesDoTexto(texto) : []
  const iniFrases = gancho ? Math.min(GANCHO_ATE, DUR * 0.4) : 0.2
  const porFrase = frases.length ? Math.max(2.2, (DUR - 0.2 - iniFrases) / frases.length) : 0
  try {
    const pg = await br.newPage()
    await pg.setViewport({ width: W, height: H })
    await carregaPagina(pg, htmlCartao({ gancho, cta, nome, logo, cores, fontes }), fontes)
    // 08/11 (reteste): o CTA encolhe ANTES do título (um CTA comprido passava da caixa e o título encolhia até sumir)
    await encolhe(pg, [['etq', 26], ['cta', 30], ['tit', 50, 'caixa'], ['tit', 50], ['nome', 28, 'caixa']])
    await pg.screenshot({ path: path.join(pasta, 'cartao.png') })
    // o gancho em cima, do 1º quadro até ~3,5 s
    if (gancho) {
      await pg.setViewport({ width: W, height: FAIXA_TOPO })
      await carregaPagina(pg, '<html><body style="background:transparent"></body></html>', fontes)
      await pg.screenshot({ path: path.join(pasta, 'vazio-topo.png'), omitBackground: true })
      await carregaPagina(pg, htmlTopo(gancho, cores, fontes), fontes)
      await encolhe(pg, [['g', 44, 'c']])
      await pg.screenshot({ path: path.join(pasta, 'topo.png'), omitBackground: true })
      segsTopo.push({ arq: 'topo.png', t0: 0, t1: Math.min(GANCHO_ATE, Math.max(1.5, DUR - 0.3)) })
    }
    if (frases.length) {
      await pg.setViewport({ width: W, height: FAIXA })
      await carregaPagina(pg, '<html><body style="background:transparent"></body></html>', fontes)
      await pg.screenshot({ path: path.join(pasta, 'vazio.png'), omitBackground: true })
      for (let i = 0; i < frases.length; i++) {
        const t0 = iniFrases + i * porFrase, t1 = Math.min(DUR - 0.1, t0 + porFrase)
        if (t1 - t0 < 1.2) break
        const arq = `f${i}.png`
        await carregaPagina(pg, htmlFrase(frases[i], cores, fontes), fontes)
        await encolhe(pg, [['l', 40]])
        await pg.screenshot({ path: path.join(pasta, arq), omitBackground: true })
        segs.push({ arq, t0, t1 })
      }
    }
    if (blocos.length) {
      await pg.setViewport({ width: W, height: FAIXA })
      await carregaPagina(pg, '<html><body style="background:transparent"></body></html>', fontes)
      await pg.screenshot({ path: path.join(pasta, 'vazio.png'), omitBackground: true })
      let n = 0
      for (const bl of blocos) {
        for (let j = 0; j < bl.p.length; j++) {
          const t0 = j === 0 ? bl.t0 : bl.p[j].ini, t1 = j + 1 < bl.p.length ? bl.p[j + 1].ini : bl.t1
          if (t1 - t0 < 0.01) continue
          const arq = `l${n++}.png`
          await carregaPagina(pg, htmlLegenda(bl, j, cores, fontes), fontes)
          await encolhe(pg, [['l', 40]])
          await pg.screenshot({ path: path.join(pasta, arq), omitBackground: true })
          segs.push({ arq, t0: Math.max(t0, segs.length ? segs[segs.length - 1].t1 : 0), t1: Math.min(t1, DUR) })
        }
      }
    }
    await pg.close()
  } finally { if (!navegador) await br.close() }
  log(`  legendas: ${blocos.length} blocos, ${segs.length} quadros${frases.length ? ` (sem fala: ${segs.length} frase(s) do texto)` : ''}${segsTopo.length ? ', gancho em cima até ' + segsTopo[0].t1.toFixed(1) + ' s' : ''}`)
  const leg = segs.length ? camada(segs.filter(x => x.t1 > x.t0), DUR, pasta, 'legendas') : null
  const topo = segsTopo.length ? camada(segsTopo, DUR, pasta, 'topo', 'vazio-topo.png') : null

  return { leg, topo, blocos, frases, segsTopo }
}

async function editarVideo({ video, gancho, cta, texto, nome, marca, logo, chave, chaveDeepgram, saida, pasta, navegador, log = console.log }) {
  fs.mkdirSync(pasta, { recursive: true })
  const s = sonda(video)
  if (!s.video) throw new Error('o arquivo não tem imagem de vídeo')
  const cores = coresDaMarca(marca || {}), fontes = fontesDaMarca(marca || {})
  // "R$" e o número nunca ficam em linhas diferentes
  const nb = t => String(t || '').replace(/R\$\s?(?=\d)/g, 'R$\u00a0'); gancho = nb(gancho); texto = nb(texto); cta = nb(cta)
  log(`  vídeo: ${s.w}x${s.h}, ${s.dur.toFixed(1)} s${s.hdr ? ', HDR' : ''}${s.audio ? '' : ', sem som'}`)

  // 1. a fala, com o tempo de cada palavra
  let palavras = []
  if (s.audio && chaveDeepgram) {
    const wav = path.join(pasta, 'voz.wav')
    ff(['-i', video, '-vn', '-ac', '1', '-ar', '16000', wav])
    const t = await transcreve(wav, chaveDeepgram, pasta, log, nome ? [nome] : [])
    palavras = t.palavras
    log(`  transcrição (${t.modelo}): ${palavras.length} palavras${t.texto ? ' — "' + t.texto.slice(0, 90) + (t.texto.length > 90 ? '…' : '') + '"' : ''}`)
  } else if (s.audio) log('  sem DEEPGRAM_API_KEY: vai sem legenda')

  // 2. só tira o silêncio do começo e do fim; o meio fica inteiro
  let a = 0, b = s.dur
  if (palavras.length) {
    a = Math.max(0, palavras[0].ini - ANTES)
    b = Math.min(s.dur, palavras[palavras.length - 1].fim + DEPOIS)
  }
  if (b - a > MAXIMO) {
    // passou de ~60 s: corta no FIM (nunca no meio), de preferência num fim de frase
    const cabe = palavras.filter(p => p.fim + DEPOIS <= a + MAXIMO)
    const frase = [...cabe].reverse().find(p => /[.?!]$/.test(p.txt))
    const ult = frase && frase.fim - a > MAXIMO * 0.6 ? frase : cabe[cabe.length - 1]
    b = ult ? Math.min(s.dur, ult.fim + DEPOIS) : a + MAXIMO
    log(`  AVISO: o vídeo passava de ${MAXIMO.toFixed(1)} s; cortei o final em ${(b - a).toFixed(1)} s`)
  }
  const DUR = +(b - a).toFixed(3), TOTAL = +(DUR + FINAL).toFixed(3)
  const fala = palavras.filter(p => p.ini >= a - 0.01 && p.fim <= b + 0.2).map(p => ({ txt: p.txt, ini: p.ini - a, fim: Math.min(p.fim, b) - a }))
  log(`  trecho usado: ${a.toFixed(2)} a ${b.toFixed(2)} s (${DUR.toFixed(1)} s) + cartão final ${FINAL} s`)

  // 3. o enquadramento: em pé = preenche a tela; deitado/quadrado = vídeo inteiro no meio com fundo desfocado
  const deitado = s.w / s.h > 0.8
  const altFrente = deitado ? Math.round(W * s.h / s.w / 2) * 2 : H
  const legY = deitado ? Math.min(1500, Math.max(1240, Math.round(H / 2 + altFrente / 2 + 30))) : 1240

  // 4. as imagens: cartão final e legendas (Chrome)
  const { leg, topo, blocos, frases, segsTopo } = await desenhaCamadas({ gancho, cta, texto, nome, logo, cores, fontes, fala, DUR, pasta, navegador, log })

  // 5. a montagem final (um ffmpeg só)
  const trilha = escolheTrilha(chave || gancho || 'x')
  if (trilha) log('  trilha: ' + path.basename(trilha))
  const ins = ['-ss', a.toFixed(3), '-t', DUR.toFixed(3), '-i', video,
    '-loop', '1', '-framerate', String(FPS), '-t', (FINAL + TRANSICAO).toFixed(3), '-i', path.join(pasta, 'cartao.png')]
  let k = 2
  const iLeg = leg ? (ins.push('-i', leg), k++) : -1
  const iTopo = topo ? (ins.push('-i', topo), k++) : -1
  const iTri = trilha ? (ins.push('-stream_loop', '-1', '-i', trilha), k++) : -1
  const iMudo = !s.audio ? (ins.push('-f', 'lavfi', '-t', TOTAL.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'), k++) : -1

  const cor = s.hdr ? COR_HDR() : ''
  let f = deitado
    ? `[0:v]${cor}fps=${FPS},split[v0a][v0b];[v0a]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=10:3,scale=${W}:${H},eq=brightness=-0.07:saturation=1.1[fundo];[v0b]scale=${W}:${altFrente}[frente];[fundo][frente]overlay=0:(H-h)/2,setsar=1,format=yuv420p[base];`
    : `[0:v]${cor}fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[base];`
  let atual = '[base]'
  if (leg) { f += `${atual}[${iLeg}:v]overlay=0:${legY}:eof_action=pass,format=yuv420p[comleg];`; atual = '[comleg]' }
  if (topo) { f += `${atual}[${iTopo}:v]overlay=0:${TOPO_Y}:eof_action=pass,format=yuv420p[comtopo];`; atual = '[comtopo]' }
  f += `${atual}settb=AVTB[vm];`
  f += `[1:v]scale=${W}:${H},setsar=1,format=yuv420p,settb=AVTB[vc];`
  f += `[vm][vc]xfade=transition=fade:duration=${TRANSICAO}:offset=${(DUR - TRANSICAO).toFixed(3)},format=yuv420p[v];`
  // a voz: tira o grave de fundo e põe no volume padrão do Instagram (-16 LUFS), com fade curtinho nas pontas
  const voz = s.audio
    ? `[0:a]highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, DUR - 0.35).toFixed(3)}:d=0.35,apad=whole_dur=${TOTAL.toFixed(3)}`
    : `[${iMudo}:a]anull`
  if (trilha) {
    const vol = fala.length ? 0.08 : 0.22 // com fala: bem baixinha
    f += `${voz}[voz];[${iTri}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${vol},afade=t=in:d=0.8,afade=t=out:st=${(TOTAL - 1.5).toFixed(3)}:d=1.5,atrim=0:${TOTAL.toFixed(3)}[m];[voz][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`
  } else f += `${voz}[a]`
  fs.writeFileSync(path.join(pasta, 'filtro.txt'), f)
  ff([...ins, '-filter_complex', f, '-map', '[v]', '-map', '[a]', '-t', TOTAL.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-maxrate', '4500k', '-bufsize', '9M', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', saida])
  return { duracao: TOTAL, cortado: { de: +a.toFixed(2), ate: +b.toFixed(2) }, palavras: fala.length, blocos: blocos.length, frases: frases.length, gancho_em_cima: segsTopo.length ? segsTopo[0].t1 : 0, deitado, legY, trilha: trilha ? path.basename(trilha) : null }
}

// ── 13/11: VÍDEO COM LOCUÇÃO (o dono não aparece falando). Vários takes reais do dia a dia + a voz lendo o anúncio por cima.
// Regras: os takes entram NA ORDEM que vieram (a Maia escolheu a ordem); de cada take sai um trecho do meio (sem o tremido do
// começo); o vídeo dura o tempo da locução (+ cartão final); se a locução for mais longa que os takes, volta pro 1º take e
// pega o trecho seguinte. Cada troca de take cai no começo de uma palavra (nunca no meio de uma) quando dá. O som original
// sai (só a voz e, se tiver, a trilha bem baixa). A legenda é a própria locução (tempo de cada palavra da ElevenLabs; sem ele,
// a Deepgram ouve o áudio). Take deitado: o meio dele em 4:5 com fundo desfocado. Nada de texto inventado: legenda = locução,
// gancho em cima e cartão final = gancho, CTA e nome da peça.
const TAKE_MIN = 1.6               // nenhum corte mais curto que isso (fica piscando)
const TAKE_IDEAL = [2.6, 5.5]      // cada corte fica entre isso (ritmo de anúncio)

// os cortes: [{ take, de, dur }] somando "total" segundos
function planoDeCortes(takes, total, palavras = []) {
  const usa = takes.map(t => { const ini = Math.min(0.35, t.dur * 0.1), fim = Math.max(ini + 0.5, t.dur - 0.15); return { ini, fim, cursor: ini } })
  const inicios = palavras.map(p => p.ini).filter(x => x > 0.5)
  // quanto cada corte "quer" durar: o total dividido pelos takes, dentro do ritmo ideal
  const alvo = Math.min(TAKE_IDEAL[1], Math.max(TAKE_IDEAL[0], total / takes.length))
  const cortes = []
  let t = 0, i = 0, voltas = 0
  while (total - t > 0.05 && voltas < 40) {
    // o take da vez; se ele já acabou, o próximo que ainda tem trecho novo (o teste de 13/11 mostrou o mesmo trecho curto
    // voltando 4 vezes). Só quando TODOS acabaram é que recomeça do início de cada um
    // (e nunca o mesmo take duas vezes seguidas, se tiver mais de um)
    const ultimo = cortes.length ? cortes[cortes.length - 1].take : -1
    const serve = x => usa[x].fim - usa[x].cursor >= TAKE_MIN && (x !== ultimo || takes.length === 1)
    let k = i % takes.length
    for (let j = 0; j < takes.length && !serve(k); j++) k = (k + 1) % takes.length
    if (!serve(k)) { usa.forEach(x => { x.cursor = x.ini }); k = i % takes.length; if (k === ultimo && takes.length > 1) k = (k + 1) % takes.length }
    i = k
    const u = usa[k]
    const livre = u.fim - u.cursor
    let dur = Math.min(alvo, livre, total - t)
    // o que sobrar no fim curto demais vai junto neste corte (se o take tiver), senão este corte encurta pra deixar espaço
    const resto = total - t - dur
    if (resto > 0 && resto < TAKE_MIN) dur = livre >= total - t ? total - t : Math.max(TAKE_MIN, dur - (TAKE_MIN - resto))
    // a troca cai no começo de uma palavra (até 0,7 s pra frente ou pra trás), se o take tiver espaço
    if (t + dur < total - 0.05) {
      const fim = t + dur
      const perto = inicios.filter(x => Math.abs(x - fim) <= 0.7 && x - t >= TAKE_MIN && x - t <= livre && total - x >= TAKE_MIN).sort((a, b) => Math.abs(a - fim) - Math.abs(b - fim))[0]
      if (perto != null) dur = perto - 0.04 - t
    }
    dur = Math.max(0.2, Math.min(dur, total - t))
    cortes.push({ take: k, de: +u.cursor.toFixed(3), dur: +dur.toFixed(3) })
    u.cursor += dur; t += dur; i++
    if (k === takes.length - 1) voltas++
  }
  return cortes
}

async function editarLocucao({ takes, audio, palavras, gancho, cta, texto, nome, marca, logo, chave, chaveDeepgram, saida, pasta, navegador, log = console.log }) {
  fs.mkdirSync(pasta, { recursive: true })
  if (!takes || !takes.length) throw new Error('o vídeo com locução veio sem nenhum take')
  if (!audio || !fs.existsSync(audio)) throw new Error('o vídeo com locução veio sem o áudio da locução')
  const cores = coresDaMarca(marca || {}), fontes = fontesDaMarca(marca || {})
  const nb = t => String(t || '').replace(/R\$\s?(?=\d)/g, 'R$ '); gancho = nb(gancho); texto = nb(texto); cta = nb(cta)
  const info = takes.map(arq => ({ arq, ...sonda(arq) })).filter(t => t.video && t.dur > 0.6)
  if (!info.length) throw new Error('nenhum take tem imagem de vídeo')
  const sa = sonda(audio)
  log(`  locução: ${sa.dur.toFixed(1)} s · ${info.length} take(s): ${info.map(t => t.dur.toFixed(1) + ' s').join(', ')}`)

  // 1. as palavras da locução com o tempo (vêm da ElevenLabs; sem elas, a Deepgram ouve)
  let fala = (palavras || []).filter(p => p && p.txt && p.fim > p.ini)
  if (!fala.length && chaveDeepgram) {
    const wav = path.join(pasta, 'locucao.wav')
    ff(['-i', audio, '-vn', '-ac', '1', '-ar', '16000', wav])
    fala = (await transcreve(wav, chaveDeepgram, pasta, log, nome ? [nome] : [])).palavras
    log(`  sem o tempo das palavras: a Deepgram ouviu ${fala.length} palavras`)
  }
  let DUR = +(Math.max(sa.dur, fala.length ? fala[fala.length - 1].fim : 0) + 0.45).toFixed(3)
  if (DUR > MAXIMO) { log(`  AVISO: a locução passava de ${MAXIMO.toFixed(1)} s; cortei o final`); DUR = MAXIMO }
  fala = fala.filter(p => p.ini < DUR).map(p => ({ txt: p.txt, ini: p.ini, fim: Math.min(p.fim, DUR) }))
  const TOTAL = +(DUR + FINAL).toFixed(3)

  // 2. os cortes dos takes (na ordem)
  const cortes = planoDeCortes(info, DUR, fala)
  log(`  cortes: ${cortes.map(c => `take ${c.take + 1} (${c.de.toFixed(1)}+${c.dur.toFixed(1)} s)`).join(' · ')}`)

  // 3. as camadas de texto (as mesmas do vídeo normal)
  const { leg, topo, blocos, segsTopo } = await desenhaCamadas({ gancho, cta, texto: fala.length ? '' : texto, nome, logo, cores, fontes, fala, DUR, pasta, navegador, log })

  // 4. a montagem (um ffmpeg só): cada corte vira 1080x1920 do mesmo jeito e eles entram em sequência
  const trilha = escolheTrilha(chave || gancho || 'x')
  if (trilha) log('  trilha: ' + path.basename(trilha))
  const ins = []
  for (const c of cortes) ins.push('-ss', c.de.toFixed(3), '-t', (c.dur + 0.1).toFixed(3), '-i', info[c.take].arq)
  let k = cortes.length
  const iCartao = k++; ins.push('-loop', '1', '-framerate', String(FPS), '-t', (FINAL + TRANSICAO).toFixed(3), '-i', path.join(pasta, 'cartao.png'))
  const iLeg = leg ? (ins.push('-i', leg), k++) : -1
  const iTopo = topo ? (ins.push('-i', topo), k++) : -1
  const iVoz = k++; ins.push('-i', audio)
  const iTri = trilha ? (ins.push('-stream_loop', '-1', '-i', trilha), k++) : -1

  let f = ''
  cortes.forEach((c, j) => {
    const t = info[c.take], cor = t.hdr ? COR_HDR() : ''
    const fim = `trim=duration=${c.dur.toFixed(3)},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[c${j}];`
    f += t.w / t.h > 0.8
      ? `[${j}:v]${cor}fps=${FPS},split[a${j}][b${j}];[a${j}]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=10:3,scale=${W}:${H},eq=brightness=-0.07:saturation=1.1[f${j}];[b${j}]scale=${W}:1350:force_original_aspect_ratio=increase,crop=${W}:1350[r${j}];[f${j}][r${j}]overlay=0:${(H - 1350) / 2},${fim}`
      : `[${j}:v]${cor}fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${fim}`
  })
  f += `${cortes.map((_, j) => `[c${j}]`).join('')}concat=n=${cortes.length}:v=1:a=0,fps=${FPS},format=yuv420p[base];`
  let atual = '[base]'
  if (leg) { f += `${atual}[${iLeg}:v]overlay=0:1240:eof_action=pass,format=yuv420p[comleg];`; atual = '[comleg]' }
  if (topo) { f += `${atual}[${iTopo}:v]overlay=0:${TOPO_Y}:eof_action=pass,format=yuv420p[comtopo];`; atual = '[comtopo]' }
  f += `${atual}trim=duration=${DUR.toFixed(3)},settb=AVTB[vm];`
  f += `[${iCartao}:v]scale=${W}:${H},setsar=1,format=yuv420p,settb=AVTB[vc];`
  f += `[vm][vc]xfade=transition=fade:duration=${TRANSICAO}:offset=${(DUR - TRANSICAO).toFixed(3)},format=yuv420p[v];`
  // a voz da locução no volume padrão do Instagram (-16 LUFS); o som original dos takes não entra
  const voz = `[${iVoz}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,afade=t=in:d=0.03,apad=whole_dur=${TOTAL.toFixed(3)},atrim=0:${TOTAL.toFixed(3)}`
  if (trilha) f += `${voz}[voz];[${iTri}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.10,afade=t=in:d=0.8,afade=t=out:st=${(TOTAL - 1.5).toFixed(3)}:d=1.5,atrim=0:${TOTAL.toFixed(3)}[m];[voz][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`
  else f += `${voz}[a]`
  fs.writeFileSync(path.join(pasta, 'filtro-locucao.txt'), f)
  ff([...ins, '-filter_complex', f, '-map', '[v]', '-map', '[a]', '-t', TOTAL.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-maxrate', '4500k', '-bufsize', '9M', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', saida])
  return { duracao: TOTAL, locucao: +sa.dur.toFixed(2), cortes, palavras: fala.length, blocos: blocos.length, gancho_em_cima: segsTopo.length ? segsTopo[0].t1 : 0, trilha: trilha ? path.basename(trilha) : null }
}

module.exports = { editarVideo, editarLocucao, planoDeCortes, montaBlocos, frasesDoTexto }
