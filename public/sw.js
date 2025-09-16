const CACHE = 'exampro-cache-v1'
const ASSETS = [
  '/',
  '/index.html',
]
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  )
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const resClone = res.clone()
      caches.open(CACHE).then((cache) => cache.put(req, resClone)).catch(() => {})
      return res
    }).catch(() => cached))
  )
})
