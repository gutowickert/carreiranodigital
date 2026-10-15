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
    if (v.status === 'ativo' && !OITO.ls.get('oito_comprou_' + c)) { OITO.ls.set('oito_comprou_' + c, '1'); OITO.fb('Purchase', { value: window.OITO_PRECO || 197, currency: 'BRL', content_name: OITO.marca }, 'compra-' + c) }
    if (!desenha.feito) { desenha.feito = true; OITO.rastro('area_visita', {}, c); OITO.salvaApp(document.getElementById('salva-app'), c); negocio(); fotos(); OITO.chat(document.getElementById('chat'), { c: c }) }
    posts(); assinatura()
    // enquanto algo está sendo feito (ou o pagamento não confirmou), atualiza sozinho
    var andando = v.lotes.some(function (l) { return ['fila', 'gerando', 'espera'].indexOf(l.status) >= 0 }) || v.posts.some(function (p) { return p.status === 'ajuste_pedido' })
    clearTimeout(vigia); if (andando || v.status === 'aguardando_pagamento') vigia = setTimeout(function () { carrega(v.status === 'aguardando_pagamento') }, andando ? 6000 : 12000)
  }

  // "Postar por mim" (14/10): o cartão fica num canto próprio da aba, fora do redesenho dos posts (não apaga o que está sendo digitado)
  function corpoPosts() {
    var corpo = document.getElementById('posts-corpo')
    if (!corpo) { document.getElementById('aba-posts').innerHTML = '<div id="postar" style="margin-bottom:22px"></div><div id="posts-corpo"></div>'; corpo = document.getElementById('posts-corpo') }
    return corpo
  }
  var IGMSG = { ok: ['Instagram conectado. Os próximos posts vão sair sozinhos.'], erro: ['Não deu pra conectar o Instagram. Tenta de novo.', 'erro'], pessoal: ['Essa conta do Instagram é pessoal. Mude pra conta profissional e conecte de novo.', 'erro'], assinatura: ['Postar por mim é da assinatura.', 'erro'] }
  if (IGMSG[OITO.q.get('ig')]) { var igm = IGMSG[OITO.q.get('ig')]; setTimeout(function () { OITO.aviso(igm[0], igm[1]) }, 500); history.replaceState(null, '', location.pathname + '?c=' + c) }
  function quando(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + ' às ' + s.slice(11, 16) : '' }
  function postar(lista) {
    var el = document.getElementById('postar'), ig = v.instagram || {}, tit = '<h3 style="margin-bottom:6px">Postar por mim</h3>'
    if (document.activeElement && document.activeElement !== document.body && el.contains(document.activeElement)) return
    if (!ig.disponivel) { el.innerHTML = '<div class="caixa">' + tit + '<p class="suave">Em breve: os posts saem sozinhos no seu Instagram, no dia e na hora certos.</p></div>'; return }
    if (v.status !== 'ativo') { el.innerHTML = '<div class="caixa">' + tit + '<p class="suave"><b>Disponível na assinatura.</b> Você conecta o Instagram uma vez e os 8 posts do mês saem sozinhos, no dia sugerido. Dá pra mudar a hora ou pular qualquer um.</p></div>'; return }
    if (!ig.ligado) {
      el.innerHTML = '<div class="caixa">' + tit + '<p class="suave" style="margin-bottom:12px">Conecte seu Instagram uma vez e os posts do mês saem sozinhos, no dia sugerido, às ' + E(ig.hora_padrao) + ' (horário de Brasília). Dá pra mudar a hora ou pular qualquer post.</p>' +
        (ig.erro ? '<p style="margin-bottom:12px"><span class="pilula ruim">O Instagram desconectou. Conecte de novo.</span></p>' : '') +
        '<ul class="suave" style="padding-left:20px;display:grid;gap:5px;margin-bottom:16px;font-size:15px"><li>Precisa ser <b>conta profissional</b> (comercial ou criador de conteúdo). É grátis e leva 1 minuto: <a href="https://help.instagram.com/502981923235522" target="_blank" rel="noopener">veja como mudar</a>.</li><li>O login é feito no próprio Instagram: <b>a gente nunca vê a sua senha</b>.</li><li>Dá pra desconectar quando quiser, aqui mesmo.</li></ul>' +
        '<a class="btn" href="/api/oito/instagram/conectar?c=' + encodeURIComponent(c) + '">Conectar meu Instagram</a></div>'
      return
    }
    var fila = lista.filter(function (p) { return !p.publicado_em }), feitos = lista.filter(function (p) { return p.publicado_em }).length
    fila.sort(function (a, b) { return (a.publicar_em || a.data_sugerida || '9') > (b.publicar_em || b.data_sugerida || '9') ? 1 : -1 })
    var cmp = 'style="font-size:15px;padding:9px 10px;width:auto"'
    el.innerHTML = '<div class="caixa">' + tit + '<p class="suave" style="margin-bottom:14px"><span class="pilula ok">@' + E(ig.usuario || '') + ' conectado</span> Os posts saem sozinhos no horário marcado (horário de Brasília).' + (feitos ? ' Já publicados este mês: <b>' + feitos + '</b>.' : '') + '</p>' +
      (fila.length ? '<div style="display:grid;gap:10px">' + fila.map(function (p) {
        var lc = p.publicar_local || ((p.data_sugerida || '') + 'T' + ig.hora_padrao)
        var st = p.status === 'ajuste_pedido' ? 'Sendo refeito (mantém o horário)' : p.nao_publicar ? 'Não vai ser postado' : p.publicacao_erro ? 'Não publicou: ' + p.publicacao_erro + '. Salve um horário novo pra tentar de novo.' : p.publicar_em ? 'Agendado ' + quando(p.publicar_local) : 'Sem horário (a data sugerida já passou)'
        return '<div data-ig="' + E(p.id) + '" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--linha);padding-top:10px">' +
          (p.url ? '<img src="' + E(p.url) + '" alt="" style="width:46px;height:58px;object-fit:cover;border-radius:8px">' : '') +
          '<div style="flex:1;min-width:150px"><b style="font-size:15px">' + E(p.titulo || 'Post') + '</b><br><small class="suave">' + E(st) + '</small></div>' +
          '<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><input type="date" ' + cmp + ' value="' + E(lc.slice(0, 10)) + '"><input type="time" ' + cmp + ' value="' + E(lc.slice(11, 16)) + '"><button class="btn peq" data-ig-a="salvar">Salvar</button>' +
          '<label style="display:flex;gap:6px;align-items:center;font-size:14px;cursor:pointer"><input type="checkbox" data-ig-a="pular" style="width:auto"' + (p.nao_publicar ? ' checked' : '') + '> Não postar este</label></span></div>'
      }).join('') + '</div>' : '<p class="suave">Nenhum post esperando. Os do próximo mês entram aqui sozinhos.</p>') +
      '<button class="btn peq fantasma" style="margin-top:16px" data-ig-a="desligar">Desconectar o Instagram</button></div>'
    el.onclick = function (e) {
      var a = e.target.dataset.igA, linha = e.target.closest('[data-ig]')
      if (a === 'salvar') {
        var ins = linha.querySelectorAll('input'); e.target.disabled = true
        OITO.api('cliente', { c: c, acao: 'ig_agendar', post: linha.dataset.ig, quando: ins[0].value + 'T' + ins[1].value }).then(function () { OITO.aviso('Horário salvo.'); e.target.blur(); carrega() }).catch(function (er) { e.target.disabled = false; OITO.aviso(er.message, 'erro') })
      }
      if (a === 'desligar' && confirm('Desconectar o Instagram? Os posts param de sair sozinhos (continuam aqui pra baixar).'))
        OITO.api('cliente', { c: c, acao: 'ig_desligar' }).then(function () { OITO.aviso('Instagram desconectado.'); carrega() }).catch(function (er) { OITO.aviso(er.message, 'erro') })
    }
    el.onchange = function (e) {
      if (e.target.dataset.igA !== 'pular') return
      OITO.api('cliente', { c: c, acao: 'ig_pular', post: e.target.closest('[data-ig]').dataset.ig, valor: e.target.checked }).then(function () { OITO.aviso(e.target.checked ? 'Esse não vai ser postado.' : 'Esse volta pra agenda.'); e.target.blur(); carrega() }).catch(function (er) { OITO.aviso(er.message, 'erro') })
    }
  }

  function posts() {
    var el = corpoPosts(), meses = v.lotes.filter(function (l) { return l.tipo === 'mes' }), atual = meses[0]
    if (!atual) {
      el.innerHTML = '<div class="caixa"><h3>' + (v.status === 'aguardando_pagamento' ? 'Assim que o pagamento confirmar, seus 8 posts começam a ser feitos.' : 'Seus posts do mês aparecem aqui depois da assinatura.') + '</h3>' +
        (v.status === 'aguardando_pagamento' ? '<p class="suave" style="margin-top:8px">Pix confirma na hora; boleto leva até 3 dias úteis. Esta página atualiza sozinha.</p><button class="btn" style="margin-top:14px" id="ver-fatura">Pagar agora</button>' : '') + '</div>' + anteriores([])
      var vf = document.getElementById('ver-fatura'); if (vf) vf.onclick = abreFatura
      postar([])
      return
    }
    var doMes = v.posts.filter(function (p) { return p.lote_id === atual.id || (v.lotes.some(function (l) { return l.id === p.lote_id && l.tipo === 'ajuste' && l.criado_em >= atual.criado_em })) })
    doMes.sort(function (a, b) { return (a.data_sugerida || '') > (b.data_sugerida || '') ? 1 : -1 })
    var fazendo = atual.status !== 'pronto'
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 0 18px">' +
      '<p class="suave">' + (fazendo ? '<b>Seus posts estão sendo feitos:</b> ' + doMes.length + ' de ' + atual.qtd + ' prontos. Esta página atualiza sozinha.' : doMes.length + ' posts, 2 por semana. Ajustes que ainda pode pedir este mês: <b>' + v.ajustes_restantes + '</b>.') + '</p>' +
      (doMes.length && !fazendo ? '<span style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn peq fantasma" href="/oito/' + OITO.marca + '/guia.html">Como postar e dicas</a><button class="btn peq escuro" id="zip">Baixar todos (.zip)</button></span>' : '') + '</div><div class="posts" id="lista-posts"></div>' + anteriores(doMes)
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
    el.innerHTML = '<div class="caixa" style="display:grid;gap:12px"><h3>Plano único · R$ ' + (window.OITO_PRECO || 197) + '/mês</h3><p class="suave">8 posts por mês, ajustes por mensagem, sem fidelidade.</p>' +
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
