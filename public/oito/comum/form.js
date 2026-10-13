// Oito Posts: o formulário de 5 passos (comecar.html). Guarda o que foi digitado (menos as imagens) se a pessoa sair e voltar.
function OITO_FORM(paletas) {
  var f = document.getElementById('f'), etapas = [].slice.call(f.querySelectorAll('.etapa')), n = 0
  var segue = document.getElementById('segue'), volta = document.getElementById('volta'), erro = document.getElementById('erro')
  var barra = document.querySelector('.barra i'), passoTxt = document.getElementById('passo-txt')
  var chave = 'oito_form_' + OITO.marca, logo = null, fotos = [], comecou = false

  // recupera o rascunho
  try { var r = JSON.parse(OITO.ls.get(chave) || '{}'); Object.keys(r).forEach(function (k) { var el = f.elements[k]; if (!el) return; if (el.length && el[0] && el[0].type === 'radio') { [].forEach.call(el, function (x) { x.checked = x.value === r[k] }) } else el.value = r[k] }) } catch (e) {}
  function salva() { var o = {}; [].forEach.call(f.elements, function (el) { if (!el.name || el.type === 'file' || el.type === 'checkbox') return; if (el.type === 'radio') { if (el.checked) o[el.name] = el.value } else o[el.name] = el.value }); OITO.ls.set(chave, JSON.stringify(o)) }
  f.addEventListener('input', function () { salva(); if (!comecou) { comecou = true; OITO.rastro('form_inicio', { de: 'formulario' }) } })
  f.addEventListener('change', salva)

  var zap = f.elements.whatsapp
  zap.addEventListener('input', function () { var d = zap.value.replace(/\D/g, '').slice(0, 11); zap.value = d.length > 6 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4) : d.length > 2 ? '(' + d.slice(0, 2) + ') ' + d.slice(2) : d })

  function mostra(i) {
    etapas.forEach(function (e, k) { e.classList.toggle('ativa', k === i) })
    n = i; barra.style.width = ((i + 1) / etapas.length * 100) + '%'; passoTxt.textContent = 'Passo ' + (i + 1) + ' de ' + etapas.length
    volta.style.visibility = i ? 'visible' : 'hidden'; segue.textContent = i === etapas.length - 1 ? 'Gerar meus 2 posts' : 'Continuar'
    erro.textContent = ''; window.scrollTo({ top: 0, behavior: 'smooth' })
    var primeiro = etapas[i].querySelector('input:not([type=radio]):not([type=file]),textarea'); if (primeiro && i) setTimeout(function () { primeiro.focus({ preventScroll: true }) }, 250)
  }
  function valida(i) {
    var falta = [].slice.call(etapas[i].querySelectorAll('[required]')).filter(function (el) { return !el.value.trim() })
    if (falta.length) { erro.textContent = 'Preenche o que está faltando.'; falta[0].focus(); return false }
    // o @ é opcional: se vier, a máquina lê o perfil pra acertar o conteúdo. Aceita link do perfil também.
    if (i === 0) {
      var ig = f.elements.instagram, m = ig.value.trim().match(/instagram\.com\/([A-Za-z0-9._]+)/)
      if (m) ig.value = '@' + m[1]
      if (ig.value && !/^@?[A-Za-z0-9._]{1,30}$/.test(ig.value.trim())) { erro.textContent = 'Confere o @: só letras, números, ponto e sublinhado.'; ig.focus(); return false }
    }
    if (i === 4 && zap.value.replace(/\D/g, '').length < 10) { erro.textContent = 'Confere o WhatsApp, com DDD.'; zap.focus(); return false }
    if (i === 3 && f.elements.fotos_modo.value === 'enviar' && !fotos.length) { erro.textContent = 'Escolhe pelo menos uma foto (ou deixa que a gente gere as imagens).'; return false }
    return true
  }
  volta.onclick = function () { mostra(Math.max(0, n - 1)) }

  // logo e fotos
  document.getElementById('logo').onchange = function (e) {
    var a = e.target.files[0]; if (!a) return
    OITO.comprime(a, 800, true).then(function (d) { logo = d; document.getElementById('logo-prev').innerHTML = '<img src="' + d + '" alt="Logo" style="object-fit:contain;background:#fff">' }).catch(function (er) { OITO.aviso(er.message, 'erro') })
  }
  var caixaFotos = document.getElementById('fotos-caixa')
  function modoFotos() { caixaFotos.classList.toggle('esconde', f.elements.fotos_modo.value !== 'enviar') }
  ;[].forEach.call(f.elements.fotos_modo, function (r) { r.addEventListener('change', modoFotos) }); modoFotos()
  document.getElementById('fotos').onchange = function (e) {
    var lista = [].slice.call(e.target.files).slice(0, 10 - fotos.length)
    Promise.all(lista.map(function (a) { return OITO.comprime(a, 1600).catch(function () { return null }) })).then(function (ds) {
      fotos = fotos.concat(ds.filter(Boolean)).slice(0, 10)
      document.getElementById('fotos-prev').innerHTML = fotos.map(function (d) { return '<img src="' + d + '" alt="">' }).join('') + (fotos.length >= 10 ? '' : '')
    })
  }

  f.onsubmit = function (e) {
    e.preventDefault()
    if (!valida(n)) return
    if (n < etapas.length - 1) { OITO.rastro('form_passo', { passo: n + 2 }); return mostra(n + 1) }
    envia()
  }
  function envia() {
    segue.disabled = true; segue.textContent = 'Enviando…'
    var E = f.elements, p = paletas[+E.paleta.value || 0]
    var corpo = {
      marca: OITO.marca, sessao: OITO.sessao, utm: OITO.utm(), fotos_modo: E.fotos_modo.value, cores: { fundo: p.fundo, destaque: p.destaque, texto: p.texto, nome: p.nome },
      negocio: { nome: E.nome.value, cidade: E.cidade.value, bairro: E.bairro.value, instagram: E.instagram.value, responsavel: E.responsavel.value, whatsapp: E.whatsapp.value, email: E.email.value },
      contexto: { servicos: E.servicos.value, carro_chefe: E.carro_chefe.value, diferencial: E.diferencial.value, horario: E.horario.value, tom: E.tom.value, evitar: E.evitar.value },
    }
    var codigo
    OITO.api('lead', corpo).then(function (j) {
      codigo = j.codigo
      if (j.existente) return 'existente'
      var sobe = Promise.resolve()
      if (logo) sobe = sobe.then(function () { return OITO.api('foto', { c: codigo, tipo: 'logo', dado: logo }).catch(function () {}) })
      fotos.forEach(function (d, i) { sobe = sobe.then(function () { segue.textContent = 'Enviando foto ' + (i + 1) + ' de ' + fotos.length + '…'; return OITO.api('foto', { c: codigo, dado: d }).catch(function () {}) }) })
      return sobe.then(function () { return OITO.api('cliente', { c: codigo, acao: 'liberar' }) })
    }).then(function () {
      OITO.fb('Lead', { content_name: OITO.marca }, 'lead-' + codigo)
      OITO.ls.set(chave, '{}'); OITO.ls.set('oito_codigo_' + OITO.marca, codigo)
      location.href = OITO.url('teste.html?c=' + codigo)
    }).catch(function (er) {
      erro.textContent = er.message; segue.disabled = false; segue.textContent = 'Tentar de novo'
      OITO.rastro('form_erro', { erro: String(er.message).slice(0, 120) })
    })
  }
  mostra(0)
}
