// Consultório (/psi): guarda só a "casca" do app (as telas e os arquivos do Next) pra abrir rápido
// e não ficar em branco sem internet. NUNCA guarda dado de paciente: as chamadas pro banco (Supabase,
// outro endereço) passam direto, sem cache.
const CAIXA = 'psi-casca-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('psi-') && k !== CAIXA).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // banco e outros: sem cache
  const casca = url.pathname === '/psi' || url.pathname.startsWith('/psi/') || url.pathname.startsWith('/_next/static/')
  if (!casca) return
  // rede primeiro (sempre a versão nova); sem internet, a última guardada
  e.respondWith(
    fetch(req).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(CAIXA).then(cx => cx.put(req, c)) }
      return r
    }).catch(() => caches.match(req).then(r => r || caches.match('/psi')))
  )
})
