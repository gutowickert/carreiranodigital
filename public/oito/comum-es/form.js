// Oito Posts en español: el formulario de 5 pasos (comecar.html). Guarda lo escrito (menos las imágenes) si la persona sale y vuelve.
// Diferencias con el brasileño: país (CO/CL), NIT/RUT opcional y WhatsApp con el código del país.
function OITO_FORM(paletas) {
  var f = document.getElementById('f'), etapas = [].slice.call(f.querySelectorAll('.etapa')), n = 0
  var segue = document.getElementById('segue'), volta = document.getElementById('volta'), erro = document.getElementById('erro')
  var barra = document.querySelector('.barra i'), passoTxt = document.getElementById('passo-txt')
  var chave = 'oito_form_' + OITO.marca, logo = null, fotos = [], comecou = false

  // celular por país: código, largo, primer dígito, formato y ejemplo
  var PAISES = {
    CO: { ddi: '57', largo: 10, inicio: '3', doc: 'NIT de tu negocio', ej: '300 123 4567', ayuda: 'Celular de Colombia: 10 dígitos, empieza por 3.', fmt: function (d) { return d.length > 6 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d } },
    CL: { ddi: '56', largo: 9, inicio: '9', doc: 'RUT de tu negocio', ej: '9 1234 5678', ayuda: 'Celular de Chile: 9 dígitos, empieza por 9.', fmt: function (d) { return d.length > 5 ? d.slice(0, 1) + ' ' + d.slice(1, 5) + ' ' + d.slice(5) : d.length > 1 ? d.slice(0, 1) + ' ' + d.slice(1) : d } },
  }

  // recupera el borrador
  try { var r = JSON.parse(OITO.ls.get(chave) || '{}'); Object.keys(r).forEach(function (k) { var el = f.elements[k]; if (!el) return; if (el.length && el[0] && el[0].type === 'radio') { [].forEach.call(el, function (x) { x.checked = x.value === r[k] }) } else el.value = r[k] }) } catch (e) {}
  function salva() { var o = {}; [].forEach.call(f.elements, function (el) { if (!el.name || el.type === 'file' || el.type === 'checkbox') return; if (el.type === 'radio') { if (el.checked) o[el.name] = el.value } else o[el.name] = el.value }); OITO.ls.set(chave, JSON.stringify(o)) }
  f.addEventListener('input', function () { salva(); if (!comecou) { comecou = true; OITO.rastro('form_inicio', { de: 'formulario' }) } })
  f.addEventListener('change', salva)

  function pais() { return PAISES[f.elements.pais.value] || null }
  // país que vino del anuncio (?pais=CO|CL, en esta página o en la de venta): el de la URL de esta página manda;
  // el guardado desde la página de venta solo se usa si la persona todavía no eligió
  ;(function () {
    var u = (OITO.q.get('pais') || '').toUpperCase(), g = OITO.ls.get('oito_pais'), v = PAISES[u] ? u : (!f.elements.pais.value && PAISES[g] ? g : '')
    if (v) [].forEach.call(f.elements.pais, function (x) { x.checked = x.value === v })
  })()
  var zap = f.elements.whatsapp
  // los dígitos del celular, sin el código del país si la persona lo escribió o lo pegó
  function digitos() {
    var p = pais() || PAISES.CO, d = zap.value.replace(/\D/g, '')
    if (d.length > p.largo && d.indexOf(p.ddi) === 0) d = d.slice(p.ddi.length)
    return d.slice(0, p.largo)
  }
  function formata() { var p = pais() || PAISES.CO; zap.value = p.fmt(digitos()) }
  zap.addEventListener('input', formata)
  // al elegir el país cambian el código, el ejemplo, la ayuda y el nombre del documento
  function trocaPais() {
    var p = pais()
    document.getElementById('ddi').textContent = '+' + (p ? p.ddi : '57')
    zap.placeholder = p ? p.ej : PAISES.CO.ej
    document.getElementById('zap-ajuda').textContent = p ? p.ayuda : 'Celular con WhatsApp.'
    document.getElementById('doc-rot').textContent = p ? p.doc : 'NIT (Colombia) / RUT (Chile) de tu negocio'
    if (zap.value) formata()
  }
  ;[].forEach.call(f.elements.pais, function (r) { r.addEventListener('change', trocaPais) }); trocaPais()

  function mostra(i) {
    etapas.forEach(function (e, k) { e.classList.toggle('ativa', k === i) })
    n = i; barra.style.width = ((i + 1) / etapas.length * 100) + '%'; passoTxt.textContent = 'Paso ' + (i + 1) + ' de ' + etapas.length
    volta.style.visibility = i ? 'visible' : 'hidden'; segue.textContent = i === etapas.length - 1 ? 'Crear mis 2 posts' : 'Continuar'
    erro.textContent = ''; window.scrollTo({ top: 0, behavior: 'smooth' })
    var primeiro = etapas[i].querySelector('input:not([type=radio]):not([type=file]),textarea'); if (primeiro && i) setTimeout(function () { primeiro.focus({ preventScroll: true }) }, 250)
  }
  function valida(i) {
    var falta = [].slice.call(etapas[i].querySelectorAll('[required]')).filter(function (el) { return !el.value.trim() })
    if (falta.length) { erro.textContent = 'Completa lo que falta.'; falta[0].focus(); return false }
    if (i === 0) {
      if (!pais()) { erro.textContent = 'Elige el país de tu negocio: Colombia o Chile.'; f.elements.pais[0].focus(); return false }
      // el @ es opcional: si viene, la máquina lee el perfil para acertar el contenido. Acepta también el enlace del perfil.
      var ig = f.elements.instagram, m = ig.value.trim().match(/instagram\.com\/([A-Za-z0-9._]+)/)
      if (m) ig.value = '@' + m[1]
      if (ig.value && !/^@?[A-Za-z0-9._]{1,30}$/.test(ig.value.trim())) { erro.textContent = 'Revisa el @: solo letras, números, punto y guion bajo.'; ig.focus(); return false }
      var doc = f.elements.documento
      if (doc.value.trim() && !/^[0-9.\-\s]{6,15}[0-9kK]?$/.test(doc.value.trim())) { erro.textContent = pais().doc.replace(' de tu negocio', '') + ': revisa el número (solo números, puntos, guion y, en el RUT, la K).'; doc.focus(); return false }
    }
    if (i === 4) {
      var p = pais(), d = digitos()
      if (d.length !== p.largo || d[0] !== p.inicio) { erro.textContent = 'Revisa el WhatsApp. ' + p.ayuda; zap.focus(); return false }
      // correo obligatorio: el enlace de los posts y los avisos del mes van por ahí
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.elements.email.value.trim())) { erro.textContent = 'Revisa el correo: ahí te enviamos el enlace de tus posts.'; f.elements.email.focus(); return false }
    }
    if (i === 3 && f.elements.fotos_modo.value === 'enviar' && !fotos.length) { erro.textContent = 'Elige al menos una foto (o deja que creemos las imágenes).'; return false }
    return true
  }
  volta.onclick = function () { mostra(Math.max(0, n - 1)) }

  // logo y fotos
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
      document.getElementById('fotos-prev').innerHTML = fotos.map(function (d) { return '<img src="' + d + '" alt="">' }).join('')
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
    var E = f.elements, p = paletas[+E.paleta.value || 0], ps = pais()
    var corpo = {
      marca: OITO.marca, pais: E.pais.value, sessao: OITO.sessao, utm: OITO.utm(), fotos_modo: E.fotos_modo.value, cores: { fundo: p.fundo, destaque: p.destaque, texto: p.texto, nome: p.nome },
      // WhatsApp completo, con el código del país y sin el +: 573001234567 / 56912345678
      negocio: { nome: E.nome.value, cidade: E.cidade.value, bairro: E.bairro.value, instagram: E.instagram.value, documento: E.documento.value.trim(), responsavel: E.responsavel.value, whatsapp: ps.ddi + digitos(), email: E.email.value.trim() },
      contexto: { servicos: E.servicos.value, carro_chefe: E.carro_chefe.value, diferencial: E.diferencial.value, horario: E.horario.value, tom: E.tom.value, evitar: E.evitar.value },
    }
    // freno de pruebas repetidas: el servidor también revisa los códigos que este aparato ya recibió
    corpo.ja = ['divino', 'sabroso', 'peludo'].map(function (m) { return OITO.ls.get('oito_codigo_' + m) }).filter(Boolean)
    var codigo, existente = null
    OITO.api('lead', corpo).then(function (j) {
      codigo = j.codigo
      if (j.existente) { existente = j; return 'existente' }
      var sobe = Promise.resolve()
      if (logo) sobe = sobe.then(function () { return OITO.api('foto', { c: codigo, tipo: 'logo', dado: logo }).catch(function () {}) })
      fotos.forEach(function (d, i) { sobe = sobe.then(function () { segue.textContent = 'Enviando foto ' + (i + 1) + ' de ' + fotos.length + '…'; return OITO.api('foto', { c: codigo, dado: d }).catch(function () {}) }) })
      return sobe.then(function () { return OITO.api('cliente', { c: codigo, acao: 'liberar' }) })
    }).then(function () {
      OITO.ls.set(chave, '{}')
      // quien ya había pedido vuelve a los posts que ya recibió (sin contar como lead otra vez), en la página de la marca correcta
      if (existente) {
        var m = existente.marca || OITO.marca
        if (m === OITO.marca) { OITO.ls.set('oito_codigo_' + m, codigo); location.href = OITO.url('teste.html?c=' + codigo + '&ja=1'); return }
        var dom = { divino: 'feeddivino', sabroso: 'feedsabroso', peludo: 'feedpeludo' }[m]
        if (dom) { location.href = 'https://www.' + dom + '.com/teste.html?c=' + codigo + '&ja=1'; return }
        OITO.ls.set('oito_codigo_' + OITO.marca, codigo); location.href = OITO.url('teste.html?c=' + codigo + '&ja=1'); return
      }
      OITO.fb('Lead', { content_name: OITO.marca }, 'lead-' + codigo)
      OITO.ls.set('oito_codigo_' + OITO.marca, codigo)
      location.href = OITO.url('teste.html?c=' + codigo)
    }).catch(function (er) {
      erro.textContent = er.message; segue.disabled = false; segue.textContent = 'Intentar de nuevo'
      OITO.rastro('form_erro', { erro: String(er.message).slice(0, 120) })
    })
  }
  mostra(0)
}
