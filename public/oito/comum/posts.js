// Oito Posts: o cartão de post (teste e área do cliente): ver grande, baixar a imagem, copiar a legenda e pedir ajuste.
window.OITO_POSTS = function (el, posts, op) {
  op = op || {}
  var E = OITO.esc
  el.innerHTML = posts.map(function (p, i) {
    var refazendo = p.status === 'ajuste_pedido'
    return '<article class="post" data-i="' + i + '">' +
      (refazendo ? '<div class="refazendo">Refazendo com o seu ajuste…<br><small>' + E(p.ajuste_pedido || '') + '</small></div>' : '<img src="' + E(p.url) + '" alt="' + E(p.titulo) + '" loading="lazy">') +
      '<div class="info">' + (p.data_sugerida ? '<span class="data">Postar ' + OITO.dataBR(p.data_sugerida) + '</span>' : '') +
      '<div class="leg">' + E(p.legenda || '') + '</div>' +
      '<div class="acoes">' + (refazendo ? '' : '<button class="btn peq" data-a="baixar">Baixar imagem</button>') +
      '<button class="btn peq fantasma" data-a="copiar">Copiar legenda</button>' +
      (op.ajuste && !refazendo ? '<button class="btn peq fantasma" data-a="ajuste">Pedir ajuste</button>' : '') + '</div>' +
      '<form class="form-ajuste esconde" style="display:grid;gap:8px"><textarea maxlength="500" placeholder="O que você quer mudar? Ex.: trocar a imagem por uma de unhas; falar do horário de sábado"></textarea><button class="btn peq">Enviar ajuste</button></form>' +
      '</div></article>'
  }).join('')
  el.onclick = function (e) {
    var card = e.target.closest('.post'); if (!card) return
    var p = posts[+card.dataset.i], a = e.target.dataset.a
    if (e.target.matches('img')) { var d = document.createElement('div'); d.className = 'ampliada'; d.innerHTML = '<img src="' + E(p.url) + '" alt="">'; d.onclick = function () { d.remove() }; document.body.appendChild(d); return }
    if (e.target.classList.contains('leg')) { e.target.classList.toggle('aberta'); return }
    if (a === 'copiar') { OITO.copia(p.legenda || ''); OITO.rastro('copiou_legenda', { post: p.id }) }
    if (a === 'baixar') {
      e.target.disabled = true
      fetch(p.url).then(function (r) { return r.blob() }).then(function (b) {
        var u = URL.createObjectURL(b), l = document.createElement('a'); l.href = u; l.download = 'post-' + (p.data_sugerida || p.ordem) + '.jpg'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(u) }, 4000)
      }).catch(function () { window.open(p.url, '_blank') }).then(function () { e.target.disabled = false })
      OITO.rastro('baixou', { post: p.id })
    }
    if (a === 'ajuste') { var fa = card.querySelector('.form-ajuste'); fa.classList.toggle('esconde'); fa.querySelector('textarea').focus() }
  }
  el.onsubmit = function (e) {
    e.preventDefault(); var card = e.target.closest('.post'), p = posts[+card.dataset.i], t = e.target.querySelector('textarea').value.trim()
    if (!t) return
    var b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Enviando…'
    OITO.api('cliente', { c: op.c, acao: 'ajuste', post: p.id, texto: t }).then(function () { OITO.aviso('Pedido enviado. O post novo chega em poucos minutos.'); op.depois && op.depois() })
      .catch(function (er) { OITO.aviso(er.message, 'erro'); b.disabled = false; b.textContent = 'Enviar ajuste' })
  }
}
