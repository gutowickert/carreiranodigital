// Rastreador do Recado Encantado (10/10): cada passo do visitante vai pra /api/recado/evento, com a campanha de origem.
// Guarda um id anônimo no navegador e a primeira campanha (utm) que trouxe a pessoa. Sem dado pessoal.
(function () {
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch (e) { return null } }
  var vis = ls('recado_v'); if (!vis) { vis = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)); ls('recado_v', vis) }
  var q = new URLSearchParams(location.search), utm = {}
  ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k) })
  if (Object.keys(utm).length) ls('recado_utm', JSON.stringify(utm))   // a última campanha que trouxe a pessoa
  try { utm = JSON.parse(ls('recado_utm') || '{}') } catch (e) { utm = {} }
  // produto da página: missao-chupeta -> grandao/chupeta, ?m=dormir -> guardiao/dormir, pedido ?p=fada -> fada/recado
  var M = { chupeta: 'grandao/chupeta', dormir: 'guardiao/dormir', coragem: 'coragem/coragem' }
  var p = location.pathname, m = (p.match(/missao-(\w+)/) || [])[1] || q.get('m'), produto = M[m] || null
  if (!produto && /pedido/.test(p)) produto = q.get('p') === 'fada' ? 'fada/recado' : 'noel/' + (q.get('pac') || 'magico')
  if (!produto && (/\/recado\/?$/.test(p) || p === '/')) produto = 'noel/magico'
  function envia(evento, extra) {
    var d = JSON.stringify(Object.assign({ evento: evento, visitante: vis, pagina: p + location.search.replace(/[?&](fbclid)=[^&]*/, ''), produto: produto, utm: utm, referrer: document.referrer || null }, extra || {}))
    try { if (navigator.sendBeacon) { navigator.sendBeacon('/api/recado/evento', new Blob([d], { type: 'text/plain' })); return } } catch (e) {}
    fetch('/api/recado/evento', { method: 'POST', body: d, keepalive: true }).catch(function () {})
  }
  window.recadoRastro = { visitante: vis, utm: utm, envia: envia, origem: function () { return Object.assign({ visitante: vis }, utm) } }
  envia('visita')
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="pedido.html"],a[href*="missao.html"],a[href*="#pacotes"],a[href*="#comecar"]')
    if (a) envia('cta', { dados: { texto: (a.textContent || '').trim().slice(0, 60) } })
  }, true)
  var comecou = false
  document.addEventListener('input', function (e) { if (!comecou && e.target.closest && e.target.closest('form')) { comecou = true; envia('form_inicio') } }, true)
  document.addEventListener('submit', function () { envia('form_envio') }, true)
})()
