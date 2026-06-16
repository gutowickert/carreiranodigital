// Service worker — recebe push e mostra notificação no celular/desktop.
self.addEventListener('push', function (event) {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = {} }
  const titulo = data.titulo || 'Carreira No Digital'
  const opcoes = {
    body: data.corpo || 'Nova mensagem',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.tag || 'wa-msg',
    renotify: true,
    data: { url: data.url || '/dashboard/whatsapp' },
  }
  event.waitUntil(self.registration.showNotification(titulo, opcoes))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard/whatsapp'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (wins) {
      for (const w of wins) { if ('focus' in w) { try { w.navigate(url) } catch (e) {} return w.focus() } }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
