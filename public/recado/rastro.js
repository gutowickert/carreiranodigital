// Rastreador do Recado Encantado (10/10): cada passo do visitante vai pra /api/recado/evento, com a campanha de origem.
// Guarda um id anônimo no navegador e a primeira campanha (utm) que trouxe a pessoa. Sem dado pessoal.
(function () {
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch (e) { return null } }
  var vis = ls('recado_v'); if (!vis) { vis = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)); ls('recado_v', vis) }
  var q = new URLSearchParams(location.search), utm = {}
  // o navegador do dono não conta (11/10): abrir o painel marca sozinho; ?eu=1 marca, ?eu=0 desmarca. Sem rastreio e sem Pixel.
  if (q.get('eu') === '1') ls('recado_eu', '1')
  if (q.get('eu') === '0') try { localStorage.removeItem('recado_eu') } catch (e) {}
  if (ls('recado_eu') === '1') { window.recadoRastro = { visitante: vis, utm: {}, envia: function () {}, compra: function () {}, origem: function () { return { visitante: vis, dono: true } } }; return }
  ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k) })
  if (Object.keys(utm).length) ls('recado_utm', JSON.stringify(utm))   // a última campanha que trouxe a pessoa
  if (q.get('cupom')) ls('recado_cupom', q.get('cupom').toUpperCase())   // link com cupom: o formulário já vem preenchido
  try { utm = JSON.parse(ls('recado_utm') || '{}') } catch (e) { utm = {} }
  // produto da página: missao-chupeta -> grandao/chupeta, ?m=dormir -> guardiao/dormir, pedido ?p=fada -> fada/recado
  var M = { chupeta: 'grandao/chupeta', dormir: 'guardiao/dormir', coragem: 'coragem/coragem' }
  var p = location.pathname, m = (p.match(/missao-(\w+)/) || [])[1] || q.get('m'), produto = M[m] || null
  if (!produto && /pedido/.test(p)) produto = q.get('p') === 'fada' ? 'fada/recado' : 'noel/' + (q.get('pac') || 'magico')
  if (!produto && /natal|\/vo\.html/.test(p)) produto = 'noel/magico'
  if (!produto && /\/fada\.html/.test(p)) produto = 'fada/recado'   // a página principal virou a vitrine de todos (10/10): sem produto
  // Pixel da Meta (10/10): PageView em todas, ViewContent na página do produto, InitiateCheckout no envio do formulário,
  // AddPaymentInfo no "Pagar agora" e Purchase na página do pedido quando o pagamento confirma (recadoRastro.compra, 1 vez por pedido).
  var PIXEL = '1739805330556259', PRECO = { 'grandao/chupeta': 94.9, 'guardiao/dormir': 139.9, 'coragem/coragem': 64.9, 'fada/recado': 39.9, 'noel/encanto': 39.9, 'noel/magico': 64.9 }
  !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  fbq('init', PIXEL); fbq('track', 'PageView')
  var conteudo = function () { return produto ? { content_ids: [produto], content_type: 'product', value: PRECO[produto] || 0, currency: 'BRL' } : {} }
  if (produto && !/obrigado/.test(p)) fbq('track', 'ViewContent', conteudo())
  var PX = { form_envio: 'InitiateCheckout', pagar_clique: 'AddPaymentInfo' }
  function envia(evento, extra) {
    if (PX[evento]) try { fbq('track', PX[evento], conteudo()) } catch (e) {}
    var d = JSON.stringify(Object.assign({ evento: evento, visitante: vis, pagina: p + location.search.replace(/[?&](fbclid)=[^&]*/, ''), produto: produto, utm: utm, referrer: document.referrer || null }, extra || {}))
    try { if (navigator.sendBeacon) { navigator.sendBeacon('/api/recado/evento', new Blob([d], { type: 'text/plain' })); return } } catch (e) {}
    fetch('/api/recado/evento', { method: 'POST', body: d, keepalive: true }).catch(function () {})
  }
  // compra confirmada: dispara 1 vez por pedido (o código é o eventID, pra a Meta não contar duas vezes)
  function compra(codigo, valor, prod) {
    if (!codigo || ls('recado_px_' + codigo)) return; ls('recado_px_' + codigo, '1')
    try { fbq('track', 'Purchase', { content_ids: [prod || produto], content_type: 'product', value: +valor || 0, currency: 'BRL' }, { eventID: codigo }) } catch (e) {}
  }
  window.recadoRastro = { visitante: vis, utm: utm, envia: envia, compra: compra, origem: function () { return Object.assign({ visitante: vis }, utm) } }
  envia('visita')
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="pedido.html"],a[href*="missao.html"],a[href*="#pacotes"],a[href*="#comecar"]')
    if (a) envia('cta', { dados: { texto: (a.textContent || '').trim().slice(0, 60) } })
  }, true)
  var comecou = false
  document.addEventListener('input', function (e) { if (!comecou && e.target.closest && e.target.closest('form')) { comecou = true; envia('form_inicio') } }, true)
  document.addEventListener('submit', function () { envia('form_envio') }, true)
  // até onde a pessoa chegou (11/10): cada campo preenchido manda 1 vez o nome e quanto do formulário já está feito.
  // Conta só os campos que aparecem na tela (cada produto mostra os seus). form_erro: o campo que barrou o envio.
  var feito = function (el) { return (el.type === 'radio' || el.type === 'checkbox') ? el.checked : String(el.value || '').trim() !== '' }
  var campos = {}, erros = {}
  function progresso(f) {
    var n = {}
    ;[].forEach.call(f.elements, function (el) { if (!el.name || /hidden|submit|button/.test(el.type) || !el.getClientRects().length) return; n[el.name] = n[el.name] || feito(el) })
    var k = Object.keys(n), ok = k.filter(function (x) { return n[x] }).length
    return { feitos: ok, total: k.length, pct: k.length ? Math.round(ok * 100 / k.length) : 0 }
  }
  document.addEventListener('change', function (e) {
    var el = e.target, f = el.closest && el.closest('form')
    if (!f || !el.name || campos[el.name] || !feito(el)) return
    campos[el.name] = 1; var pr = progresso(f)
    envia('form_campo', { dados: { campo: el.name, ordem: Object.keys(campos).length, pct: pr.pct, feitos: pr.feitos, total: pr.total } })
  }, true)
  document.addEventListener('invalid', function (e) { var el = e.target; if (!el.name || erros[el.name]) return; erros[el.name] = 1; envia('form_erro', { dados: { campo: el.name } }) }, true)
})()
