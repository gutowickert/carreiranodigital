// Oito Posts en español: el formulario de 5 pasos (comecar.html). Guarda lo escrito (menos las imágenes) si la persona sale y vuelve.
// Diferencias con el brasileño: documento opcional y WhatsApp con el código del país. El país sale de ese código (17/10: el anuncio corre en el mundo
// entero; el código ya viene marcado por la conexión). "Otro país" (OT): la persona escribe el número completo con el código.
function OITO_FORM(paletas) {
  var f = document.getElementById('f'), etapas = [].slice.call(f.querySelectorAll('.etapa')), n = 0
  var segue = document.getElementById('segue'), volta = document.getElementById('volta'), erro = document.getElementById('erro')
  var barra = document.querySelector('.barra i'), passoTxt = document.getElementById('passo-txt')
  var chave = 'oito_form_' + OITO.marca, logo = null, fotos = [], comecou = false

  // celular por país: código, dígitos del celular (sin el 0 de larga distancia), primeros dígitos válidos, grupos para el formato, ejemplo y documento.
  // Argentina: en WhatsApp va 54 + 9 + el número; México: 52 + 10 dígitos. La misma tabla está en lib/oito/config.ts (PAISES_ES).
  function P(nome, ddi, largo, inicio, grupos, ej, doc) { return { nome: nome, ddi: ddi, largo: largo, inicio: inicio, grupos: grupos, ej: ej, doc: doc, ayuda: 'Celular de ' + nome + ': ' + largo + ' dígitos' + (inicio ? ', empieza por ' + inicio.split('|').join(' o ') : '') + '.' } }
  var PAISES = {
    AR: P('Argentina', '54', 10, '', [2, 4, 4], '11 2345 6789', 'CUIT'),
    BO: P('Bolivia', '591', 8, '6|7', [4, 4], '7123 4567', 'NIT'),
    CL: P('Chile', '56', 9, '9', [1, 4, 4], '9 1234 5678', 'RUT'),
    CO: P('Colombia', '57', 10, '3', [3, 3, 4], '300 123 4567', 'NIT'),
    CR: P('Costa Rica', '506', 8, '', [4, 4], '8312 3456', 'Cédula jurídica'),
    EC: P('Ecuador', '593', 9, '9', [2, 3, 4], '99 123 4567', 'RUC'),
    SV: P('El Salvador', '503', 8, '6|7', [4, 4], '7012 3456', 'NIT'),
    GT: P('Guatemala', '502', 8, '', [4, 4], '5123 4567', 'NIT'),
    HN: P('Honduras', '504', 8, '', [4, 4], '9123 4567', 'RTN'),
    MX: P('México', '52', 10, '', [2, 4, 4], '55 1234 5678', 'RFC'),
    NI: P('Nicaragua', '505', 8, '', [4, 4], '8123 4567', 'RUC'),
    PA: P('Panamá', '507', 8, '6', [4, 4], '6123 4567', 'RUC'),
    PY: P('Paraguay', '595', 9, '9', [3, 3, 3], '981 123 456', 'RUC'),
    PE: P('Perú', '51', 9, '9', [3, 3, 3], '912 345 678', 'RUC'),
    PR: P('Puerto Rico', '1', 10, '787|939', [3, 3, 4], '787 123 4567', 'Número de registro'),
    DO: P('República Dominicana', '1', 10, '809|829|849', [3, 3, 4], '809 123 4567', 'RNC'),
    UY: P('Uruguay', '598', 8, '9', [2, 3, 3], '91 234 567', 'RUT'),
    VE: P('Venezuela', '58', 10, '4', [3, 3, 4], '412 123 4567', 'RIF'),
    ES: P('España', '34', 9, '6|7', [3, 3, 3], '612 345 678', 'NIF'),
    US: P('Estados Unidos', '1', 10, '', [3, 3, 4], '305 123 4567', 'EIN'),
    CA: P('Canadá', '1', 10, '', [3, 3, 4], '416 123 4567', 'Business Number'),
    OT: { nome: 'otro país', ddi: '', largo: 15, inicio: '', grupos: [3, 3, 3, 3, 3], ej: '+44 7700 900123', doc: 'Documento fiscal', ayuda: 'Escribe el número completo, con el código del país.' },
  }
  function fmt(p, d) { var r = [], k = 0; p.grupos.forEach(function (g) { if (k < d.length) r.push(d.slice(k, k + g)); k += g }); return r.join(' ') }

  // recupera el borrador
  try { var r = JSON.parse(OITO.ls.get(chave) || '{}'); Object.keys(r).forEach(function (k) { var el = f.elements[k]; if (!el) return; if (el.length && el[0] && el[0].type === 'radio') { [].forEach.call(el, function (x) { x.checked = x.value === r[k] }) } else el.value = r[k] }) } catch (e) {}
  function salva() { var o = {}; [].forEach.call(f.elements, function (el) { if (!el.name || el.type === 'file' || el.type === 'checkbox') return; if (el.type === 'radio') { if (el.checked) o[el.name] = el.value } else o[el.name] = el.value }); OITO.ls.set(chave, JSON.stringify(o)) }
  f.addEventListener('input', function () { salva(); if (!comecou) { comecou = true; OITO.rastro('form_inicio', { de: 'formulario' }) } })
  f.addEventListener('change', salva)

  var sel = f.elements.pais
  function pais() { return PAISES[sel.value] || null }
  var OT = PAISES.OT
  // país que vino del anuncio (?pais=XX, en esta página o en la de venta): el de la URL de esta página manda;
  // el guardado desde la página de venta solo se usa si la persona todavía no eligió; si no hay ninguno, el país de la conexión
  ;(function () {
    var u = (OITO.q.get('pais') || '').toUpperCase(), g = OITO.ls.get('oito_pais'), v = PAISES[u] ? u : (!sel.value && PAISES[g] ? g : '')
    if (v) { sel.value = v; return }
    // país fuera de la lista (Brasil, Italia...): "Otro país"
    if (!sel.value) fetch('/api/oito/pais').then(function (r) { return r.json() }).then(function (j) { if (!sel.value && j.pais) { sel.value = PAISES[j.pais] && j.pais !== 'OT' ? j.pais : 'OT'; trocaPais(); salva() } }).catch(function () {})
  })()
  var zap = f.elements.whatsapp
  // los dígitos del celular, sin el código del país si la persona lo escribió o lo pegó
  function digitos() {
    var p = pais() || PAISES.CO, d = zap.value.replace(/\D/g, '')
    if (p === OT) return d.slice(0, 15)
    if (d.length > p.largo && d.indexOf(p.ddi) === 0) d = d.slice(p.ddi.length)
    if (p === PAISES.AR && d.length > p.largo && d[0] === '9') d = d.slice(1) // 54 9 11...
    if (p === PAISES.MX && d.length > p.largo && d[0] === '1') d = d.slice(1) // el 1 viejo de los celulares de México
    while (d.length > p.largo && d[0] === '0') d = d.slice(1) // 0 de larga distancia (Ecuador, Venezuela, Paraguay...)
    return d.slice(0, p.largo)
  }
  function formata() { var p = pais() || PAISES.CO; if (p === OT) return; zap.value = fmt(p, digitos()) }
  zap.addEventListener('input', formata)
  // al elegir el país cambian el código, el ejemplo, la ayuda y el nombre del documento
  function trocaPais() {
    var p = pais()
    document.getElementById('ddi').textContent = p ? (p === OT ? 'Otro' : '+' + p.ddi) : 'País'
    zap.placeholder = p ? p.ej : 'Tu celular'
    document.getElementById('zap-ajuda').textContent = p ? p.ayuda : 'Elige el país al lado del número.'
    document.getElementById('doc-rot').textContent = p ? p.doc + ' de tu negocio' : 'Documento fiscal de tu negocio'
    if (zap.value) formata()
  }
  sel.addEventListener('change', trocaPais); trocaPais()

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
      // el @ es opcional: si viene, la máquina lee el perfil para acertar el contenido. Acepta también el enlace del perfil.
      var ig = f.elements.instagram, m = ig.value.trim().match(/instagram\.com\/([A-Za-z0-9._]+)/)
      if (m) ig.value = '@' + m[1]
      if (ig.value && !/^@?[A-Za-z0-9._]{1,30}$/.test(ig.value.trim())) { erro.textContent = 'Revisa el @: solo letras, números, punto y guion bajo.'; ig.focus(); return false }
      var doc = f.elements.documento
      if (doc.value.trim() && !/^[0-9A-Za-zÑñ.\-\s]{5,20}$/.test(doc.value.trim())) { erro.textContent = 'Documento: revisa el número (solo letras, números, puntos y guion).'; doc.focus(); return false }
    }
    if (i === 4) {
      var p = pais(), d = digitos()
      if (!p) { erro.textContent = 'Elige el país al lado del número de WhatsApp.'; sel.focus(); return false }
      if (p === OT ? d.length < 10 || d.length > 15 : d.length !== p.largo || (p.inicio && !new RegExp('^(' + p.inicio + ')').test(d))) { erro.textContent = 'Revisa el WhatsApp. ' + p.ayuda; zap.focus(); return false }
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
      negocio: { nome: E.nome.value, cidade: E.cidade.value, bairro: E.bairro.value, instagram: E.instagram.value, documento: E.documento.value.trim(), responsavel: E.responsavel.value, whatsapp: ps === OT ? digitos().replace(/^00/, '') : ps.ddi + (ps === PAISES.AR ? '9' : '') + digitos(), email: E.email.value.trim() },
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
        var otra = OITO.urlDe(m, 'teste.html?c=' + codigo + '&ja=1')
        if (otra) { OITO.ls.set('oito_codigo_' + m, codigo); location.href = otra; return }
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
