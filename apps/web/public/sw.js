const CACHE_NAME = 'deepsynaps-v2-dashboard';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls / SSE: network-only (never cache)
// - Hashed assets (/assets/*, *.js, *.css, fonts): cache-first
// - HTML and everything else: network-first with offline fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls or SSE streams
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/notifications/stream')) {
    return; // Let the browser handle normally
  }

  // Cache-first for hashed assets (content-hashed filenames never change)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|otf)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML navigation and everything else
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match('/'))
      )
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(syncQueue());
  }
});

async function syncQueue() {
  // The actual sync happens in the main page via window._syncOfflineQueue
  // SW just sends a message to all clients
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'SYNC_OFFLINE_QUEUE' }));
}
