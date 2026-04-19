// Self-unregistering kill-switch service worker.
//
// Replaces the previous `deepsynaps-v2-dashboard` SW which cached the
// app shell aggressively. That cache repeatedly blocked clinicians /
// patients from seeing fresh Netlify deploys (3 incidents this week).
//
// On install + activate, this SW:
//   1. Deletes every cache (including the old `deepsynaps-v2-dashboard`)
//   2. Unregisters itself
//   3. Reloads every open client tab so they fetch the latest bundle
//      from the network
//
// `index.html` no longer registers a service worker. Once existing
// browsers have run this kill switch once, no SW is registered.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* ignore — best effort */ }
    try {
      await self.registration.unregister();
    } catch (_) { /* ignore */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => {
        // navigate() bypasses any in-flight SW intercept and forces a
        // fresh request from the network.
        if (typeof c.navigate === 'function') {
          c.navigate(c.url).catch(() => {});
        } else if (typeof c.postMessage === 'function') {
          c.postMessage({ type: 'SW_KILLED_RELOAD' });
        }
      });
    } catch (_) { /* ignore */ }
  })());
});

// Pass every fetch through to the network — no caching, no offline
// fallback. This SW exists only to evict the previous one.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
