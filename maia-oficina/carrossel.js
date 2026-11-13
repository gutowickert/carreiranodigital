// 13/11: o CARROSSEL com texto nos slides (feed 4:5, 1080x1350, um JPG por slide). Regras do Guto:
//   - a maioria dos slides é a FOTO INTEIRA do dono com o texto por cima; 1 ou 2 são "quebra" (fundo na cor da marca com a
//     frase grande, ou a foto numa moldura). Estilo solto e moderno: os slides de foto trocam de jeito (nunca 2 iguais
//     seguidos), o texto ganha marca-texto, etiqueta torta, número grande. Nunca 5 caixas iguais;
//   - 1º slide = gancho (com "arrasta"); último = chama pro perfil/WhatsApp, com o logo e o nome;
//   - só o texto que veio (a IA escreveu na peça) e só foto real do dono. Nada de imagem gerada.
// Cores, fontes e logo da marca do negócio, igual à arte (comum.js).
const { coresDaMarca, fontesDaMarca, RESERVA, carregaPagina, encolhe, abreNavegador, esc, numeroDe, contraste, fs, path } = require('./comum')
const { preparaFoto } = require('./arte')

const W = 1080, H = 1350
const JEITOS_FOTO = ['rodape', 'etiqueta', 'topo', 'marca', 'numero']
const JEITOS_QUEBRA = ['cor', 'moldura']

// qual jeito cada slide usa: estável pela "chave" da peça, sem repetir o jeito do slide de foto anterior
function escolheJeitos(slides, chave) {
  const n = numeroDe(chave || 'x')
  let iF = n % JEITOS_FOTO.length, iQ = n % JEITOS_QUEBRA.length, ultimo = null
  return slides.map((s, i) => {
    if (i === 0) return 'capa'
    if (i === slides.length - 1) return 'final'
    if (s.estilo === 'quebra') { const j = s.foto ? JEITOS_QUEBRA[iQ++ % JEITOS_QUEBRA.length] : 'cor'; return j }
    let j = JEITOS_FOTO[iF++ % JEITOS_FOTO.length]
    if (j === ultimo) j = JEITOS_FOTO[iF++ % JEITOS_FOTO.length]
    ultimo = j
    return j
  })
}

// 5551999998888 → (51) 99999-8888 (outro formato fica como veio)
function foneBonito(n) {
  const d = String(n || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (!d) return ''
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : String(n)
}

// o texto com as últimas palavras em "marca-texto" (a parte que fica mais forte)
function comDestaque(txt, quantas = 2) {
  const ws = String(txt || '').trim().split(/\s+/)
  if (ws.length < 4) return esc(ws.join(' '))
  const corte = ws.length - Math.min(quantas, Math.floor(ws.length / 3))
  return `${esc(ws.slice(0, corte).join(' '))} <span class="hl">${esc(ws.slice(corte).join(' '))}</span>`
}

// passo = o número grande do jeito "numero": a posição entre os slides do meio (o 2º slide é o 01)
function html({ s, i, total, passo, jeito, cores: C, fontes, nome, logo, cta, whatsapp, posFoto }) {
  const foto = s.foto ? `<img id="foto" src="${s.foto}" style="object-position:${posFoto}">` : ''
  const conta = `<div id="conta">${i + 1}/${total}</div>`
  const apoio = s.apoio ? `<div id="apoio">${esc(s.apoio)}</div>` : ''
  const claro = contraste(C.primaria, '#ffffff') < 3 // marca clara: o texto em cima da cor vai escuro
  const base = `*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${C.primaria};font-family:"${fontes.texto}",${RESERVA};-webkit-font-smoothing:antialiased}
#foto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#sombra{position:absolute;inset:0}
#conta{position:absolute;top:44px;right:48px;font-weight:700;font-size:28px;letter-spacing:.06em;color:#fff;background:rgba(0,0,0,.32);padding:8px 18px;border-radius:999px;backdrop-filter:blur(6px)}
#tit{font-family:"${fontes.titulo}",${RESERVA};font-weight:900;line-height:1.02;letter-spacing:-.02em;overflow-wrap:break-word;padding-top:.06em;padding-bottom:.08em}
#apoio{font-weight:600;font-size:38px;line-height:1.28;margin-top:26px;overflow-wrap:break-word}
.hl{background:${C.botao};color:${C.textoBotao};padding:0 .14em;border-radius:.12em;-webkit-box-decoration-break:clone;box-decoration-break:clone;text-shadow:none}
#caixa{position:absolute;overflow:hidden;display:flex;flex-direction:column}
#tag{display:inline-flex;align-items:center;gap:14px;font-weight:800;font-size:30px;color:#fff;background:rgba(0,0,0,.34);padding:10px 22px 10px 12px;border-radius:999px;backdrop-filter:blur(6px)}
#tag img{height:48px;width:48px;object-fit:contain;background:#fff;border-radius:50%;padding:4px}`
  const sombraTxt = 'text-shadow:0 3px 24px rgba(0,0,0,.55),0 1px 4px rgba(0,0,0,.45);'
  let css = '', corpo = ''
  if (jeito === 'capa') {
    css = `#sombra{background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.62) 34%,rgba(0,0,0,0) 66%)}
#topo{position:absolute;top:44px;left:44px;right:200px}
#caixa{left:70px;right:70px;bottom:150px;max-height:700px}
#tit{font-size:118px;color:#fff;${sombraTxt}}
#arrasta{position:absolute;right:56px;bottom:62px;font-weight:800;font-size:30px;color:${C.textoBotao};background:${C.botao};padding:14px 28px;border-radius:999px;box-shadow:0 10px 28px rgba(0,0,0,.35)}
#linha{width:120px;height:12px;background:${C.botao};border-radius:6px;margin-bottom:34px;flex:none}`
    corpo = `${foto}<div id="sombra"></div><div id="topo"><div id="tag">${logo ? `<img src="${logo}">` : ''}${esc(nome)}</div></div>${conta}
<div id="caixa"><div id="linha"></div><div id="tit">${comDestaque(s.texto)}</div>${apoio}</div><div id="arrasta">arrasta →</div>`
    css += `#apoio{color:#fff;${sombraTxt}}`
  } else if (jeito === 'rodape') {
    css = `#sombra{background:linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.5) 36%,rgba(0,0,0,0) 62%)}
#caixa{left:70px;right:110px;bottom:90px;max-height:620px}
#tit{font-size:84px;color:#fff;${sombraTxt}}#apoio{color:#fff;opacity:.95;${sombraTxt}}`
    corpo = `${foto}<div id="sombra"></div>${conta}<div id="caixa"><div id="tit">${esc(s.texto)}</div>${apoio}</div>`
  } else if (jeito === 'topo') {
    css = `#sombra{background:linear-gradient(to bottom,rgba(0,0,0,.82) 0%,rgba(0,0,0,.45) 34%,rgba(0,0,0,0) 58%)}
#caixa{left:70px;right:150px;top:120px;max-height:600px}
#tit{font-size:80px;color:#fff;${sombraTxt}}#apoio{color:#fff;${sombraTxt}}
#traco{position:absolute;left:70px;top:84px;width:90px;height:10px;border-radius:5px;background:${C.botao}}`
    corpo = `${foto}<div id="sombra"></div><div id="traco"></div>${conta}<div id="caixa"><div id="tit">${esc(s.texto)}</div>${apoio}</div>`
  } else if (jeito === 'etiqueta') {
    // a frase numa etiqueta torta na cor da marca, o apoio num papelzinho branco torto pro outro lado
    css = `#sombra{background:linear-gradient(to top,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 45%)}
#caixa{left:56px;right:150px;bottom:${s.apoio ? 300 : 120}px;max-height:560px;align-items:flex-start}
#tit{display:inline-block;max-width:100%;font-size:76px;color:${C.texto};background:${C.primaria};padding:30px 40px 36px;border-radius:10px;box-shadow:0 22px 50px rgba(0,0,0,.4);border-bottom:10px solid ${C.botao}}
#apoio2{position:absolute;right:56px;left:300px;bottom:110px;max-height:240px;overflow:hidden;background:#fff;color:#1b1b1b;font-weight:600;font-size:36px;line-height:1.28;padding:24px 30px;border-radius:8px;box-shadow:0 18px 40px rgba(0,0,0,.35)}`
    corpo = `${foto}<div id="sombra"></div>${conta}<div id="caixa"><div id="tit" data-torto="-2.2">${esc(s.texto)}</div></div>${s.apoio ? `<div id="apoio2" data-torto="1.6">${esc(s.apoio)}</div>` : ''}`
  } else if (jeito === 'marca') {
    // cada linha da frase com fundo de marca-texto, solta no meio da foto
    css = `#sombra{background:linear-gradient(to right,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 70%)}
#caixa{left:62px;right:120px;top:50%;transform:translateY(-40%);max-height:760px}
#tit{font-size:78px;line-height:1.32;color:${C.textoBotao}}
#tit span{background:${C.botao};padding:4px 22px;border-radius:10px;-webkit-box-decoration-break:clone;box-decoration-break:clone;box-shadow:0 10px 26px rgba(0,0,0,.25)}
#apoio{display:inline;color:#1b1b1b;font-size:36px;line-height:1.7}
#apoio span{background:rgba(255,255,255,.94);padding:6px 16px;border-radius:8px;-webkit-box-decoration-break:clone;box-decoration-break:clone}`
    corpo = `${foto}<div id="sombra"></div>${conta}<div id="caixa"><div id="tit"><span>${esc(s.texto)}</span></div>${s.apoio ? `<div id="apoio" style="margin-top:30px"><span>${esc(s.apoio)}</span></div>` : ''}</div>`
  } else if (jeito === 'numero') {
    // o texto que já vem numerado ("2. Escolha...") perde o número: ele vai grande em cima
    const numDoTexto = +(String(s.texto).match(/^(\d+)[.)]\s/) || [])[1] || 0
    // o número do passo bem grande na cor de destaque, em cima; a frase embaixo (13/11: vazado não deu: o contorno da fonte cruza por dentro do 1)
    css = `#sombra{background:linear-gradient(to top,rgba(0,0,0,.84) 0%,rgba(0,0,0,.45) 38%,rgba(0,0,0,0) 60%),linear-gradient(to bottom,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 30%)}
#num{position:absolute;left:52px;top:30px;font-family:"${fontes.titulo}",${RESERVA};font-weight:900;font-size:230px;line-height:1;letter-spacing:-.02em;color:${C.botao};opacity:.96;text-shadow:0 10px 40px rgba(0,0,0,.35)}
#caixa{left:70px;right:110px;bottom:96px;max-height:600px}
#tit{font-size:80px;color:#fff;${sombraTxt}}#apoio{color:#fff;${sombraTxt}}`
    corpo = `${foto}<div id="sombra"></div><div id="num">${String(numDoTexto || passo || i).padStart(2, '0')}</div>${conta}<div id="caixa"><div id="tit">${comDestaque(s.texto.replace(/^\d+[.)]\s*/, ''), 1)}</div>${apoio}</div>`
  } else if (jeito === 'cor') {
    // QUEBRA: fundo na cor da marca, a frase grande; a foto (se tiver) pequena e torta no canto, tipo polaroid
    const corTxt = claro ? '#141414' : C.texto
    css = `body{background:radial-gradient(circle at 85% 10%,${C.secundaria}55,transparent 45%),radial-gradient(circle at 0% 100%,${C.botao}33,transparent 40%),${C.primaria}}
#aspas{position:absolute;left:62px;top:70px;font-family:Georgia,serif;font-weight:900;font-size:260px;line-height:1;color:${C.botao}}
#caixa{left:70px;right:${s.foto ? 70 : 90}px;${s.foto ? "top:270px;max-height:640px" : "top:300px;bottom:150px;justify-content:center"}}
#tit{font-size:${s.foto ? 92 : 116}px;color:${corTxt}}
#risco{position:absolute;left:70px;bottom:110px;width:220px;height:14px;border-radius:7px;background:${C.botao}}#apoio{color:${corTxt};opacity:.88}
#conta{background:rgba(0,0,0,.2)}
#polaroid{position:absolute;right:70px;bottom:70px;width:360px;height:430px;background:#fff;padding:16px 16px 56px;transform:rotate(4deg);box-shadow:0 24px 50px rgba(0,0,0,.4)}
#polaroid img{width:100%;height:100%;object-fit:cover}`
    corpo = `<div id="aspas">“</div>${s.foto ? "" : "<div id=\"risco\"></div>"}${conta}<div id="caixa"><div id="tit">${esc(s.texto)}</div>${apoio}</div>${s.foto ? `<div id="polaroid"><img src="${s.foto}" style="object-position:${posFoto}"></div>` : ''}`
  } else if (jeito === 'moldura') {
    // QUEBRA: fundo claro, a foto numa moldura com um bloco da cor da marca deslocado atrás; a frase embaixo
    const fundo = contraste(C.secundaria, '#ffffff') < 1.4 ? C.secundaria : '#f6f2ea'
    const corTxt = contraste(fundo, C.primaria) >= 3 ? C.primaria : '#141414'
    css = `body{background:${fundo}}
#bloco{position:absolute;left:118px;top:118px;width:880px;height:740px;background:${C.botao};border-radius:6px}
#quadro{position:absolute;left:90px;top:90px;width:880px;height:740px;overflow:hidden;border-radius:6px;box-shadow:0 20px 44px rgba(0,0,0,.22)}
#quadro img{width:100%;height:100%;object-fit:cover}
#caixa{left:90px;right:90px;top:890px;bottom:70px}
#tit{font-size:72px;color:${corTxt}}#apoio{color:${corTxt};opacity:.85;font-size:34px;margin-top:18px}
#conta{background:rgba(0,0,0,.4)}`
    corpo = `<div id="bloco"></div><div id="quadro"><img src="${s.foto}" style="object-position:${posFoto}"></div>${conta}<div id="caixa"><div id="tit">${esc(s.texto)}</div>${apoio}</div>`
  } else { // final
    css = `#foto{filter:brightness(.42) saturate(1.05) blur(2px);transform:scale(1.04)}
#sombra{background:linear-gradient(to bottom,${C.primaria}66,${C.primaria}cc)}
#caixa{left:80px;right:80px;top:150px;bottom:120px;align-items:center;justify-content:center;text-align:center;gap:0}
#caixa>*{flex:none}
#logo{height:170px;max-width:460px;background:#fff;border-radius:26px;padding:18px 26px;display:flex;align-items:center;justify-content:center;margin-bottom:56px}
#logo img{max-height:134px;max-width:408px;object-fit:contain}
#tit{font-size:92px;color:#fff;${sombraTxt}}#apoio{color:#fff;${sombraTxt}}
#cta{margin-top:58px;max-width:100%;white-space:nowrap;background:${C.botao};color:${C.textoBotao};font-weight:800;font-size:50px;line-height:1.12;padding:28px 60px;border-radius:999px;box-shadow:0 16px 40px rgba(0,0,0,.35);overflow:hidden}
#nome{margin-top:34px;color:#fff;font-weight:700;font-size:42px;opacity:.95}
#zap{margin-top:12px;color:#fff;font-weight:600;font-size:36px;opacity:.85}`
    corpo = `${foto}<div id="sombra"></div>${conta}<div id="caixa">${logo ? `<div id="logo"><img src="${logo}"></div>` : ''}<div id="tit">${esc(s.texto)}</div>${apoio}${cta ? `<div id="cta">${esc(cta)}</div>` : ''}<div id="nome">${esc(nome)}</div>${whatsapp ? `<div id="zap">WhatsApp ${esc(whatsapp)}</div>` : ""}</div>`
  }
  return `<!doctype html><html><head><meta charset="utf-8"><link href="${fontes.link}" rel="stylesheet"><style>${base}\n${css}</style></head><body data-jeito="${jeito}">${corpo}</body></html>`
}

// slides = [{ foto: arquivo|null, texto, apoio, estilo: capa|foto|quebra|final }] → um JPG por slide em "pasta"
// whatsapp = o número público do negócio (vai embaixo do nome no último slide, se tiver)
async function gerarCarrossel({ slides, nome, marca, logo, cta, whatsapp, chave, pasta, navegador, log = console.log }) {
  if (!slides || slides.length < 2) throw new Error('o carrossel precisa de pelo menos 2 slides')
  fs.mkdirSync(pasta, { recursive: true })
  const cores = coresDaMarca(marca || {}), fontes = fontesDaMarca(marca || {})
  const nb = t => String(t || '').replace(/R\$\s?(?=\d)/g, 'R$ ')
  // a mesma foto em mais de um slide: o corte muda (mais em cima, no meio, mais embaixo)
  const vezes = {}, cache = {}
  const prontos = slides.map(s => {
    const f = s.foto || null
    if (f && !cache[f]) cache[f] = preparaFoto(f, pasta)
    const v = f ? (vezes[f] = (vezes[f] || 0) + 1) : 0
    return { ...s, texto: nb(s.texto), apoio: nb(s.apoio), foto: f ? cache[f] : null, posFoto: ['50% 50%', '50% 22%', '50% 80%', '30% 50%', '70% 50%'][(v - 1 + 5) % 5] }
  })
  // slide de foto sem foto (não devia acontecer) vira quebra de cor; moldura sem foto também
  for (const s of prontos) if (!s.foto && s.estilo === 'foto') s.estilo = 'quebra'
  const jeitos = escolheJeitos(prontos, chave)
  const br = navegador || await abreNavegador()
  const saidas = [], avisos = []
  try {
    const pg = await br.newPage()
    await pg.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
    for (let i = 0; i < prontos.length; i++) {
      const s = prontos[i], jeito = jeitos[i]
      await carregaPagina(pg, html({ s, i, total: prontos.length, passo: i, jeito, cores, fontes, nome, logo, cta: jeito === 'final' ? cta : '', whatsapp: jeito === 'final' ? foneBonito(whatsapp) : '', posFoto: s.posFoto }), fontes)
      if (s.foto) await pg.evaluate(() => Promise.all([...document.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r }))))
      const t = await encolhe(pg, [['cta', 30], ['tit', 44, 'caixa'], ['tit', 44], ['apoio', 26, 'caixa'], ['apoio2', 24]])
      // ainda passou? (texto comprido demais pro espaço): avisa, a equipe vê na revisão
      const passou = await pg.evaluate(() => { const c = document.getElementById('caixa'); return !!c && (c.scrollHeight > c.clientHeight + 4) })
      if (passou) avisos.push(i + 1)
      // a etiqueta torta só entorta DEPOIS de medir (texto girado engana a medida e o título encolhia até 18px no teste)
      await pg.evaluate(() => document.querySelectorAll('[data-torto]').forEach(e => { e.style.transform = 'rotate(' + e.dataset.torto + 'deg)' }))
      const arq = path.join(pasta, `slide-${String(i + 1).padStart(2, '0')}.jpg`)
      await pg.screenshot({ path: arq, type: 'jpeg', quality: 92 })
      saidas.push(arq)
      log(`  slide ${i + 1}/${prontos.length}: ${jeito}${t.tit ? ' (título ' + t.tit + 'px)' : ''}`)
    }
    await pg.close()
  } finally { if (!navegador) await br.close() }
  return { arquivos: saidas, jeitos, apertados: avisos }
}

module.exports = { gerarCarrossel, escolheJeitos }
