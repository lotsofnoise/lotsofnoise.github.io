// ---------------------------------------------------------------------------
// Service worker: caches the app shell on install so the page (and the
// WebGL/JS pipeline that makes it work) keeps loading with zero network,
// once a user has visited it at least once. Camera/mic access itself always
// requires the OS permission grant, but no network is needed for that.
// ---------------------------------------------------------------------------

const CACHE_NAME = 'horizon-camera-v6e';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Bump CACHE_NAME (e.g. v2, v3...) whenever you deploy changes to index.html
// so returning users pick up the new version instead of a stale cached copy.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Cache-first strategy: serve instantly from cache, and in the background
// fetch a fresh copy to keep the cache warm for next time (stale-while-revalidate).
self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests for the app shell files.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse); // offline: fall back to cache

      return cachedResponse || networkFetch;
    })
  );
});
