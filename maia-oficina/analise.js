// A IMAGEM DA ANÁLISE DE 2 EM 2 DIAS (13/11): um card vertical 1080x1350, claro, com a logo e as cores do negócio, os números
// grandes (investido, conversas, custo por conversa, métrica secundária, vendas), o anúncio da vez (miniatura do criativo,
// se tiver) e a conclusão (segue / segura / sugiro mudar). Os textos vêm PRONTOS do sistema (lib/maia/relatorios-conta.ts,
// cardAnalise): aqui só monta e fotografa. Nada inventado.
// Tarefa da fila: tipo 'relatorio' (a peça é a análise). Gancho em oficina.js: fazTarefa chama fazTarefaAnalise.
// Teste sem fila: node oficina.js --teste-analise <dados.json> [--logo <arq>] [--foto <arq>] [--marca '{...}'] [--saida <arq.jpg>]
const { abreNavegador, coresDaMarca, fontesDaMarca, RESERVA, carregaPagina, esc: escComum, dataUri, mimeDoArquivo, contraste, textoSobre, fs, path } = require('./comum')

const W = 1080, H = 1350
// "R$" e o número nunca ficam em linhas diferentes
const esc = s => escComum(String(s == null ? '' : s).replace(/R\$\s?(?=\d)/g, 'R$\u00a0'))

// mistura uma cor com o branco (t = quanto da cor fica), pra ter os fundos claros na cor da marca
function clara(hex, t) {
  const n = parseInt(hex.slice(1), 16), m = c => Math.round(c * t + 255 * (1 - t))
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(m).map(x => x.toString(16).padStart(2, '0')).join('')
}

function html({ d, logo, foto, cores, fontes }) {
  const C = cores
  // a cor de destaque precisa aparecer no branco: se a primária é clara demais, usa um grafite
  const tinta = contraste(C.primaria, '#ffffff') >= 3 ? C.primaria : '#2b2a27'
  const tipo = d.conclusao?.tipo || 'segue'
  const cx = tipo === 'mudar' ? { fundo: tinta, texto: textoSobre(tinta), selo: 'rgba(255,255,255,.18)' }
    : tipo === 'segura' ? { fundo: '#fff4dc', texto: '#5c3b00', selo: '#ffe2a6' } : { fundo: '#e3f5e8', texto: '#14532d', selo: '#c4ebcf' }
  const nums = (d.numeros || []).slice(0, 5)
  const tile = (x, i) => `<div class="t${i < 3 ? '' : ' larga'}"><b id="n${i}">${esc(x.valor)}</b><span>${esc(x.rotulo)}</span></div>`
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="${fontes.link}" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${clara(tinta, 0.06)};color:#1d1c1a;font-family:"${fontes.texto}",${RESERVA};-webkit-font-smoothing:antialiased}
#topo{position:absolute;left:0;right:0;top:0;height:14px;background:${tinta}}
#cab{position:absolute;left:64px;right:64px;top:60px;height:150px;display:flex;align-items:center;gap:30px}
#logo{flex:none;width:150px;height:150px;border-radius:28px;background:#fff;border:2px solid ${clara(tinta, 0.18)};display:flex;align-items:center;justify-content:center;overflow:hidden}
#logo img{max-width:132px;max-height:132px;object-fit:contain}
#cab .tx{min-width:0}
#neg{font-family:"${fontes.titulo}",${RESERVA};font-weight:900;font-size:52px;line-height:1.08;color:${tinta};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#sub{margin-top:8px;font-size:32px;font-weight:600;color:#5b5852}
#nums{position:absolute;left:64px;right:64px;top:236px;display:grid;grid-template-columns:repeat(6,1fr);gap:20px}
.t{grid-column:span 2;background:#fff;border:2px solid ${clara(tinta, 0.14)};border-radius:28px;padding:20px 24px 18px;height:166px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
.t.larga{grid-column:span 3}
.t b{font-family:"${fontes.titulo}",${RESERVA};font-weight:900;font-size:68px;line-height:1;color:${tinta};white-space:nowrap;letter-spacing:-.01em}
.t span{font-size:26px;font-weight:600;line-height:1.15;color:#5b5852;max-height:60px;overflow:hidden}
#ad{position:absolute;left:64px;right:64px;top:612px;height:200px;background:#fff;border:2px solid ${clara(tinta, 0.14)};border-radius:28px;display:flex;align-items:center;gap:30px;padding:20px 30px 20px 20px;overflow:hidden}
#ad .mini{flex:none;width:136px;height:170px;border-radius:18px;overflow:hidden;background:${clara(tinta, 0.12)}}
#ad .mini img{width:100%;height:100%;object-fit:cover}
#ad .tx{min-width:0;flex:1;max-height:164px;overflow:hidden}
#ad small{display:block;font-size:24px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${tinta};opacity:.75}
#adn{margin-top:6px;font-family:"${fontes.titulo}",${RESERVA};font-weight:800;font-size:44px;line-height:1.1;max-height:100px;overflow:hidden}
#adl{margin-top:10px;font-size:28px;line-height:1.25;color:#5b5852;max-height:72px;overflow:hidden}
#conc{position:absolute;left:64px;right:64px;top:${d.anuncio ? 838 : 612}px;bottom:146px;background:${cx.fundo};color:${cx.texto};border-radius:32px;padding:40px 46px;overflow:hidden;display:flex;flex-direction:column}
#selo{align-self:flex-start;background:${cx.selo};border-radius:999px;padding:8px 22px;font-size:24px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
#ct{margin-top:18px;font-family:"${fontes.titulo}",${RESERVA};font-weight:900;font-size:58px;line-height:1.05}
#ci{margin-top:14px;font-size:31px;line-height:1.3;flex:1;min-height:0;overflow:hidden}
#ci p{margin-top:8px}
#rod{position:absolute;left:64px;right:64px;bottom:44px;height:76px;display:flex;align-items:center;justify-content:space-between;gap:24px}
#rod .maia{font-size:26px;font-weight:600;color:#6b6760}
#perg{flex:none;background:${tinta};color:${textoSobre(tinta)};border-radius:999px;padding:16px 36px;font-size:32px;font-weight:800}
</style></head><body>
<div id="topo"></div>
<div id="cab">${logo ? `<div id="logo"><img src="${logo}"></div>` : ''}<div class="tx"><div id="neg">${esc(d.negocio)}</div><div id="sub">${esc(d.titulo || 'Análise dos anúncios')} · ${esc(d.periodo)}</div></div></div>
<div id="nums">${nums.map(tile).join('')}</div>
${d.anuncio ? `<div id="ad">${foto ? `<div class="mini"><img src="${foto}"></div>` : ''}<div class="tx"><small>O anúncio da vez</small><div id="adn">${esc(d.anuncio.nome)}</div>${d.anuncio.linha ? `<div id="adl">${esc(d.anuncio.linha)}</div>` : ''}</div></div>` : ''}
<div id="conc"><div id="selo">Conclusão</div><div id="ct">${esc(d.conclusao?.titulo || '')}</div><div id="ci">${(d.conclusao?.itens || []).map(x => `<p>${esc(x)}</p>`).join('')}</div></div>
<div id="rod"><span class="maia">Maia · o teu time de marketing</span>${d.pergunta ? `<span id="perg">${esc(d.pergunta)}</span>` : ''}</div>
</body></html>`
}

// encolhe o que não cabe (números, nome do anúncio, conclusão), sem sair do card
const ajusta = pg => pg.evaluate(() => {
  const passa = el => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2
  const out = []
  const reduz = (el, min, caixa) => { let t = parseFloat(getComputedStyle(el).fontSize); while ((passa(el) || (caixa && passa(caixa))) && t > min) { t -= 2; el.style.fontSize = t + 'px' } if (passa(el) || (caixa && passa(caixa))) out.push(el.id || el.className) }
  // os números: só a largura conta (a altura da linha do número grande dá falso aperto)
  document.querySelectorAll('.t b').forEach(b => { b.style.display = 'block'; b.style.overflow = 'hidden'; let t = parseFloat(getComputedStyle(b).fontSize); while (b.scrollWidth > b.clientWidth + 2 && t > 34) { t -= 2; b.style.fontSize = t + 'px' } })
  const ci = document.getElementById('ci'), ct = document.getElementById('ct'), conc = document.getElementById('conc')
  if (ct) reduz(ct, 36, conc)
  if (ci) reduz(ci, 22)
  document.querySelectorAll('.t span').forEach(e => reduz(e, 18))
  const tx = document.querySelector('#ad .tx')
  ;['adn', 'adl'].forEach(id => { const e = document.getElementById(id); if (e) reduz(e, id === 'adn' ? 28 : 20, tx) })
  const neg = document.getElementById('neg'); if (neg) reduz(neg, 30)
  return out
})

// gera a imagem e grava em "saida" (.jpg ou .png)
async function gerarAnalise({ dados, marca, logo, foto, saida, navegador }) {
  const cores = coresDaMarca(marca || {}), fontes = fontesDaMarca(marca || {})
  const fotoUri = foto ? (/^data:/.test(foto) ? foto : dataUri(fs.readFileSync(foto), mimeDoArquivo(foto) || 'image/jpeg')) : null
  const br = navegador || await abreNavegador()
  try {
    const pg = await br.newPage()
    await pg.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
    await carregaPagina(pg, html({ d: dados, logo, foto: fotoUri, cores, fontes }), fontes)
    const apertado = await ajusta(pg)
    const jpg = /\.jpe?g$/i.test(saida)
    await pg.screenshot({ path: saida, type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 92 } : {}) })
    await pg.close()
    return { apertado }
  } finally { if (!navegador) await br.close() }
}

// a tarefa da fila (as funções de baixar/devolver vêm do oficina.js, pra não repetir)
async function fazTarefaAnalise(job, f) {
  const { tarefa, negocio } = job
  const pasta = f.pasta
  const marca = (negocio && negocio.marca) || {}
  const logo = await f.logoComoDataUri(marca.logo_url, pasta)
  const d = job.analise || {}
  let foto = null
  if (d.anuncio_url) { try { const b = await f.baixa(d.anuncio_url, path.join(pasta, 'anuncio'), 'image/jpeg'); if (/^image\//.test(mimeDoArquivo(b.arq) || b.mime)) foto = b.arq } catch (e) { f.log('  (miniatura do anúncio não baixou, segue sem: ' + e.message + ')') } }
  const saida = path.join(pasta, 'analise.jpg')
  const r = await gerarAnalise({ dados: d, marca, logo, foto, saida })
  f.log(`  análise pronta${r.apertado.length ? ' (texto apertado: ' + r.apertado.join(',') + ')' : ''}`)
  const up = job.upload && job.upload.arte
  if (up && up.url) {
    const res = await f.tenta(f.absoluto(up.url), { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' }, body: fs.readFileSync(saida) })
    if (!res.ok) throw new Error(`o armazenamento não aceitou a imagem (${res.status})`)
    await f.devolve({ tarefa_id: tarefa.id, caminho: up.caminho, mime: 'image/jpeg' })
  } else await f.devolve({ tarefa_id: tarefa.id, arquivo_b64: fs.readFileSync(saida).toString('base64'), mime: 'image/jpeg' })
}

module.exports = { gerarAnalise, fazTarefaAnalise }










