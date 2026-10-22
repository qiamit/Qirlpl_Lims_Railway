/* QIRLPL LIMS service worker.
 *
 * Caches only the app shell and the build's own static files so the app can be
 * installed and opened offline. It never caches API, auth, storage or PDF
 * responses (those are cross-origin or non-GET), so lab data and session tokens
 * stay out of the cache. The build replaces __BUILD_ID__ so each deploy gets a
 * fresh cache and old ones are deleted.
 */
const BUILD_ID = '__BUILD_ID__'
const CACHE = `qirlpl-lims-${BUILD_ID}`
const SHELL = '/index.html'
const PRECACHE = [
  SHELL,
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('qirlpl-lims-') && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.svg'
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') return

  // Pages: always try the network so users get the latest deploy; fall back to
  // the cached shell (the SPA router then renders the route) or an offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(SHELL, copy))
          }
          return response
        })
        .catch(async () => (await caches.match(SHELL)) || (await caches.match('/offline.html')) || Response.error()),
    )
    return
  }

  // Hashed build files and icons never change for a given URL: cache first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok && response.type === 'basic') {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})
