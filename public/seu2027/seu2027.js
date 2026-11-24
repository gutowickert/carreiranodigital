// Seu 2027: o que as duas páginas usam. Guarda a campanha de origem, carrega o pixel da Meta (SEU2027_PIXEL_ID, lido de
// /api/seu2027/config) e desenha a carta do arcano (desenho próprio, geométrico: moldura, numeral, sol de linhas e estrela).
(function () {
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch (e) { return null } }
  var q = new URLSearchParams(location.search), utm = {}
  ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k) })
  if (Object.keys(utm).length) ls('s27_utm', JSON.stringify(utm))
  try { utm = JSON.parse(ls('s27_utm') || '{}') } catch (e) { utm = {} }
  var cookie = function (n) { var m = document.cookie.match('(?:^|; )' + n + '=([^;]*)'); return m ? decodeURIComponent(m[1]) : null }

  var pronto = null, fila = []
  function px() { var a = arguments; if (pronto === true && window.fbq) { try { window.fbq.apply(null, a) } catch (e) {} } else if (pronto === null) fila.push(a) }
  var cfg = fetch('/api/seu2027/config').then(function (r) { return r.json() }).catch(function () { return {} })
  cfg.then(function (c) {
    if (!c.pixel || window.SEU2027_DADOS) { pronto = false; fila = []; return }
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    window.fbq('init', c.pixel); window.fbq('track', 'PageView')
    pronto = true; fila.forEach(function (a) { px.apply(null, a) }); fila = []
  })

  // a carta do arcano em SVG
  function carta(romano, nome) {
    var raios = '', cx = 50, cy = 82, r = 22
    for (var i = 0; i < 24; i++) { var a = i * Math.PI / 12, r2 = i % 2 ? 27 : 31; raios += '<line x1="' + (cx + Math.cos(a) * 24.5).toFixed(2) + '" y1="' + (cy + Math.sin(a) * 24.5).toFixed(2) + '" x2="' + (cx + Math.cos(a) * r2).toFixed(2) + '" y2="' + (cy + Math.sin(a) * r2).toFixed(2) + '"/>' }
    var pts = []
    for (var j = 0; j < 16; j++) { var b = j * Math.PI / 8 - Math.PI / 2, rr = j % 2 ? 5 : 12.5; pts.push((cx + Math.cos(b) * rr).toFixed(2) + ',' + (cy + Math.sin(b) * rr).toFixed(2)) }
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
    return '<svg class="carta" viewBox="0 0 100 160" role="img" aria-label="Carta ' + esc(romano) + ', ' + esc(nome) + '">' +
      '<rect x="1.5" y="1.5" width="97" height="157" rx="7" fill="#fff" stroke="#a8824c" stroke-width="1.6"/>' +
      '<rect x="6.5" y="6.5" width="87" height="147" rx="4.5" fill="none" stroke="#a8824c" stroke-width=".6"/>' +
      '<text x="50" y="27" text-anchor="middle" font-family="EB Garamond, Georgia, serif" font-size="15" fill="#a8824c">' + esc(romano) + '</text>' +
      '<g stroke="#a8824c" stroke-width=".7" fill="none"><circle cx="50" cy="82" r="' + r + '"/><circle cx="50" cy="82" r="14"/>' + raios + '</g>' +
      '<polygon points="' + pts.join(' ') + '" fill="#2b2540"/>' +
      '<text x="50" y="141" text-anchor="middle" font-family="EB Garamond, Georgia, serif" font-size="11.5" fill="#2b2540">' + esc(nome) + '</text></svg>'
  }

  window.s27 = {
    ls: ls, px: px, cfg: cfg, carta: carta,
    origem: function () { return Object.assign({}, utm, { fbp: cookie('_fbp'), fbc: cookie('_fbc') || (utm.fbclid ? 'fb.1.' + Date.now() + '.' + utm.fbclid : null) }) },
    // compra confirmada: 1 vez por pedido, com o mesmo eventID que o servidor manda pela API de Conversões
    compra: function (codigo, valor) {
      if (!codigo || ls('s27_px_' + codigo)) return
      cfg.then(function (c) { if (c.compraPeloSite === false) return; ls('s27_px_' + codigo, '1'); px('track', 'Purchase', { content_ids: ['seu2027'], content_type: 'product', value: +valor || 37, currency: 'BRL' }, { eventID: 'purchase-' + codigo }) })
    },
  }
})()
