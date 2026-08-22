// Scoped to public card pages only (registered with { scope: '/c/' }) so it
// can't interfere with the app shell, auth, or API routes. Network-first:
// always try for a fresh card, but if the network fails (offline, or the
// signal drops after someone already opened this card once), fall back to
// the last successful response instead of a hard failure. This does not
// make an unvisited card work offline - there is nothing to fall back to
// until it has been opened at least once while online.

const CACHE_NAME = 'aftermeet-card-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/c/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Promise.reject(new Error('offline, nothing cached for this card yet')))),
  );
});
