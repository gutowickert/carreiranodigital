// Oito Posts en español: el área del cliente (conta.html?c=): posts del mes, mi negocio, fotos, ayuda y suscripción.
// El cobro es de Hotmart; el botón de cancelar llama a POST /api/oito/cliente { acao: 'cancelar' } y el servidor cancela en Hotmart.
(function () {
  var c = (OITO.q.get('c') || OITO.ls.get('oito_codigo_' + OITO.marca) || '').toUpperCase(), E = OITO.esc, v = null, aba = 'posts', vigia = null
  if (!c) { location.href = OITO.url(''); return }
  OITO.ls.set('oito_codigo_' + OITO.marca, c)
  var STATUS = { ativo: ['ok', 'Suscripción al día'], aguardando_pagamento: ['alerta', 'Esperando el pago'], atrasado: ['ruim', 'Pago pendiente'], cancelado: ['', 'Suscripción cancelada'], teste: ['', 'Prueba gratis'] }

  ;[].forEach.call(document.querySelectorAll('[data-aba]'), function (b) {
    b.onclick = function () { aba = b.dataset.aba; [].forEach.call(document.querySelectorAll('[data-aba]'), function (x) { x.setAttribute('aria-selected', x === b) }); [].forEach.call(document.querySelectorAll('.aba'), function (x) { x.classList.toggle('esconde', x.id !== 'aba-' + aba) }) }
  })

  function carrega(pag) {
    return OITO.api('cliente?c=' + encodeURIComponent(c) + (pag ? '&pag=1' : '')).then(function (x) { v = x; desenha() }).catch(function (e) {
      document.getElementById('nome-neg').textContent = e.status === 404 ? 'Código no encontrado' : 'No cargó. Actualiza la página.'
    })
  }

  function desenha() {
    document.getElementById('nome-neg').textContent = v.negocio.nome
    var s = STATUS[v.status] || ['', v.status]
    document.getElementById('situacao').innerHTML = '<span class="pilula ' + s[0] + '">' + s[1] + (v.pago_ate && v.status !== 'aguardando_pagamento' ? ' · hasta ' + OITO.dataBR(v.pago_ate) : '') + '</span>'
    if (v.status === 'ativo' && !OITO.ls.get('oito_comprou_' + c)) { OITO.ls.set('oito_comprou_' + c, '1'); OITO.fb('Purchase', { value: 39, currency: 'USD', content_name: OITO.marca }, 'compra-' + c) }
    if (!desenha.feito) { desenha.feito = true; OITO.rastro('area_visita', {}, c); OITO.salvaApp(document.getElementById('salva-app'), c); negocio(); fotos(); OITO.chat(document.getElementById('chat'), { c: c }) }
    posts(); assinatura()
    // mientras algo se está haciendo (o el pago no se confirma), se actualiza sola
    var andando = v.lotes.some(function (l) { return ['fila', 'gerando', 'espera'].indexOf(l.status) >= 0 }) || v.posts.some(function (p) { return p.status === 'ajuste_pedido' })
    clearTimeout(vigia); if (andando || v.status === 'aguardando_pagamento') vigia = setTimeout(function () { carrega(v.status === 'aguardando_pagamento') }, andando ? 6000 : 12000)
  }

  // "Publicar por mí" (14/10): la tarjeta vive en su propio espacio de la pestaña, fuera del redibujo de los posts (no borra lo que se está escribiendo)
  function corpoPosts() {
    var corpo = document.getElementById('posts-corpo')
    if (!corpo) { document.getElementById('aba-posts').innerHTML = '<div id="postar" style="margin-bottom:22px"></div><div id="posts-corpo"></div>'; corpo = document.getElementById('posts-corpo') }
    return corpo
  }
  var IGMSG = { ok: ['Instagram conectado. Los próximos posts se publicarán solos.'], erro: ['No se pudo conectar Instagram. Inténtalo de nuevo.', 'erro'], pessoal: ['Esa cuenta de Instagram es personal. Cámbiala a cuenta profesional y vuelve a conectar.', 'erro'], assinatura: ['Publicar por mí es parte de la suscripción.', 'erro'] }
  if (IGMSG[OITO.q.get('ig')]) { var igm = IGMSG[OITO.q.get('ig')]; setTimeout(function () { OITO.aviso(igm[0], igm[1]) }, 500); history.replaceState(null, '', location.pathname + '?c=' + c) }
  function quando(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + ' a las ' + s.slice(11, 16) : '' }
  function postar(lista) {
    var el = document.getElementById('postar'), ig = v.instagram || {}, tit = '<h3 style="margin-bottom:6px">Publicar por mí</h3>'
    var hora = ig.fuso === 'America/Santiago' ? 'hora de Chile' : 'hora de Colombia'
    if (document.activeElement && document.activeElement !== document.body && el.contains(document.activeElement)) return
    if (!ig.disponivel) { el.innerHTML = '<div class="caixa">' + tit + '<p class="suave">Muy pronto: los posts se publicarán solos en tu Instagram, el día y a la hora indicados.</p></div>'; return }
    if (v.status !== 'ativo') { el.innerHTML = '<div class="caixa">' + tit + '<p class="suave"><b>Disponible en la suscripción.</b> Conectas tu Instagram una vez y los 8 posts del mes se publican solos, el día sugerido. Puedes cambiar la hora o saltar cualquiera.</p></div>'; return }
    if (!ig.ligado) {
      el.innerHTML = '<div class="caixa">' + tit + '<p class="suave" style="margin-bottom:12px">Conecta tu Instagram una vez y los posts del mes se publican solos, el día sugerido, a las ' + E(ig.hora_padrao) + ' (' + hora + '). Puedes cambiar la hora o saltar cualquier post.</p>' +
        (ig.erro ? '<p style="margin-bottom:12px"><span class="pilula ruim">Instagram se desconectó. Vuelve a conectar.</span></p>' : '') +
        '<ul class="suave" style="padding-left:20px;display:grid;gap:5px;margin-bottom:16px;font-size:15px"><li>Tiene que ser una <b>cuenta profesional</b> (empresa o creador de contenido). Es gratis y toma 1 minuto: <a href="https://help.instagram.com/502981923235522" target="_blank" rel="noopener">mira cómo cambiarla</a>.</li><li>Inicias sesión en el propio Instagram: <b>nunca vemos tu contraseña</b>.</li><li>Puedes desconectar cuando quieras, aquí mismo.</li></ul>' +
        '<a class="btn" href="/api/oito/instagram/conectar?c=' + encodeURIComponent(c) + '">Conectar mi Instagram</a></div>'
      return
    }
    var fila = lista.filter(function (p) { return !p.publicado_em }), feitos = lista.filter(function (p) { return p.publicado_em }).length
    fila.sort(function (a, b) { return (a.publicar_em || a.data_sugerida || '9') > (b.publicar_em || b.data_sugerida || '9') ? 1 : -1 })
    var cmp = 'style="font-size:15px;padding:9px 10px;width:auto"'
    el.innerHTML = '<div class="caixa">' + tit + '<p class="suave" style="margin-bottom:14px"><span class="pilula ok">@' + E(ig.usuario || '') + ' conectado</span> Los posts se publican solos a la hora marcada (' + hora + ').' + (feitos ? ' Ya publicados este mes: <b>' + feitos + '</b>.' : '') + '</p>' +
      (fila.length ? '<div style="display:grid;gap:10px">' + fila.map(function (p) {
        var lc = p.publicar_local || ((p.data_sugerida || '') + 'T' + ig.hora_padrao)
        var st = p.status === 'ajuste_pedido' ? 'Rehaciéndose (mantiene la hora)' : p.nao_publicar ? 'No se va a publicar' : p.publicacao_erro ? 'No se publicó: ' + p.publicacao_erro + '. Guarda una hora nueva para intentarlo de nuevo.' : p.publicar_em ? 'Programado el ' + quando(p.publicar_local) : 'Sin hora (la fecha sugerida ya pasó)'
        return '<div data-ig="' + E(p.id) + '" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--linha);padding-top:10px">' +
          (p.url ? '<img src="' + E(p.url) + '" alt="" style="width:46px;height:58px;object-fit:cover;border-radius:8px">' : '') +
          '<div style="flex:1;min-width:150px"><b style="font-size:15px">' + E(p.titulo || 'Post') + '</b><br><small class="suave">' + E(st) + '</small></div>' +
          '<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><input type="date" ' + cmp + ' value="' + E(lc.slice(0, 10)) + '"><input type="time" ' + cmp + ' value="' + E(lc.slice(11, 16)) + '"><button class="btn peq" data-ig-a="salvar">Guardar</button>' +
          '<label style="display:flex;gap:6px;align-items:center;font-size:14px;cursor:pointer"><input type="checkbox" data-ig-a="pular" style="width:auto"' + (p.nao_publicar ? ' checked' : '') + '> No publicar este</label></span></div>'
      }).join('') + '</div>' : '<p class="suave">Ningún post en espera. Los del próximo mes entran aquí solos.</p>') +
      '<button class="btn peq fantasma" style="margin-top:16px" data-ig-a="desligar">Desconectar Instagram</button></div>'
    el.onclick = function (e) {
      var a = e.target.dataset.igA, linha = e.target.closest('[data-ig]')
      if (a === 'salvar') {
        var ins = linha.querySelectorAll('input'); e.target.disabled = true
        OITO.api('cliente', { c: c, acao: 'ig_agendar', post: linha.dataset.ig, quando: ins[0].value + 'T' + ins[1].value }).then(function () { OITO.aviso('Hora guardada.'); e.target.blur(); carrega() }).catch(function (er) { e.target.disabled = false; OITO.aviso(er.message, 'erro') })
      }
      if (a === 'desligar' && confirm('¿Desconectar Instagram? Los posts dejan de publicarse solos (siguen aquí para descargar).'))
        OITO.api('cliente', { c: c, acao: 'ig_desligar' }).then(function () { OITO.aviso('Instagram desconectado.'); carrega() }).catch(function (er) { OITO.aviso(er.message, 'erro') })
    }
    el.onchange = function (e) {
      if (e.target.dataset.igA !== 'pular') return
      OITO.api('cliente', { c: c, acao: 'ig_pular', post: e.target.closest('[data-ig]').dataset.ig, valor: e.target.checked }).then(function () { OITO.aviso(e.target.checked ? 'Ese no se va a publicar.' : 'Ese vuelve a la agenda.'); e.target.blur(); carrega() }).catch(function (er) { OITO.aviso(er.message, 'erro') })
    }
  }

  function posts() {
    var el = corpoPosts(), meses = v.lotes.filter(function (l) { return l.tipo === 'mes' }), atual = meses[0]
    if (!atual) {
      el.innerHTML = '<div class="caixa"><h3>' + (v.status === 'aguardando_pagamento' ? 'Apenas se confirme el pago, empezamos a hacer tus 8 posts.' : 'Tus posts del mes aparecen aquí después de suscribirte.') + '</h3>' +
        (v.status === 'aguardando_pagamento' ? '<p class="suave" style="margin-top:8px">Con tarjeta se confirma en minutos; otros medios pueden tardar un poco más. Esta página se actualiza sola.</p><button class="btn" style="margin-top:14px" id="ver-fatura">Completar el pago en Hotmart</button>' : '') +
        (v.status === 'teste' ? '<a class="btn" style="margin-top:14px" href="/oito/' + OITO.marca + '/teste.html?c=' + c + '">Ver mi prueba y suscribirme</a>' : '') + '</div>' + anteriores([])
      var vf = document.getElementById('ver-fatura'); if (vf) vf.onclick = abreFatura
      var ant0 = document.getElementById('lista-ant'); if (ant0) OITO_POSTS(ant0, v.posts, {})
      postar([])
      return
    }
    var doMes = v.posts.filter(function (p) { return p.lote_id === atual.id || (v.lotes.some(function (l) { return l.id === p.lote_id && l.tipo === 'ajuste' && l.criado_em >= atual.criado_em })) })
    doMes.sort(function (a, b) { return (a.data_sugerida || '') > (b.data_sugerida || '') ? 1 : -1 })
    var fazendo = atual.status !== 'pronto'
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 0 18px">' +
      '<p class="suave">' + (fazendo ? '<b>Estamos haciendo tus posts:</b> ' + doMes.length + ' de ' + atual.qtd + ' listos. Esta página se actualiza sola.' : doMes.length + ' posts, 2 por semana. Ajustes que todavía puedes pedir este mes: <b>' + v.ajustes_restantes + '</b>.') + '</p>' +
      (doMes.length && !fazendo ? '<span style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn peq fantasma" href="/oito/' + OITO.marca + '/guia.html">Cómo publicar y consejos</a><button class="btn peq escuro" id="zip">Descargar todos (.zip)</button></span>' : '') + '</div><div class="posts" id="lista-posts"></div>' + anteriores(doMes)
    OITO_POSTS(document.getElementById('lista-posts'), doMes, { c: c, ajuste: v.status === 'ativo' && v.ajustes_restantes > 0, ig: !!(v.instagram && v.instagram.ligado && v.status === 'ativo'), depois: function () { carrega() } })
    postar(doMes)
    var z = document.getElementById('zip'); if (z) z.onclick = function () { baixaTodos(doMes, z) }
    var ant = document.getElementById('lista-ant'); if (ant) OITO_POSTS(ant, v.posts.filter(function (p) { return doMes.indexOf(p) < 0 }), {})
  }
  function anteriores(doMes) {
    var resto = v.posts.filter(function (p) { return doMes.indexOf(p) < 0 })
    return resto.length ? '<details style="margin-top:30px"><summary class="btn fantasma peq">Posts anteriores (' + resto.length + ')</summary><div class="posts" id="lista-ant" style="margin-top:16px"></div></details>' : ''
  }
  function baixaTodos(lista, b) {
    b.disabled = true; b.textContent = 'Preparando…'
    var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    s.onload = function () {
      var zip = new JSZip(), leg = ''
      Promise.all(lista.map(function (p, i) {
        leg += '#' + (i + 1) + ' · publicar el ' + (p.data_sugerida || '') + '\n' + (p.legenda || '') + '\n\n----------\n\n'
        return fetch(p.url).then(function (r) { return r.blob() }).then(function (bl) { zip.file(String(i + 1).padStart(2, '0') + '-' + (p.data_sugerida || 'post') + '.jpg', bl) })
      })).then(function () { zip.file('textos.txt', leg); return zip.generateAsync({ type: 'blob' }) }).then(function (bl) {
        var u = URL.createObjectURL(bl), a = document.createElement('a'); a.href = u; a.download = 'posts-' + (v.negocio.nome || 'mes').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '-') + '.zip'; a.click(); setTimeout(function () { URL.revokeObjectURL(u) }, 5000)
      }).catch(function () { OITO.aviso('No se pudieron juntar. Descárgalos uno por uno.', 'erro') }).then(function () { b.disabled = false; b.textContent = 'Descargar todos (.zip)' })
    }
    document.head.appendChild(s)
  }

  function negocio() {
    var x = v.contexto || {}, campo = function (k, rot, ph, area) { return '<div class="campo"><label for="n-' + k + '">' + rot + '</label>' + (area ? '<textarea id="n-' + k + '" maxlength="600" placeholder="' + E(ph || '') + '">' + E(x[k] || '') + '</textarea>' : '<input id="n-' + k + '" maxlength="300" value="' + E(x[k] || '') + '" placeholder="' + E(ph || '') + '">') + '</div>' }
    var el = document.getElementById('aba-negocio')
    el.innerHTML = '<form class="caixa" id="f-neg"><p class="suave" style="margin-bottom:18px">Lo que cambies aquí aplica para los próximos posts.</p>' +
      campo('novidades', 'Novedades de este mes', 'Ej.: un servicio nuevo, un horario especial, una fecha importante', true) +
      campo('servicos', 'Servicios o productos', '', true) + campo('carro_chefe', 'Lo que más quieres vender') + campo('diferencial', 'Lo que te hace diferente', '', true) +
      campo('horario', 'Días y horario') + campo('tom', 'Tono de los textos') + campo('evitar', 'Lo que nunca debe aparecer') +
      '<div class="campo"><label>Imágenes</label><div class="chips"><label><input type="radio" name="fm" value="enviar"' + (v.fotos_modo === 'enviar' ? ' checked' : '') + '><span>Usar mis fotos</span></label><label><input type="radio" name="fm" value="ia"' + (v.fotos_modo !== 'enviar' ? ' checked' : '') + '><span>Crear con IA</span></label></div></div>' +
      '<button class="btn">Guardar</button></form>'
    document.getElementById('f-neg').onsubmit = function (e) {
      e.preventDefault(); var o = {}; ['novidades', 'servicos', 'carro_chefe', 'diferencial', 'horario', 'tom', 'evitar'].forEach(function (k) { o[k] = document.getElementById('n-' + k).value })
      var fm = (e.target.querySelector('input[name=fm]:checked') || {}).value
      OITO.api('cliente', { c: c, acao: 'contexto', contexto: o, fotos_modo: fm }).then(function () { OITO.aviso('Guardado. Aplica para los próximos posts.') }).catch(function (er) { OITO.aviso(er.message, 'erro') })
    }
  }

  function fotos() {
    var el = document.getElementById('aba-fotos')
    el.innerHTML = '<div class="caixa"><h3>Tus fotos</h3><p class="suave" style="margin:8px 0 16px">Ya enviaste <b id="n-fotos">' + v.fotos + '</b> de 20. Las fotos del trabajo, del lugar y del equipo hacen que los posts se vean más reales. Verticales quedan mejor.</p>' +
      '<label class="sobe" for="mais-fotos"><b>Subir fotos</b><br><span class="suave">JPG o PNG, hasta 10 a la vez</span></label><input id="mais-fotos" type="file" accept="image/*" multiple class="esconde"><p class="nota" id="fotos-st"></p></div>'
    document.getElementById('mais-fotos').onchange = function (e) {
      var lista = [].slice.call(e.target.files).slice(0, 10), st = document.getElementById('fotos-st'), feito = 0, p = Promise.resolve()
      lista.forEach(function (a) { p = p.then(function () { return OITO.comprime(a, 1600) }).then(function (d) { return OITO.api('foto', { c: c, dado: d }) }).then(function (j) { feito++; st.textContent = 'Enviadas ' + feito + ' de ' + lista.length; document.getElementById('n-fotos').textContent = j.total }).catch(function (er) { st.textContent = er.message }) })
      p.then(function () { if (feito) OITO.aviso('Fotos enviadas. Entran en los próximos posts.') })
    }
  }

  function assinatura() {
    var el = document.getElementById('aba-assinatura'), s = v.status
    el.innerHTML = '<div class="caixa" style="display:grid;gap:12px"><h3>Un solo plan · US$ 39/mes</h3><p class="suave">8 posts al mes, hasta 4 ajustes, sin permanencia.</p>' +
      '<p>Estado: <b>' + (STATUS[s] || ['', s])[1] + '</b>' + (v.pago_ate ? ' · pagado hasta ' + OITO.dataBR(v.pago_ate) : '') + '</p>' +
      (s === 'aguardando_pagamento' || s === 'atrasado' ? '<button class="btn" id="fatura">' + (s === 'atrasado' ? 'Ponerme al día en Hotmart' : 'Completar el pago en Hotmart') + '</button>' : '') +
      (s === 'teste' ? '<a class="btn" href="/oito/' + OITO.marca + '/teste.html?c=' + c + '">Suscribirme</a>' : '') +
      (s === 'ativo' || s === 'atrasado' || s === 'aguardando_pagamento' ? '<details><summary class="suave" style="cursor:pointer;font-weight:700">Gestionar o cancelar mi suscripción</summary><div style="display:grid;gap:12px;margin-top:12px">' +
        '<p class="suave">El cobro lo hace <b>Hotmart</b>, en tu moneda local, cada mes. El recibo te llega al correo desde Hotmart. Para cambiar la tarjeta o ver tus pagos, entra a tu cuenta de Hotmart con el mismo correo de la compra.</p>' +
        '<p class="suave">Para cancelar no tienes que entrar a Hotmart: lo haces aquí. Nosotros cancelamos el cobro, no se te cobra nada más y lo que ya pagaste vale hasta el final del período.</p>' +
        '<textarea id="motivo" placeholder="Si puedes, cuéntanos el motivo (nos ayuda a mejorar)"></textarea><button class="btn fantasma" id="cancela">Cancelar mi suscripción</button></div></details>' : '') +
      (s === 'cancelado' ? '<p class="suave">¿Quieres volver? Escríbenos desde la pestaña Ayuda.</p>' : '') + '</div>'
    var f = document.getElementById('fatura'); if (f) f.onclick = abreFatura
    var x = document.getElementById('cancela'); if (x) x.onclick = function () {
      if (!confirm('¿Cancelar la suscripción? No se cobra nada más, y lo que ya pagaste vale hasta el final del período.')) return
      x.disabled = true
      OITO.api('cliente', { c: c, acao: 'cancelar', motivo: document.getElementById('motivo').value }).then(function () { OITO.aviso('Suscripción cancelada.'); carrega() }).catch(function (er) { x.disabled = false; OITO.aviso(er.message, 'erro') })
    }
  }
  // abre el checkout de Hotmart en una pestaña nueva (abierta en el mismo clic para que no la bloqueen)
  function abreFatura() {
    var w = window.open('', '_blank')
    OITO.api('assinar', { c: c }).then(function (j) {
      if (j.ja) { if (w) w.close(); carrega(true); return }
      var u = j.url || j.fatura
      if (u) { if (w) w.location = u; else location.href = u } else { if (w) w.close(); OITO.aviso(j.simulado ? 'Pago simulado (prueba local).' : 'No hay ningún pago pendiente ahora.') }
    }).catch(function (er) { if (w) w.close(); OITO.aviso(er.message, 'erro') })
  }
  carrega(OITO.q.get('pago') === '1')
})()
