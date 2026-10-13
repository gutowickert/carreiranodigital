// Oito Posts: a tela do teste (teste.html?c=). Espera os 2 posts, mostra, e oferece a assinatura.
(function () {
  var c = (OITO.q.get('c') || OITO.ls.get('oito_codigo_' + OITO.marca) || '').toUpperCase()
  if (!c) { location.href = '/oito/' + OITO.marca + '/comecar.html'; return }
  document.getElementById('codigo').textContent = c
  var etapas = [].slice.call(document.querySelectorAll('.etapas-geracao li')), t0 = Date.now(), viu = false, faturaUrl = null
  // as etapas da animação avançam com o tempo (o trabalho real leva ~40 s)
  var anima = setInterval(function () { var k = Math.min(etapas.length, Math.floor((Date.now() - t0) / 9000) + 1); etapas.forEach(function (li, i) { li.classList.toggle('feito', i < k) }) }, 1000)

  function olha(pag) {
    OITO.api('cliente?c=' + encodeURIComponent(c) + (pag ? '&pag=1' : '')).then(function (v) {
      if (v.status === 'ativo' || v.status === 'atrasado' || v.status === 'cancelado') { location.href = '/oito/' + OITO.marca + '/conta.html?c=' + c; return }
      var teste = v.lotes.filter(function (l) { return l.tipo === 'teste' })[0]
      var posts = v.posts.filter(function (p) { return teste && p.lote_id === teste.id })
      if (teste && teste.status === 'pronto' && posts.length) {
        clearInterval(anima)
        document.getElementById('gerando').classList.add('esconde'); document.getElementById('prontos').classList.remove('esconde')
        document.getElementById('titulo-prontos').textContent = 'Prontos pra postar, ' + (v.negocio.nome || '')
        OITO_POSTS(document.getElementById('posts'), posts, {})
        if (!viu) { viu = true; OITO.rastro('teste_visto', {}, c) }
        if (v.negocio.email) document.getElementById('a-email').value = v.negocio.email
        if (v.status === 'aguardando_pagamento') aguardando()
        return
      }
      if (teste && teste.status === 'erro') { document.querySelector('#gerando h1').textContent = 'Deu um problema aqui'; document.querySelector('#gerando p').textContent = 'Nossa equipe já foi avisada e refaz seus posts. Pode fechar: o link desta página continua valendo.'; clearInterval(anima); return }
      setTimeout(function () { olha() }, 3500)
    }).catch(function () { setTimeout(function () { olha() }, 6000) })
  }

  function aguardando(url) {
    if (url) faturaUrl = url
    document.getElementById('assina').classList.add('esconde'); document.getElementById('aguardando').classList.remove('esconde')
    var b = document.getElementById('pagar')
    if (faturaUrl) b.href = faturaUrl; else { b.onclick = function (e) { e.preventDefault(); reabre() } }
    // confere o pagamento a cada 10 s
    if (!window._pag) window._pag = setInterval(function () { olha(true) }, 10000)
  }
  function reabre() { OITO.api('assinar', { c: c }).then(function (j) { if (j.fatura) { faturaUrl = j.fatura; window.open(j.fatura, '_blank') } if (j.simulado) document.getElementById('simular').hidden = false }) }

  document.getElementById('assina').onsubmit = function (e) {
    e.preventDefault()
    var b = e.target.querySelector('button'), er = document.getElementById('a-erro'); er.textContent = ''
    b.disabled = true; b.textContent = 'Abrindo a fatura…'
    OITO.rastro('assinar_clique', {}, c); OITO.fb('InitiateCheckout', { value: 197, currency: 'BRL', content_name: OITO.marca }, 'checkout-' + c)
    OITO.api('assinar', { c: c, nome: document.getElementById('a-nome').value, documento: document.getElementById('a-doc').value, email: document.getElementById('a-email').value })
      .then(function (j) {
        if (j.ja) { location.href = '/oito/' + OITO.marca + '/conta.html?c=' + c; return }
        if (j.simulado) document.getElementById('simular').hidden = false
        // a fatura abre numa aba nova (clique do botão, não bloqueia): esta tela fica conferindo o pagamento
        aguardando(j.fatura)
        document.getElementById('pagar').addEventListener('click', function () { OITO.rastro('fatura_aberta', {}, c) }, { once: true })
        document.getElementById('aguardando').scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      .catch(function (x) { er.textContent = x.message; b.disabled = false; b.textContent = 'Assinar e receber os 8 posts' })
  }
  document.getElementById('simular').onclick = function () { OITO.api('pagamento', { c: c, simular: true }).then(function () { olha(true) }) }
  olha(OITO.q.get('pago') === '1')
})()
