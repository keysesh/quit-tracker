// Clear — offline service worker.
// App shell + static assets are cached so the app opens with no connection.
// User data lives in localStorage, so it's already fully offline.

const CACHE = 'clear-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('/', net.clone());
          return net;
        } catch {
          return (await caches.match('/')) || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetching = fetch(req)
        .then((net) => {
          if (net && net.status === 200) {
            caches.open(CACHE).then((c) => c.put(req, net.clone()));
          }
          return net;
        })
        .catch(() => null);
      return cached || (await fetching) || Response.error();
    })()
  );
});
