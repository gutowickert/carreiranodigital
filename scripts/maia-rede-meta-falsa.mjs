// Maia: uma META DE MENTIRA pro teste do login do Instagram (16/11, scripts/maia-teste-conectar-social.mjs).
// Carregar no servidor de teste com NODE_OPTIONS=--import=./scripts/maia-rede-meta-falsa.mjs. Responde só o que o login usa
// (troca do code, alongar a chave, /me/accounts); o que vai pro próprio computador passa; o resto da internet é recusado.
//   code "um"     → 1 página com Instagram        code "varias" → 2 páginas (uma sem Instagram)
//   code "nada"   → nenhuma página                code "ruim"   → a Meta recusa o code
const original = globalThis.fetch
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const r = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } })
const PAGINAS = {
  um: [{ id: '111111111111', name: 'Lotérica do Teste', access_token: 'CHAVE-PAGINA-UM-0123456789', instagram_business_account: { id: '178400000000001', username: 'loterica.teste' } }],
  varias: [
    { id: '222222222222', name: 'Página Pessoal', access_token: 'CHAVE-PAGINA-PESSOAL-0123456789' },
    { id: '333333333333', name: 'Lotérica Centro', access_token: 'CHAVE-PAGINA-CENTRO-0123456789', instagram_business_account: { id: '178400000000003', username: 'loterica.centro' } },
  ],
  nada: [],
}
globalThis.fetch = async (entrada, opc) => {
  const u = new URL(typeof entrada === 'string' ? entrada : entrada.url || String(entrada))
  if (LOCAL.has(u.hostname)) return original(entrada, opc)
  if (u.hostname === 'graph.facebook.com') {
    const p = u.pathname.replace(/^\/v[\d.]+/, ''), q = u.searchParams
    if (p === '/oauth/access_token' && q.get('code')) return q.get('code') === 'ruim' ? r({ error: { message: 'code inválido' } }, 400) : r({ access_token: 'curta-' + q.get('code') })
    if (p === '/oauth/access_token' && q.get('grant_type') === 'fb_exchange_token') return r({ access_token: 'longa-' + String(q.get('fb_exchange_token')).replace('curta-', '') })
    if (p === '/me/accounts') { const k = String(q.get('access_token') || '').replace(/^(longa|curta)-/, ''); return r({ data: PAGINAS[k] || [] }) }
    return r({ error: { message: 'meta falsa: ' + p } }, 400)
  }
  return new Response('sem internet no teste', { status: 599 })
}
