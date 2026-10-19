// 19/10: a página do aluno mais limpa. Roda depois do script da página (que cuida dos checks e do progresso).
// 1) cada passo mostra só o título, os botões das telas e o pedido pra máquina; o resto vai pro "Como fazer"
// 2) um encontro por vez: o menu do topo vira abas e abre no encontro em que o aluno está
// 3) o passo da vez fica aberto; ao marcar, ele fecha e o próximo abre
(function () {
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch (e) { return null } }
  var FICA = { H3: 1 }, CLASSES_FICAM = ['ir', 'pede', 'ck']
  document.querySelectorAll('.passo .corpo').forEach(function (c) {
    var mover = [].slice.call(c.children).filter(function (el) {
      return !FICA[el.tagName] && !CLASSES_FICAM.some(function (k) { return el.classList.contains(k) })
    })
    if (!mover.length) return
    var d = document.createElement('details'); d.className = 'como'
    d.innerHTML = '<summary>Como fazer</summary><div class="dentro"></div>'
    var dentro = d.querySelector('.dentro')
    mover.forEach(function (el) { dentro.appendChild(el) })
    c.appendChild(d)
  })

  // "Travou? Pergunta pra tua máquina" vira um botão que abre
  var perg = document.getElementById('pergunta')
  if (perg) {
    var titulo = perg.querySelector('h2'), d2 = document.createElement('details')
    d2.className = 'vidro travou'; d2.id = 'pergunta'
    d2.innerHTML = '<summary>Travou? Pergunta pra tua máquina</summary><div class="dentro"></div>'
    var dt = d2.querySelector('.dentro');
    [].slice.call(perg.children).forEach(function (el) { if (el !== titulo && !el.classList.contains('olho')) dt.appendChild(el) })
    perg.replaceWith(d2)
  }

  var secoes = [].slice.call(document.querySelectorAll('section.etapa'))
  var abas = [].slice.call(document.querySelectorAll('nav.etapas a[data-e]'))
  var feito = function (p) { var i = p.querySelector('.ck input'); return i && i.checked }
  function proximo(sec) { return [].slice.call(sec.querySelectorAll('.passo')).filter(function (p) { return !feito(p) })[0] }
  // só mexe na classe quando muda (senão o observador lá embaixo entraria em ciclo)
  function destaca(sec, abrir) {
    var p = proximo(sec)
    sec.querySelectorAll('.passo').forEach(function (x) { var quer = x === p; if (x.classList.contains('agora') !== quer) x.classList.toggle('agora', quer) })
    if (!p) return
    var c = p.querySelector('details.como'); if (c && abrir) c.open = true
  }
  function mostra(id, rolar) {
    var sec = document.getElementById(id); if (!sec || secoes.indexOf(sec) < 0) return
    secoes.forEach(function (s) { s.classList.toggle('ativa', s === sec) })
    abas.forEach(function (a) { a.classList.toggle('on', a.dataset.e === id); a.setAttribute('aria-current', a.dataset.e === id ? 'page' : 'false') })
    ls('imersao-dv-aba', id); destaca(sec, true)
    if (rolar) { var nav = document.getElementById('nav'); window.scrollTo({ top: nav.getBoundingClientRect().top + scrollY - 4, behavior: 'smooth' }) }
  }
  if (secoes.length > 1 && abas.length) {
    document.body.classList.add('limpo')
    abas.forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); mostra(a.dataset.e, true); history.replaceState(null, '', '#' + a.dataset.e) }, true) })
    // abre: o #encontro do link > a última aba aberta > o primeiro encontro com passo por fazer
    var h = location.hash.slice(1), salva = ls('imersao-dv-aba')
    var inicio = (document.getElementById(h) && h) || (document.getElementById(salva) && salva) || ((secoes.filter(function (s) { return proximo(s) })[0] || secoes[0]).id)
    mostra(inicio, false)
  } else secoes.forEach(function (s) { destaca(s, true) })

  // ao marcar um passo: ele vira uma linha e o próximo abre
  document.addEventListener('change', function (ev) {
    var p = ev.target.closest && ev.target.closest('.passo'); if (!p) return
    var sec = p.closest('section.etapa'); if (!sec) return
    setTimeout(function () {
      if (feito(p)) { var c = p.querySelector('details.como'); if (c) c.open = false }
      destaca(sec, feito(p))
    }, 0)
  })
  // o progresso pode chegar do banco depois (link individual): refaz o destaque quando os checks mudarem
  var obs = new MutationObserver(function () { var a = document.querySelector('section.etapa.ativa') || secoes[0]; if (a) destaca(a, false) })
  document.querySelectorAll('.passo').forEach(function (p) { obs.observe(p, { attributes: true, attributeFilter: ['class'] }) })
})()
