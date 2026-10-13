// Oito Posts: a área do cliente (conta.html?c=): posts do mês, meu negócio, fotos, ajuda e assinatura.
(function () {
  var c = (OITO.q.get('c') || OITO.ls.get('oito_codigo_' + OITO.marca) || '').toUpperCase(), E = OITO.esc, v = null, aba = 'posts', vigia = null
  if (!c) { location.href = OITO.url(''); return }
  OITO.ls.set('oito_codigo_' + OITO.marca, c)
  var STATUS = { ativo: ['ok', 'Assinatura em dia'], aguardando_pagamento: ['alerta', 'Aguardando pagamento'], atrasado: ['ruim', 'Fatura em atraso'], cancelado: ['', 'Assinatura cancelada'], teste: ['', 'Teste grátis'] }

  ;[].forEach.call(document.querySelectorAll('[data-aba]'), function (b) {
    b.onclick = function () { aba = b.dataset.aba; [].forEach.call(document.querySelectorAll('[data-aba]'), function (x) { x.setAttribute('aria-selected', x === b) }); [].forEach.call(document.querySelectorAll('.aba'), function (x) { x.classList.toggle('esconde', x.id !== 'aba-' + aba) }) }
  })

  function carrega(pag) {
    return OITO.api('cliente?c=' + encodeURIComponent(c) + (pag ? '&pag=1' : '')).then(function (x) { v = x; desenha() }).catch(function (e) {
      document.getElementById('nome-neg').textContent = e.status === 404 ? 'Código não encontrado' : 'Não carregou. Atualiza a página.'
    })
  }

  function desenha() {
    document.getElementById('nome-neg').textContent = v.negocio.nome
    var s = STATUS[v.status] || ['', v.status]
    document.getElementById('situacao').innerHTML = '<span class="pilula ' + s[0] + '">' + s[1] + (v.pago_ate && v.status !== 'aguardando_pagamento' ? ' · até ' + OITO.dataBR(v.pago_ate) : '') + '</span>'
    if (v.status === 'ativo' && !OITO.ls.get('oito_comprou_' + c)) { OITO.ls.set('oito_comprou_' + c, '1'); OITO.fb('Purchase', { value: 197, currency: 'BRL', content_name: OITO.marca }, 'compra-' + c) }
    if (!desenha.feito) { desenha.feito = true; OITO.rastro('area_visita', {}, c); OITO.salvaApp(document.getElementById('salva-app'), c); negocio(); fotos(); OITO.chat(document.getElementById('chat'), { c: c }) }
    posts(); assinatura()
    // enquanto algo está sendo feito (ou o pagamento não confirmou), atualiza sozinho
    var andando = v.lotes.some(function (l) { return ['fila', 'gerando', 'espera'].indexOf(l.status) >= 0 }) || v.posts.some(function (p) { return p.status === 'ajuste_pedido' })
    clearTimeout(vigia); if (andando || v.status === 'aguardando_pagamento') vigia = setTimeout(function () { carrega(v.status === 'aguardando_pagamento') }, andando ? 6000 : 12000)
  }

  function posts() {
    var el = document.getElementById('aba-posts'), meses = v.lotes.filter(function (l) { return l.tipo === 'mes' }), atual = meses[0]
    if (!atual) {
      el.innerHTML = '<div class="caixa"><h3>' + (v.status === 'aguardando_pagamento' ? 'Assim que o pagamento confirmar, seus 8 posts começam a ser feitos.' : 'Seus posts do mês aparecem aqui depois da assinatura.') + '</h3>' +
        (v.status === 'aguardando_pagamento' ? '<p class="suave" style="margin-top:8px">Pix confirma na hora; boleto leva até 3 dias úteis. Esta página atualiza sozinha.</p><button class="btn" style="margin-top:14px" id="ver-fatura">Pagar agora</button>' : '') + '</div>' + anteriores([])
      var vf = document.getElementById('ver-fatura'); if (vf) vf.onclick = abreFatura
      return
    }
    var doMes = v.posts.filter(function (p) { return p.lote_id === atual.id || (v.lotes.some(function (l) { return l.id === p.lote_id && l.tipo === 'ajuste' && l.criado_em >= atual.criado_em })) })
    doMes.sort(function (a, b) { return (a.data_sugerida || '') > (b.data_sugerida || '') ? 1 : -1 })
    var fazendo = atual.status !== 'pronto'
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 0 18px">' +
      '<p class="suave">' + (fazendo ? '<b>Seus posts estão sendo feitos:</b> ' + doMes.length + ' de ' + atual.qtd + ' prontos. Esta página atualiza sozinha.' : doMes.length + ' posts, 2 por semana. Ajustes que ainda pode pedir este mês: <b>' + v.ajustes_restantes + '</b>.') + '</p>' +
      (doMes.length && !fazendo ? '<span style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn peq fantasma" href="/oito/' + OITO.marca + '/guia.html">Como postar e dicas</a><button class="btn peq escuro" id="zip">Baixar todos (.zip)</button></span>' : '') + '</div><div class="posts" id="lista-posts"></div>' + anteriores(doMes)
    OITO_POSTS(document.getElementById('lista-posts'), doMes, { c: c, ajuste: v.status === 'ativo' && v.ajustes_restantes > 0, depois: function () { carrega() } })
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
        leg += '#' + (i + 1) + ' · postar ' + (p.data_sugerida || '') + '\n' + (p.legenda || '') + '\n\n----------\n\n'
        return fetch(p.url).then(function (r) { return r.blob() }).then(function (bl) { zip.file(String(i + 1).padStart(2, '0') + '-' + (p.data_sugerida || 'post') + '.jpg', bl) })
      })).then(function () { zip.file('legendas.txt', leg); return zip.generateAsync({ type: 'blob' }) }).then(function (bl) {
        var u = URL.createObjectURL(bl), a = document.createElement('a'); a.href = u; a.download = 'posts-' + (v.negocio.nome || 'mes').toLowerCase().replace(/\W+/g, '-') + '.zip'; a.click(); setTimeout(function () { URL.revokeObjectURL(u) }, 5000)
      }).catch(function () { OITO.aviso('Não deu pra juntar. Baixa um por um.', 'erro') }).then(function () { b.disabled = false; b.textContent = 'Baixar todos (.zip)' })
    }
    document.head.appendChild(s)
  }

  function negocio() {
    var x = v.contexto || {}, campo = function (k, rot, ph, area) { return '<div class="campo"><label for="n-' + k + '">' + rot + '</label>' + (area ? '<textarea id="n-' + k + '" maxlength="600" placeholder="' + E(ph || '') + '">' + E(x[k] || '') + '</textarea>' : '<input id="n-' + k + '" maxlength="300" value="' + E(x[k] || '') + '" placeholder="' + E(ph || '') + '">') + '</div>' }
    var el = document.getElementById('aba-negocio')
    el.innerHTML = '<form class="caixa" id="f-neg"><p class="suave" style="margin-bottom:18px">O que você muda aqui vale pros próximos posts.</p>' +
      campo('novidades', 'Novidades deste mês', 'Ex.: serviço novo, horário especial, data importante', true) +
      campo('servicos', 'Serviços ou produtos', '', true) + campo('carro_chefe', 'O que você mais quer vender') + campo('diferencial', 'Seu diferencial', '', true) +
      campo('horario', 'Dias e horário') + campo('tom', 'Tom das legendas') + campo('evitar', 'O que nunca deve aparecer') +
      '<div class="campo"><label>Imagens</label><div class="chips"><label><input type="radio" name="fm" value="enviar"' + (v.fotos_modo === 'enviar' ? ' checked' : '') + '><span>Usar minhas fotos</span></label><label><input type="radio" name="fm" value="ia"' + (v.fotos_modo !== 'enviar' ? ' checked' : '') + '><span>Gerar por IA</span></label></div></div>' +
      '<button class="btn">Salvar</button></form>'
    document.getElementById('f-neg').onsubmit = function (e) {
      e.preventDefault(); var o = {}; ['novidades', 'servicos', 'carro_chefe', 'diferencial', 'horario', 'tom', 'evitar'].forEach(function (k) { o[k] = document.getElementById('n-' + k).value })
      var fm = (e.target.querySelector('input[name=fm]:checked') || {}).value
      OITO.api('cliente', { c: c, acao: 'contexto', contexto: o, fotos_modo: fm }).then(function () { OITO.aviso('Salvo. Vale pros próximos posts.') }).catch(function (er) { OITO.aviso(er.message, 'erro') })
    }
  }

  function fotos() {
    var el = document.getElementById('aba-fotos')
    el.innerHTML = '<div class="caixa"><h3>Suas fotos</h3><p class="suave" style="margin:8px 0 16px">Você já enviou <b id="n-fotos">' + v.fotos + '</b> de 20. Fotos do trabalho, do ambiente e da equipe deixam os posts mais reais. Na vertical fica melhor.</p>' +
      '<label class="sobe" for="mais-fotos"><b>Enviar fotos</b><br><span class="suave">JPG ou PNG, até 10 de uma vez</span></label><input id="mais-fotos" type="file" accept="image/*" multiple class="esconde"><p class="nota" id="fotos-st"></p></div>'
    document.getElementById('mais-fotos').onchange = function (e) {
      var lista = [].slice.call(e.target.files).slice(0, 10), st = document.getElementById('fotos-st'), feito = 0, p = Promise.resolve()
      lista.forEach(function (a) { p = p.then(function () { return OITO.comprime(a, 1600) }).then(function (d) { return OITO.api('foto', { c: c, dado: d }) }).then(function (j) { feito++; st.textContent = 'Enviadas ' + feito + ' de ' + lista.length; document.getElementById('n-fotos').textContent = j.total }).catch(function (er) { st.textContent = er.message }) })
      p.then(function () { if (feito) OITO.aviso('Fotos enviadas. Elas entram nos próximos posts.') })
    }
  }

  function assinatura() {
    var el = document.getElementById('aba-assinatura'), s = v.status
    el.innerHTML = '<div class="caixa" style="display:grid;gap:12px"><h3>Plano único · R$ 197/mês</h3><p class="suave">8 posts por mês, até 4 ajustes, sem fidelidade.</p>' +
      '<p>Situação: <b>' + (STATUS[s] || ['', s])[1] + '</b>' + (v.pago_ate ? ' · pago até ' + OITO.dataBR(v.pago_ate) : '') + '</p>' +
      (s === 'aguardando_pagamento' || s === 'atrasado' ? '<button class="btn" id="fatura">Pagar a fatura</button>' : '') +
      (s === 'teste' ? '<a class="btn" href="/oito/' + OITO.marca + '/teste.html?c=' + c + '">Assinar</a>' : '') +
      (s === 'ativo' || s === 'atrasado' || s === 'aguardando_pagamento' ? '<details><summary class="suave" style="cursor:pointer">Cancelar assinatura</summary><div style="display:grid;gap:10px;margin-top:12px"><textarea id="motivo" placeholder="Se puder, conta o motivo (ajuda a melhorar)"></textarea><button class="btn fantasma" id="cancela">Confirmar cancelamento</button></div></details>' : '') +
      (s === 'cancelado' ? '<p class="suave">Quer voltar? Fala com a gente pela aba Ajuda.</p>' : '') + '</div>'
    var f = document.getElementById('fatura'); if (f) f.onclick = abreFatura
    var x = document.getElementById('cancela'); if (x) x.onclick = function () {
      if (!confirm('Cancelar a assinatura? Não cobra mais nada, e o que já foi pago vale até o fim do período.')) return
      OITO.api('cliente', { c: c, acao: 'cancelar', motivo: document.getElementById('motivo').value }).then(function () { OITO.aviso('Assinatura cancelada.'); carrega() }).catch(function (er) { OITO.aviso(er.message, 'erro') })
    }
  }
  function abreFatura() {
    var w = window.open('about:blank', '_blank')
    OITO.api('assinar', { c: c }).then(function (j) { if (j.fatura) { if (w) w.location = j.fatura; else location.href = j.fatura } else { if (w) w.close(); OITO.aviso(j.simulado ? 'Fatura simulada (teste local).' : 'Nenhuma fatura em aberto agora.') } })
      .catch(function (er) { if (w) w.close(); OITO.aviso(er.message, 'erro') })
  }
  carrega(OITO.q.get('pago') === '1')
})()
