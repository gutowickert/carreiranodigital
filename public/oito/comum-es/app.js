// Oito Posts en español: el JS común de las páginas de las 3 marcas de Colombia y Chile (rastro del embudo, píxel, fotos, chat de soporte, utilidades).
// Cada página tiene <body data-marca="divino|sabroso|peludo">. El píxel de cada marca va en OITO_PIXEL (vacío = apagado).
// 15/10: el Feed al Día (primero se llamó No Feed). Las páginas nuevas traen <body data-marca="divino" data-grupo="feedaldia" data-pasta="salon">: un solo píxel
// (OITO_PIXEL.feedaldia) para los 3 nichos, y las direcciones son /oito/feedaldia/<pasta>/ (Vercel) o /<pasta>/ (dominio propio).
// El precio llega en window.OITO_PRECO (build-es.js lo lee de lib/oito/config.ts).
// Copia traducida de /oito/comum/app.js (la brasileña); la lógica es la misma.
(function () {
  var OITO_PIXEL = { feedaldia: '2440227939714184', divino: '', sabroso: '', peludo: '' }
  var marca = document.body.dataset.marca, grupo = document.body.dataset.grupo || '', pasta = document.body.dataset.pasta || ''
  var PASTAS = { divino: 'salon', sabroso: 'restaurante', peludo: 'mascotas' }
  // en el dominio de la marca (www.feeddivino.com...) las direcciones quedan limpias: /comecar.html en vez de /oito/divino/comecar.html
  // Feed al Día: en el dominio propio la dirección no empieza con /oito/ (sirve para cualquier dominio que se conecte)
  var emDominio = grupo === 'feedaldia' ? location.pathname.indexOf('/oito/') !== 0 : /(^|\.)feed(divino|sabroso|peludo)\.com$/.test(location.hostname)
  var prefixo = grupo === 'feedaldia' ? '/oito/feedaldia/' : '/oito/' + marca + '/'
  var aqui = grupo === 'feedaldia' ? pasta + '/' : ''
  function url(p) { return (emDominio ? '/' : prefixo) + aqui + (p || '') }
  // la página de otro nicho del Feed al Día (quien pidió la prueba en otro nicho vuelve a la suya)
  function urlDe(m, p) { return PASTAS[m] && grupo === 'feedaldia' ? (emDominio ? '/' : prefixo) + PASTAS[m] + '/' + (p || '') : null }
  var icone = grupo === 'feedaldia' ? '/oito/feedaldia/icone.png' : '/oito/' + marca + '/icone.png'
  if (emDominio) {
    var limpa = function (a) { var h = a.getAttribute('href'); if (h && h.indexOf(prefixo) === 0) a.setAttribute('href', '/' + h.slice(prefixo.length)) }
    document.addEventListener('DOMContentLoaded', function () { [].forEach.call(document.querySelectorAll('a[href^="' + prefixo + '"]'), limpa) })
    // enlaces creados después (área del cliente, tarjetas): se corrigen al hacer clic
    document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="' + prefixo + '"]'); if (a) limpa(a) }, true)
    // quien llegó por un enlace antiguo (/oito/divino/...) ve la dirección limpia en la barra
    if (location.pathname.indexOf(prefixo) === 0) history.replaceState(null, '', '/' + location.pathname.slice(prefixo.length) + location.search + location.hash)
  }
  var ls = { get: function (k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set: function (k, v) { try { localStorage.setItem(k, v) } catch (e) {} } }
  var sessao = ls.get('oito_sessao'); if (!sessao) { sessao = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set('oito_sessao', sessao) }
  var q = new URLSearchParams(location.search)
  // utm: guarda la primera que trajo a la persona
  var utm = {}; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k).slice(0, 120) })
  if (Object.keys(utm).length && !ls.get('oito_utm')) ls.set('oito_utm', JSON.stringify(utm))
  // el anuncio trae ?pais=CO o ?pais=CL: se guarda para marcar el país en el formulario
  var paisUrl = (q.get('pais') || '').toUpperCase(); if (paisUrl === 'CO' || paisUrl === 'CL') ls.set('oito_pais', paisUrl)

  function api(caminho, corpo) {
    return fetch('/api/oito/' + caminho, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : { cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {} }).then(function (j) { if (!r.ok) { var e = new Error(j.erro || 'No funcionó. Inténtalo de nuevo.'); e.status = r.status; throw e } return j }) })
  }
  // quien abre el panel en este navegador queda marcado (oito_eu) y no entra en el embudo; ?eu=1 también lo marca
  if (q.get('eu') === '1') ls.set('oito_eu', '1')
  // robots fuera del embudo: navegador automatizado (revisión de anuncios de Meta, vista previa de enlace) no cuenta,
  // y la VISITA solo cuenta cuando la persona interactúa con la página visible, o la deja 10 s visible.
  var ROBO = /bot|crawl|spider|slurp|facebookexternalhit|facebot|meta-externalagent|headlesschrome|lighthouse|inspectiontool|pingdom|uptime/i
  var humano = !navigator.webdriver && !ROBO.test(navigator.userAgent || '')
  function quandoVisivel(fn) {
    var feito = false, t = null, visivelDesde = null
    function vai() { if (feito || document.visibilityState !== 'visible') return; feito = true; clearTimeout(t); fn() }
    function confere() {
      clearTimeout(t)
      if (document.visibilityState === 'visible' && !feito) { visivelDesde = visivelDesde || Date.now(); t = setTimeout(vai, 10000) }
    }
    var gesto = function () { if (visivelDesde && Date.now() - visivelDesde > 600) vai() }
    addEventListener('scroll', function () { if (scrollY > 40) gesto() }, { passive: true })
    ;['touchstart', 'pointerdown', 'keydown'].forEach(function (ev) { addEventListener(ev, gesto, { passive: true }) })
    document.addEventListener('visibilitychange', confere); confere()
  }
  function rastro(tipo, detalhe, c) {
    if (ls.get('oito_eu') || !humano) return
    if ((tipo === 'visita' || tipo === 'area_visita') && !rastro.visivel) { return quandoVisivel(function () { rastro.visivel = true; rastro(tipo, detalhe, c) }) }
    try { navigator.sendBeacon('/api/oito/evento', new Blob([JSON.stringify({ tipo: tipo, marca: marca, sessao: sessao, c: c || q.get('c') || undefined, detalhe: detalhe || {} })], { type: 'application/json' })) } catch (e) {}
  }
  // píxel de Meta, solo si la marca tiene uno configurado
  var pixel = grupo === 'feedaldia' ? OITO_PIXEL.feedaldia : OITO_PIXEL[marca]
  if (pixel) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    fbq('init', pixel); fbq('track', 'PageView')
  }
  function fb(evento, dados, id) { if (window.fbq) fbq('track', evento, dados || {}, id ? { eventID: id } : undefined) }

  // reduce la foto en el navegador antes de subirla (hasta 1600 px, JPEG); el logo va en PNG para mantener el fondo transparente
  function comprime(arquivo, max, png) {
    max = max || 1600
    return new Promise(function (ok, erro) {
      var img = new Image(), url = URL.createObjectURL(arquivo)
      img.onload = function () {
        var e = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas')
        cv.width = Math.round(img.width * e); cv.height = Math.round(img.height * e)
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url)
        ok(png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86))
      }
      img.onerror = function () { erro(new Error('Esa imagen no abrió. Prueba con otra (JPG o PNG).')) }
      img.src = url
    })
  }
  function aviso(texto, tipo) {
    var t = document.createElement('div'); t.className = 'toast ' + (tipo || ''); t.textContent = texto; t.setAttribute('role', 'status')
    document.body.appendChild(t); setTimeout(function () { t.classList.add('sai') }, 2600); setTimeout(function () { t.remove() }, 3200)
  }
  function copia(texto) { return (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(function () { aviso('Texto copiado') }, function () { prompt('Copia el texto:', texto) }) }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  // "mar 14/10"
  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  function dataBR(d) { if (!d) return ''; var x = new Date(d.length === 10 ? d + 'T12:00:00' : d); if (isNaN(x)) return ''; return DIAS[x.getDay()] + ' ' + String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') }
  function quando(d) { var x = new Date(d); return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + ' ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0') }

  // ---------- chat de soporte (área del cliente, prueba y sitio) ----------
  // OITO.chat(contenedor, { c: codigo })  o  OITO.chat(contenedor, {})  (visitante: pide un contacto en el primer mensaje)
  function chat(el, op) {
    op = op || {}
    var chKey = 'oito_chamado_' + marca, chId = op.c ? null : ls.get(chKey)
    el.innerHTML = '<div class="chat"><div class="chat-msgs" aria-live="polite"></div>' +
      (op.c ? '' : '<input class="chat-contato" placeholder="Tu WhatsApp o correo (para responderte)" autocomplete="email">') +
      '<form class="chat-form"><textarea rows="2" placeholder="Escribe tu pregunta…" required maxlength="2000"></textarea><button class="btn">Enviar</button></form>' +
      '<p class="chat-nota">Te respondemos aquí mismo, al instante. Si hace falta alguien del equipo, la respuesta llega en máximo 1 día hábil.</p></div>'
    var caixa = el.querySelector('.chat-msgs'), form = el.querySelector('form'), ta = form.querySelector('textarea'), contato = el.querySelector('.chat-contato')
    if (chId && contato) contato.style.display = 'none'
    function desenha(chamados) {
      var msgs = []; (chamados || []).slice().reverse().forEach(function (ch) { msgs = msgs.concat(ch.msgs) })
      caixa.innerHTML = msgs.length ? msgs.map(function (m) {
        return '<div class="bolha ' + m.autor + '"><span>' + esc(m.texto).replace(/\n/g, '<br>') + '</span><small>' + (m.autor === 'cliente' ? 'Tú' : m.autor === 'ia' ? 'Atención' : 'Equipo') + ' · ' + quando(m.em) + '</small></div>'
      }).join('') : '<p class="chat-vazio">Todavía no hay mensajes. Pregunta lo que quieras: cómo funciona, el pago, los ajustes, cómo publicar.</p>'
      caixa.scrollTop = caixa.scrollHeight
    }
    function carrega() {
      var u = op.c ? 'suporte?c=' + encodeURIComponent(op.c) : chId ? 'suporte?ch=' + encodeURIComponent(chId) : null
      if (!u) return desenha([])
      api(u).then(function (j) { desenha(j.chamados) }).catch(function () {})
    }
    form.onsubmit = function (e) {
      e.preventDefault(); var b = form.querySelector('button'), texto = ta.value.trim(); if (!texto) return
      b.disabled = true; b.textContent = 'Enviando…'
      var corpo = { texto: texto, marca: marca }
      if (op.c) corpo.c = op.c; else if (chId) corpo.ch = chId; else corpo.contato = contato.value.trim()
      caixa.insertAdjacentHTML('beforeend', '<div class="bolha cliente"><span>' + esc(texto) + '</span></div><div class="bolha ia digitando"><span>Escribiendo…</span></div>'); caixa.scrollTop = caixa.scrollHeight
      api('suporte', corpo).then(function (j) {
        ta.value = ''; if (!op.c && j.chamado) { chId = j.chamado.id; ls.set(chKey, chId); if (contato) contato.style.display = 'none' }
        carrega()
      }).catch(function (er) { aviso(er.message, 'erro'); carrega() }).then(function () { b.disabled = false; b.textContent = 'Enviar' })
    }
    carrega(); setInterval(carrega, 20000)
  }

  // ---------- "guarda tu área como app" (área del cliente) ----------
  // El manifiesto es dinámico: la app instalada abre directo en el área de este cliente. En Android aparece el botón Instalar;
  // en iPhone, el paso a paso de Safari. Si ya está abierta como app, no muestra nada.
  var pedidoInstalar = null
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); pedidoInstalar = e; var b = document.querySelector('.instalar-agora'); if (b) b.hidden = false })
  function salvaApp(el, c) {
    if (!el || !c) return
    var mf = document.querySelector('link[rel=manifest]') || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'manifest' }))
    mf.href = '/api/oito/manifest?m=' + marca + '&c=' + encodeURIComponent(c)
    var app = matchMedia('(display-mode: standalone)').matches || navigator.standalone
    if (app || ls.get('oito_app_fechado_' + c)) return
    var ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua), android = /Android/.test(ua), safari = ios && !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV/.test(ua)
    var passos = ios
      ? (safari ? '<ol><li>Toca <b>Compartir</b> <span aria-hidden="true">⬆️</span>, en la barra de abajo de Safari.</li><li>Desliza y toca <b>Agregar a inicio</b>.</li><li>Toca <b>Agregar</b>. Listo: el ícono queda junto a tus apps.</li></ol>'
        : '<p>Abre este enlace en <b>Safari</b> (en el menú ••• toca «Abrir en Safari») y después: <b>Compartir ⬆️ → Agregar a inicio</b>.</p>')
      : android ? '<ol><li>Toca <b>Instalar</b> aquí abajo.</li><li>Si el botón no aparece: en Chrome, toca los <b>⋮</b> (arriba a la derecha) → <b>Agregar a la pantalla principal</b> o <b>Instalar app</b>.</li></ol>'
      : '<p>En el celular, abre este mismo enlace y agrégalo a la pantalla de inicio. En el computador, guárdalo en favoritos (Ctrl+D).</p>'
    el.innerHTML = '<div class="salva-app"><div class="sa-ic"><img src="' + icone + '" alt=""></div><div class="sa-txt"><b>Guarda tu área como app</b>' +
      '<p>Así los posts del mes quedan a un toque, sin buscar el enlace.</p>' + passos +
      '<div class="sa-acoes"><button class="btn peq instalar-agora"' + (pedidoInstalar ? '' : ' hidden') + '>Instalar</button><button class="btn peq fantasma sa-copia">Copiar mi enlace</button><button class="sa-fecha" aria-label="Cerrar">Ahora no</button></div></div></div>'
    el.querySelector('.instalar-agora').onclick = function () { if (!pedidoInstalar) return; pedidoInstalar.prompt(); pedidoInstalar.userChoice.then(function (r) { if (r.outcome === 'accepted') { rastro('app_instalado', {}, c); el.innerHTML = '' } }) }
    el.querySelector('.sa-copia').onclick = function () { var u = location.origin + url('conta.html?c=' + c); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { aviso('Enlace copiado. Guárdalo en tu WhatsApp o en favoritos.') }, function () { prompt('Tu enlace:', u) }) }
    el.querySelector('.sa-fecha').onclick = function () { ls.set('oito_app_fechado_' + c, '1'); el.innerHTML = '' }
  }

  window.OITO = { marca: marca, url: url, urlDe: urlDe, preco: window.OITO_PRECO || 0, emDominio: emDominio, salvaApp: salvaApp, sessao: sessao, q: q, api: api, rastro: rastro, fb: fb, comprime: comprime, aviso: aviso, copia: copia, esc: esc, dataBR: dataBR, chat: chat, ls: ls,
    utm: function () { try { return JSON.parse(ls.get('oito_utm') || 'null') } catch (e) { return null } } }

  // botón flotante de ayuda (abre el chat en un panel) en toda página con [data-ajuda]
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-ajuda]'); if (!a) return; e.preventDefault()
    var g = document.querySelector('.gaveta-ajuda')
    if (!g) {
      g = document.createElement('div'); g.className = 'gaveta-ajuda'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-label', 'Ayuda')
      g.innerHTML = '<div class="gaveta-topo"><b>Escríbenos</b><button class="fecha" aria-label="Cerrar">×</button></div><div class="gaveta-corpo"></div>'
      document.body.appendChild(g); g.querySelector('.fecha').onclick = function () { g.classList.remove('aberta') }
      chat(g.querySelector('.gaveta-corpo'), { c: q.get('c') || undefined })
    }
    g.classList.add('aberta')
  })
})()
