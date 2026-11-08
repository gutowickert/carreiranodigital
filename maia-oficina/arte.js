// A ARTE do anúncio (feed 4:5, 1080x1350): a foto do dono é a estrela, o gancho grande (com sombra ou faixa
// pra dar leitura) e embaixo uma barra com o nome do negócio (e o logo) e o botão do CTA.
// Só entra o texto que veio da peça: gancho, CTA e nome. Nada inventado.
// Três jeitos de montar; a peça escolhe sempre o mesmo pelo id dela (e a versão seguinte troca):
//   base      → a foto cobre tudo, o título embaixo sobre uma sombra
//   faixa     → a foto cobre tudo, o título numa caixa sólida embaixo
//   cabecalho → o título num cabeçalho da cor da marca, a foto logo abaixo
// Nenhum põe texto no terço de cima da foto, que é onde quase sempre está o rosto do dono.
const { ff, sonda, COR_HDR, abreNavegador, coresDaMarca, fontesDaMarca, RESERVA, carregaPagina, esc, numeroDe, dataUri, mimeDoArquivo, fs, path } = require('./comum')

const W = 1080, H = 1350, BARRA = 200
const LAYOUTS = ['cabecalho', 'base', 'faixa']

// "Gravataí e região: óculos..." → a região vira uma etiqueta pequena e o resto é o título
function separaGancho(g) {
  g = String(g || '').trim()
  const i = g.indexOf(':')
  if (i > 2 && i <= 42 && g.slice(i + 1).trim().length > 3) {
    const resto = g.slice(i + 1).trim()
    return { etiqueta: g.slice(0, i).trim(), titulo: resto.charAt(0).toUpperCase() + resto.slice(1) }
  }
  return { etiqueta: '', titulo: g }
}

// a foto pode vir como vídeo (tira um quadro), HEIC ou outro formato que o Chrome não lê (converte pra JPG)
function preparaFoto(arq, pasta) {
  if (!arq) return null
  const mime = mimeDoArquivo(arq)
  if (mime && mime !== 'image/svg+xml') return dataUri(fs.readFileSync(arq), mime)
  const saida = path.join(pasta, 'foto-' + Date.now() + '.jpg')
  let s = null
  try { s = sonda(arq) } catch (_) {}
  if (s && s.dur > 0.5) ff(['-ss', (s.dur / 3).toFixed(2), '-i', arq, '-frames:v', '1', '-vf', (s.hdr ? COR_HDR() : '') + 'format=yuvj420p', '-q:v', '2', saida])
  else ff(['-i', arq, '-frames:v', '1', '-q:v', '2', saida])
  return dataUri(fs.readFileSync(saida), 'image/jpeg')
}

function html({ foto, gancho, cta, nome, logo, cores, fontes, layout }) {
  const { etiqueta, titulo } = separaGancho(gancho)
  const n = titulo.length
  const tamTitulo = Math.round((n <= 22 ? 124 : n <= 38 ? 108 : n <= 60 ? 92 : n <= 90 ? 78 : 66) * (layout === 'cabecalho' ? 1 : 0.9))
  const C = cores
  // a sombra que dá leitura ao texto muda conforme o layout
  const sombra = {
    cabecalho: `linear-gradient(to top, rgba(0,0,0,.4) 0px, rgba(0,0,0,0) ${BARRA + 160}px)`,
    base: `linear-gradient(to top, rgba(0,0,0,.92) ${BARRA}px, rgba(0,0,0,.66) 52%, rgba(0,0,0,0) 76%)`,
    faixa: `linear-gradient(to top, rgba(0,0,0,.5) ${BARRA}px, rgba(0,0,0,0) 60%)`,
  }[layout]
  // onde a foto "ancora" quando precisa cortar: com o texto embaixo, mostra mais a parte de baixo da foto
  // (o rosto sobe e fica longe do texto); no cabeçalho, mais o meio
  const posFoto = layout === 'cabecalho' ? '50% 38%' : '50% 62%'
  const caixa = {
    cabecalho: `left:0;right:0;top:0;max-height:560px;padding:64px 64px 46px;background:${C.primaria};border-bottom:8px solid ${C.botao};`,
    base: `left:64px;right:64px;bottom:${BARRA + 44}px;max-height:500px;`,
    faixa: `left:52px;right:96px;bottom:${BARRA + 48}px;max-height:480px;padding:36px 44px 40px;background:${C.primaria};border-left:16px solid ${C.botao};border-radius:8px 26px 26px 8px;box-shadow:0 18px 50px rgba(0,0,0,.35);`,
  }[layout]
  const solido = layout !== 'base'
  const corTitulo = solido ? C.texto : '#ffffff'
  const fundo = foto ? '' : `background:radial-gradient(circle at 30% 20%, ${C.secundaria}55, transparent 60%), ${C.primaria};`
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontes.link}" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${C.primaria};font-family:"${fontes.texto}",${RESERVA};-webkit-font-smoothing:antialiased}
#foto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${posFoto}}
#sombra{position:absolute;inset:0;background:${sombra}}
#vazio{position:absolute;inset:0;${fundo}}
#caixa{position:absolute;${caixa}overflow:hidden;display:flex;flex-direction:column;align-items:flex-start}
#etq{flex:none;display:inline-block;max-width:100%;background:${C.botao};color:${C.textoBotao};font-weight:800;font-size:36px;line-height:1.15;padding:12px 24px;border-radius:14px;margin-bottom:24px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.3)}
#tit{flex:none;width:100%;font-family:"${fontes.titulo}",${RESERVA};font-weight:900;font-size:${tamTitulo}px;line-height:1.04;letter-spacing:-.015em;color:${corTitulo};padding-top:.08em;padding-bottom:.1em;overflow-wrap:break-word;${solido ? '' : 'text-shadow:0 4px 28px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4);'}}
#barra{position:absolute;left:0;right:0;bottom:0;height:${BARRA}px;background:${C.primaria};display:flex;align-items:center;gap:30px;padding:0 52px;border-top:6px solid ${C.botao}}
#marca{flex:1;min-width:0;display:flex;align-items:center;gap:24px;height:100%}
#logo{flex:none;height:118px;max-width:240px;background:#fff;border-radius:18px;padding:12px;display:flex;align-items:center;justify-content:center}
#logo img{max-height:94px;max-width:216px;object-fit:contain}
#nome{min-width:0;max-height:120px;overflow:hidden;color:${C.texto};font-weight:800;font-size:44px;line-height:1.12;overflow-wrap:break-word}
#cta{flex:none;max-width:${logo ? 46 : 58}%;white-space:nowrap;max-height:150px;overflow:hidden;background:${C.botao};color:${C.textoBotao};font-weight:800;font-size:42px;line-height:1.12;text-align:center;padding:24px 40px;border-radius:999px;box-shadow:0 10px 28px rgba(0,0,0,.3);overflow-wrap:break-word}
</style></head><body data-layout="${layout}">
${foto ? `<img id="foto" src="${foto}">` : '<div id="vazio"></div>'}
<div id="sombra"></div>
<div id="caixa">${etiqueta ? `<div id="etq"${/^R\$\s?\d/.test(etiqueta) ? ' style="font-size:64px;padding:14px 30px;font-weight:900"' : ''}>${esc(etiqueta)}</div>` : ''}<div id="tit">${esc(titulo)}</div></div>
<div id="barra"><div id="marca">${logo ? `<div id="logo"><img src="${logo}"></div>` : ''}<div id="nome">${esc(nome)}</div></div>${cta ? `<div id="cta">${esc(cta)}</div>` : ''}</div>
</body></html>`
}

// dentro da página: clareia foto escura e encolhe cada texto até caber (nunca sai da arte)
async function ajusta(pg) {
  return pg.evaluate(async (BARRA, H) => {
    const r = { brilho: 1, tamanhos: {}, estourou: [] }
    const img = document.getElementById('foto')
    let luzFaixa = () => 0.5
    if (img) {
      if (!img.complete) await new Promise(ok => { img.onload = ok; img.onerror = ok })
      try {
        // desenha a foto do jeito que ela aparece (cobrindo 1080x1350, sem distorcer) numa miniatura de 108x135
        const cv = document.createElement('canvas'); cv.width = 108; cv.height = 135
        const ctx = cv.getContext('2d'), iw = img.naturalWidth, ih = img.naturalHeight
        const k = Math.max(1080 / iw, H / ih), sw = 1080 / k, sh = H / k
        const [px, py] = getComputedStyle(img).objectPosition.split(' ').map(v => parseFloat(v) / 100)
        ctx.drawImage(img, (iw - sw) * px, (ih - sh) * py, sw, sh, 0, 0, 108, 135)
        const d = ctx.getImageData(0, 0, 108, 135).data
        const luzEntre = (y0, y1) => {
          let s = 0, n = 0
          for (let y = Math.max(0, Math.floor(y0 / 10)); y < Math.min(135, Math.ceil(y1 / 10)); y++)
            for (let x = 0; x < 108; x++) { const i = (y * 108 + x) * 4; s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++ }
          return n ? s / n : 0.5
        }
        const l = luzEntre(0, H)
        // foto escura: clareia um pouco (sem exagero)
        if (l < 0.4) { r.brilho = Math.min(1.45, 0.46 / Math.max(l, 0.12)); img.style.filter = `brightness(${r.brilho.toFixed(2)}) contrast(1.04) saturate(1.05)` }
        r.luz = +l.toFixed(3)
        luzFaixa = (y0, y1) => Math.min(1, luzEntre(y0, y1) * r.brilho)
      } catch (_) {}
    }
    // passou do espaço? (mede as linhas de verdade; folga pequena pro acento do Ó/É, que sobe acima da linha)
    const passa = (el, tf) => {
      const t = tf || parseFloat(getComputedStyle(el).fontSize) || 20, q = el.getBoundingClientRect(), rg = document.createRange()
      rg.selectNodeContents(el)
      const fora = [...rg.getClientRects()].some(x => x.right > q.right + 2 || x.left < q.left - 2)
      return fora || el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + Math.max(2, t * 0.15)
    }
    const encolhe = (id, min, caixa) => {
      const el = document.getElementById(id); if (!el) return
      const box = caixa ? document.getElementById(caixa) : el
      let t = parseFloat(getComputedStyle(el).fontSize)
      while ((passa(box, t) || passa(el)) && t > min) { t -= 2; el.style.fontSize = t + 'px' }
      // último recurso: pode quebrar palavra no meio, mas não corta
      if (passa(box, t) || passa(el)) { el.style.overflowWrap = 'anywhere'; while ((passa(box, t) || passa(el)) && t > 18) { t -= 2; el.style.fontSize = t + 'px' } }
      r.tamanhos[id] = t
      if (passa(box, t) || passa(el)) r.estourou.push(id)
    }
    encolhe('etq', 24, 'etq')
    encolhe('tit', 44, 'caixa')
    // o CTA: primeiro tenta numa linha só; se não couber, deixa quebrar em duas
    const cta = document.getElementById('cta')
    if (cta) {
      encolhe('cta', 32, 'cta')
      if (r.estourou.includes('cta')) { r.estourou = r.estourou.filter(x => x !== 'cta'); cta.style.whiteSpace = 'normal'; cta.style.fontSize = '40px'; encolhe('cta', 24, 'cta') }
    }
    encolhe('nome', 24, 'nome')
    // a sombra sob medida: escurece só até um pouco além do texto, pra não apagar o rosto
    const cx = document.getElementById('caixa').getBoundingClientRect(), so = document.getElementById('sombra'), lay = document.body.dataset.layout
    // quanto mais clara a foto atrás do texto, mais escura a sombra (o branco do título precisa saltar)
    const l = luzFaixa(cx.top, cx.bottom), a = l > 0.6 ? 0.9 : l > 0.45 ? 0.82 : 0.74, b = (a - 0.14).toFixed(2)
    r.luzAtras = +l.toFixed(2)
    // no cabeçalho a foto começa onde o cabeçalho termina (cobrindo o espaço até a barra, sem distorcer)
    if (lay === 'cabecalho' && img) { img.style.top = cx.bottom + 'px'; img.style.height = (H - BARRA - cx.bottom) + 'px' }
    if (lay === 'base') so.style.background = `linear-gradient(to top, rgba(0,0,0,.92) ${BARRA}px, rgba(0,0,0,${b}) ${H - cx.top}px, rgba(0,0,0,0) ${H - cx.top + 240}px)`
    return r
  }, BARRA, H)
}

// gera a arte e grava em "saida" (.jpg ou .png). Devolve o relatório do ajuste.
// 08/11 (teste completo): "layout" = o que o sistema escolheu (a mesma foto não repete layout; a versão nova de um ajuste
// também vem escolhida, diferente da anterior e das outras peças com a mesma foto). Sem ele, o sorteio antigo pelo id. "preco" = o preço da base em destaque (anúncio de preço cujo gancho não tem o preço): vai na etiqueta
async function gerarArte({ foto, gancho, cta, nome, marca, logo, chave, versao, saida, navegador, layout: pedido, preco }) {
  const cores = coresDaMarca(marca || {}), fontes = fontesDaMarca(marca || {})
  const layout = LAYOUTS.includes(pedido) ? pedido : LAYOUTS[(numeroDe(chave || gancho) + Math.max(0, (+versao || 1) - 1)) % LAYOUTS.length]
  if (preco && !/R\$\s?\d/.test(gancho || '') && !separaGancho(gancho).etiqueta) gancho = `${preco}: ${gancho}`
  // "R$" e o número nunca ficam em linhas diferentes
  gancho = String(gancho || '').replace(/R\$\s?(?=\d)/g, 'R$\u00a0'); cta = String(cta || '').replace(/R\$\s?(?=\d)/g, 'R$\u00a0')
  const fotoUri = preparaFoto(foto, path.dirname(saida))
  const br = navegador || await abreNavegador()
  try {
    const pg = await br.newPage()
    await pg.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
    await carregaPagina(pg, html({ foto: fotoUri, gancho, cta, nome, logo, cores, fontes, layout }), fontes)
    const rel = await ajusta(pg)
    const jpg = /\.jpe?g$/i.test(saida)
    await pg.screenshot({ path: saida, type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 92 } : {}) })
    await pg.close()
    return { layout, ...rel }
  } finally { if (!navegador) await br.close() }
}

module.exports = { gerarArte, separaGancho, LAYOUTS }
