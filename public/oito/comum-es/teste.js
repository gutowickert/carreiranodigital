// Oito Posts en español: la pantalla de la prueba (teste.html?c=). Espera los 2 posts, los muestra y ofrece la suscripción por Hotmart.
// Suscribirse: POST /api/oito/assinar { c } → { url } (checkout de Hotmart) o { ja: true } (ya está activo).
// Después revisa GET /api/oito/cliente?c=...&pag=1 cada 10 s; cuando el estado pasa a "ativo", va a conta.html.
(function () {
  var c = (OITO.q.get('c') || OITO.ls.get('oito_codigo_' + OITO.marca) || '').toUpperCase()
  if (!c) { location.href = OITO.url('comecar.html'); return }
  document.getElementById('codigo').textContent = c
  // quien intentó pedir otra prueba gratis vuelve aquí con ?ja=1
  if (OITO.q.get('ja') === '1') setTimeout(function () { OITO.aviso('Ya habías pedido la prueba gratis: estos son tus posts.') }, 800)
  var etapas = [].slice.call(document.querySelectorAll('.etapas-geracao li')), t0 = Date.now(), viu = false, checkout = null
  // los pasos de la animación avanzan con el tiempo (el trabajo real toma ~40 s)
  var anima = setInterval(function () { var k = Math.min(etapas.length, Math.floor((Date.now() - t0) / 9000) + 1); etapas.forEach(function (li, i) { li.classList.toggle('feito', i < k) }) }, 1000)

  function olha(pag) {
    OITO.api('cliente?c=' + encodeURIComponent(c) + (pag ? '&pag=1' : '')).then(function (v) {
      if (v.status === 'ativo' || v.status === 'atrasado' || v.status === 'cancelado') { location.href = OITO.url('conta.html?c=' + c); return }
      var teste = (v.lotes || []).filter(function (l) { return l.tipo === 'teste' })[0]
      var posts = (v.posts || []).filter(function (p) { return teste && p.lote_id === teste.id })
      if (teste && teste.status === 'pronto' && posts.length) {
        clearInterval(anima)
        document.getElementById('gerando').classList.add('esconde'); document.getElementById('prontos').classList.remove('esconde')
        document.getElementById('titulo-prontos').textContent = 'Listos para publicar, ' + ((v.negocio || {}).nome || '')
        if (!viu) { viu = true; OITO_POSTS(document.getElementById('posts'), posts, {}); OITO.rastro('teste_visto', {}, c); OITO.salvaApp(document.getElementById('salva-app'), c) }
        if (v.status === 'aguardando_pagamento') aguardando()
        return
      }
      if (teste && teste.status === 'erro') { document.querySelector('#gerando h1').textContent = 'Algo salió mal aquí'; document.querySelector('#gerando p').textContent = 'Nuestro equipo ya recibió el aviso y va a rehacer tus posts. Puedes cerrar: el enlace de esta página sigue sirviendo.'; clearInterval(anima); return }
      setTimeout(function () { olha() }, 3500)
    }).catch(function () { setTimeout(function () { olha() }, 6000) })
  }

  // muestra "completa el pago en Hotmart" y revisa el pago cada 10 s
  function aguardando(url) {
    if (url) checkout = url
    document.getElementById('assina').classList.add('esconde'); document.getElementById('aguardando').classList.remove('esconde')
    var b = document.getElementById('pagar')
    if (checkout) { b.href = checkout; b.onclick = null } else { b.onclick = function (e) { e.preventDefault(); reabre() } }
    if (!window._pag) window._pag = setInterval(function () { olha(true) }, 10000)
  }
  function reabre() {
    var w = window.open('', '_blank')
    OITO.api('assinar', { c: c }).then(function (j) {
      if (j.ja) { if (w) w.close(); location.href = OITO.url('conta.html?c=' + c); return }
      var u = j.url || j.fatura
      if (u) { checkout = u; if (w) w.location = u; else location.href = u; aguardando(u) } else if (w) w.close()
      if (j.simulado) document.getElementById('simular').hidden = false
    }).catch(function (er) { if (w) w.close(); OITO.aviso(er.message, 'erro') })
  }

  document.getElementById('assinar').onclick = function () {
    var b = this, er = document.getElementById('a-erro'); er.textContent = ''
    // la pestaña se abre en el mismo clic (así el navegador no la bloquea) y recibe la dirección de Hotmart cuando llega
    var w = window.open('', '_blank')
    if (w) try { w.document.write('<!doctype html><meta charset="utf-8"><title>Hotmart</title><p style="font:18px system-ui;padding:40px;text-align:center">Abriendo el pago seguro de Hotmart…</p>') } catch (e) {}
    b.disabled = true; b.textContent = 'Abriendo Hotmart…'
    OITO.rastro('assinar_clique', {}, c); OITO.fb('InitiateCheckout', { value: OITO.preco, currency: 'USD', content_name: OITO.marca }, 'checkout-' + c)
    OITO.api('assinar', { c: c })
      .then(function (j) {
        if (j.ja) { if (w) w.close(); location.href = OITO.url('conta.html?c=' + c); return }
        var u = j.url || j.fatura
        if (!u) throw new Error('No pudimos abrir el pago. Inténtalo de nuevo en un momento.')
        if (w) w.location = u; else window.open(u, '_blank')
        if (j.simulado) document.getElementById('simular').hidden = false
        aguardando(u)
        OITO.rastro('checkout_aberto', {}, c)
        document.getElementById('aguardando').scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      .catch(function (x) { if (w) w.close(); er.textContent = x.message; b.disabled = false; b.textContent = 'Suscribirme por US$ ' + OITO.preco + '/mes' })
  }
  document.getElementById('simular').onclick = function () { OITO.api('pagamento', { c: c, simular: true }).then(function () { olha(true) }) }
  olha(OITO.q.get('pago') === '1')
})()
