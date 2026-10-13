// Oito Posts: o JS comum das páginas das 3 marcas (rastro do funil, pixel, fotos, chat de suporte, utilidades).
// Cada página tem <body data-marca="salao|prato|pata">. O pixel de cada marca fica em OITO_PIXEL (vazio = desligado).
(function () {
  var OITO_PIXEL = { salao: '', prato: '', pata: '' }
  var marca = document.body.dataset.marca
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
  function rastro(tipo, detalhe, c) {
    if (ls.get('oito_eu')) return
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

  window.OITO = { marca: marca, sessao: sessao, q: q, api: api, rastro: rastro, fb: fb, comprime: comprime, aviso: aviso, copia: copia, esc: esc, dataBR: dataBR, chat: chat, ls: ls,
    utm: function () { try { return JSON.parse(ls.get('oito_utm') || 'null') } catch (e) { return null } } }

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
