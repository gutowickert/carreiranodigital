// Oito Posts: o JS comum das páginas das 3 marcas (rastro do funil, pixel, fotos, chat de suporte, utilidades).
// Cada página tem <body data-marca="salao|prato|pata">. O pixel de cada marca fica em OITO_PIXEL (vazio = desligado).
(function () {
  var OITO_PIXEL = { salao: '1455599803169071', prato: '972396812578762', pata: '1594681621732255' }
  var marca = document.body.dataset.marca
  // no domínio da marca (www.salaonofeed.com.br...) os endereços ficam limpos: /comecar.html em vez de /oito/salao/comecar.html
  var emDominio = /(^|\.)(salao|prato|pata)nofeed\.com\.br$/.test(location.hostname)
  var prefixo = '/oito/' + marca + '/'
  function url(p) { return (emDominio ? '/' : prefixo) + (p || '') }
  if (emDominio) {
    var limpa = function (a) { var h = a.getAttribute('href'); if (h && h.indexOf(prefixo) === 0) a.setAttribute('href', '/' + h.slice(prefixo.length)) }
    document.addEventListener('DOMContentLoaded', function () { [].forEach.call(document.querySelectorAll('a[href^="' + prefixo + '"]'), limpa) })
    // links criados depois (área do cliente, cartões): corrige no clique
    document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="' + prefixo + '"]'); if (a) limpa(a) }, true)
    // quem chegou por um link antigo (/oito/salao/...) vê o endereço limpo na barra
    if (location.pathname.indexOf(prefixo) === 0) history.replaceState(null, '', '/' + location.pathname.slice(prefixo.length) + location.search + location.hash)
  }
  var ls = { get: function (k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set: function (k, v) { try { localStorage.setItem(k, v) } catch (e) {} } }
  var sessao = ls.get('oito_sessao'); if (!sessao) { sessao = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set('oito_sessao', sessao) }
  var q = new URLSearchParams(location.search)
  // utm: guarda a primeira que trouxe a pessoa
  var utm = {}; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k).slice(0, 120) })
  if (Object.keys(utm).length && !ls.get('oito_utm')) ls.set('oito_utm', JSON.stringify(utm))

  function api(caminho, corpo) {
    return fetch('/api/oito/' + caminho, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : { cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {} }).then(function (j) { if (!r.ok) { var e = new Error(j.erro || 'Falhou. Tenta de novo.'); e.status = r.status; throw e } return j }) })
  }
  // quem abre o painel neste navegador fica marcado (oito_eu) e não entra no funil; ?eu=1 marca também
  if (q.get('eu') === '1') ls.set('oito_eu', '1')
  // robôs fora do funil (13/10): navegador automatizado (revisão de anúncio da Meta, pré-visualização de link) não conta,
  // e a VISITA só conta quando a página fica visível de verdade por 1,5 s. O Instagram e o Facebook pré-carregam a página
  // escondida antes do clique; sem isso, cada impressão do anúncio virava "visita".
  var ROBO = /bot|crawl|spider|slurp|facebookexternalhit|facebot|meta-externalagent|headlesschrome|lighthouse|inspectiontool|pingdom|uptime/i
  var humano = !navigator.webdriver && !ROBO.test(navigator.userAgent || '')
  // 13/10 (2ª versão): a revisão de anúncios da Meta abre a página visível de verdade (um computador e um celular, mesmo Chrome),
  // tira o print e sai. A visita agora só conta quando a pessoa INTERAGE (rola, toca, clica, digita) com a página visível,
  // ou quando fica 10 s com ela visível.
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
  // pixel da Meta, só se a marca tiver um configurado
  var pixel = OITO_PIXEL[marca]
  if (pixel) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    fbq('init', pixel); fbq('track', 'PageView')
  }
  function fb(evento, dados, id) { if (window.fbq) fbq('track', evento, dados || {}, id ? { eventID: id } : undefined) }

  // reduz a foto no navegador antes de subir (até 1600 px, JPEG); o logo vai em PNG pra manter o fundo transparente
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
      img.onerror = function () { erro(new Error('Essa imagem não abriu. Tenta outra (JPG ou PNG).')) }
      img.src = url
    })
  }
  function aviso(texto, tipo) {
    var t = document.createElement('div'); t.className = 'toast ' + (tipo || ''); t.textContent = texto; t.setAttribute('role', 'status')
    document.body.appendChild(t); setTimeout(function () { t.classList.add('sai') }, 2600); setTimeout(function () { t.remove() }, 3200)
  }
  function copia(texto) { return (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(function () { aviso('Legenda copiada') }, function () { prompt('Copia a legenda:', texto) }) }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function dataBR(d) { if (!d) return ''; var x = new Date(d.length === 10 ? d + 'T12:00:00' : d); return x.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '') }

  // ---------- chat de suporte (área do cliente, teste e site) ----------
  // OITO.chat(container, { c: codigo })  ou  OITO.chat(container, {})  (visitante: pede contato na primeira mensagem)
  function chat(el, op) {
    op = op || {}
    var chKey = 'oito_chamado_' + marca, chId = op.c ? null : ls.get(chKey)
    el.innerHTML = '<div class="chat"><div class="chat-msgs" aria-live="polite"></div>' +
      (op.c ? '' : '<input class="chat-contato" placeholder="Seu WhatsApp ou e-mail (pra gente responder)" autocomplete="tel">') +
      '<form class="chat-form"><textarea rows="2" placeholder="Escreve sua dúvida…" required maxlength="2000"></textarea><button class="btn">Enviar</button></form>' +
      '<p class="chat-nota">Respondemos aqui mesmo, na hora. Se precisar de alguém da equipe, a resposta vem em até 1 dia útil.</p></div>'
    var caixa = el.querySelector('.chat-msgs'), form = el.querySelector('form'), ta = form.querySelector('textarea'), contato = el.querySelector('.chat-contato')
    if (chId && contato) contato.style.display = 'none'
    function desenha(chamados) {
      var msgs = []; (chamados || []).slice().reverse().forEach(function (ch) { msgs = msgs.concat(ch.msgs) })
      caixa.innerHTML = msgs.length ? msgs.map(function (m) {
        return '<div class="bolha ' + m.autor + '"><span>' + esc(m.texto).replace(/\n/g, '<br>') + '</span><small>' + (m.autor === 'cliente' ? 'Você' : m.autor === 'ia' ? 'Atendimento' : 'Equipe') + ' · ' + new Date(m.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</small></div>'
      }).join('') : '<p class="chat-vazio">Nenhuma conversa ainda. Pergunta o que quiser: como funciona, pagamento, ajustes, como postar.</p>'
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
      caixa.insertAdjacentHTML('beforeend', '<div class="bolha cliente"><span>' + esc(texto) + '</span></div><div class="bolha ia digitando"><span>Respondendo…</span></div>'); caixa.scrollTop = caixa.scrollHeight
      api('suporte', corpo).then(function (j) {
        ta.value = ''; if (!op.c && j.chamado) { chId = j.chamado.id; ls.set(chKey, chId); if (contato) contato.style.display = 'none' }
        carrega()
      }).catch(function (er) { aviso(er.message, 'erro'); carrega() }).then(function () { b.disabled = false; b.textContent = 'Enviar' })
    }
    carrega(); setInterval(carrega, 20000)
  }

  // ---------- "salvar como app" (área do cliente) ----------
  // O manifesto é dinâmico: o app instalado abre direto na área deste cliente. No Android aparece o botão Instalar;
  // no iPhone, o passo a passo do Safari. Se já está aberto como app, não mostra nada.
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
      ? (safari ? '<ol><li>Toque em <b>Compartilhar</b> <span aria-hidden="true">⬆️</span>, na barra de baixo do Safari.</li><li>Role e toque em <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>. Pronto: o ícone fica junto dos seus apps.</li></ol>'
        : '<p>Abra este link no <b>Safari</b> (no menu ••• toque em "Abrir no Safari") e depois: <b>Compartilhar ⬆️ → Adicionar à Tela de Início</b>.</p>')
      : android ? '<ol><li>Toque em <b>Instalar</b> aqui embaixo.</li><li>Se o botão não aparecer: no Chrome, toque nos <b>⋮</b> (canto de cima) → <b>Adicionar à tela inicial</b> ou <b>Instalar app</b>.</li></ol>'
      : '<p>No celular, abra este mesmo link e adicione à tela de início. No computador, salve nos favoritos (Ctrl+D).</p>'
    el.innerHTML = '<div class="salva-app"><div class="sa-ic"><img src="/oito/' + marca + '/icone.png" alt=""></div><div class="sa-txt"><b>Salve sua área como app</b>' +
      '<p>Assim os posts do mês ficam a um toque, sem procurar link.</p>' + passos +
      '<div class="sa-acoes"><button class="btn peq instalar-agora"' + (pedidoInstalar ? '' : ' hidden') + '>Instalar</button><button class="btn peq fantasma sa-copia">Copiar meu link</button><button class="sa-fecha" aria-label="Fechar">Agora não</button></div></div></div>'
    el.querySelector('.instalar-agora').onclick = function () { if (!pedidoInstalar) return; pedidoInstalar.prompt(); pedidoInstalar.userChoice.then(function (r) { if (r.outcome === 'accepted') { rastro('app_instalado', {}, c); el.innerHTML = '' } }) }
    el.querySelector('.sa-copia').onclick = function () { var u = location.origin + url('conta.html?c=' + c); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { aviso('Link copiado. Guarde no WhatsApp ou nos favoritos.') }, function () { prompt('Seu link:', u) }) }
    el.querySelector('.sa-fecha').onclick = function () { ls.set('oito_app_fechado_' + c, '1'); el.innerHTML = '' }
  }

  window.OITO = { marca: marca, url: url, emDominio: emDominio, salvaApp: salvaApp, sessao: sessao, q: q, api: api, rastro: rastro, fb: fb, comprime: comprime, aviso: aviso, copia: copia, esc: esc, dataBR: dataBR, chat: chat, ls: ls,
    utm: function () { try { return JSON.parse(ls.get('oito_utm') || 'null') } catch (e) { return null } } }

  // WhatsApp (15/10): o funil principal agora é o WhatsApp. Todo link [data-whats="onde"] abre o wa.me com a mensagem pronta;
  // o clique conta como whats_clique no funil e dispara Contact + Lead no pixel (o Lead do formulário continua no form.js).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-whats]'); if (!a) return
    rastro('whats_clique', { de: a.dataset.whats || '' })
    var id = 'whats-' + sessao + '-' + Date.now().toString(36)
    fb('Contact', { content_name: marca, content_category: 'whatsapp' }, id + '-c')
    fb('Lead', { content_name: marca, content_category: 'whatsapp' }, id)
  })

  // botão flutuante de ajuda (abre o chat numa gaveta) em toda página com [data-ajuda]
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-ajuda]'); if (!a) return; e.preventDefault()
    var g = document.querySelector('.gaveta-ajuda')
    if (!g) {
      g = document.createElement('div'); g.className = 'gaveta-ajuda'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-label', 'Ajuda')
      g.innerHTML = '<div class="gaveta-topo"><b>Fale com a gente</b><button class="fecha" aria-label="Fechar">×</button></div><div class="gaveta-corpo"></div>'
      document.body.appendChild(g); g.querySelector('.fecha').onclick = function () { g.classList.remove('aberta') }
      chat(g.querySelector('.gaveta-corpo'), { c: q.get('c') || undefined })
    }
    g.classList.add('aberta')
  })
})()
