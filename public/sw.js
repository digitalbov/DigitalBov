const CACHE_NAME = 'ventos-varzea-v5'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Só GET, mesma origem, e nunca a navegação (index.html) — o shell da
  // página sempre vem da rede, então um deploy novo nunca fica preso
  // servindo uma versão antiga por causa do fallback de cache. Só os
  // assets com hash no nome (imutáveis, gerados pelo build) usam o cache
  // como fallback de rede lenta/instável.
  if (request.method !== 'GET') return
  if (request.mode === 'navigate') return
  if (new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return response
      })
      .catch(() => caches.match(request))
  )
})
