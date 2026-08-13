const CACHE_NAME = 'digitalbov-v6'

self.addEventListener('install', () => { self.skipWaiting() })

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

  let url
  try { url = new URL(request.url) } catch { return }
  if (url.origin !== self.location.origin) return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Só guarda resposta boa e não-parcial; cache.put rejeita 206/opaque
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, clone))
            .catch(() => {})
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        // SEM ISTO o handler devolve undefined e o navegador lança
        // "Failed to convert value to 'Response'"
        return cached || new Response('', {
          status: 504,
          statusText: 'Offline e sem cópia em cache'
        })
      })
  )
})
