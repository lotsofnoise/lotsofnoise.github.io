'use strict';

// Change this version whenever index.html, manifest.json, or an icon changes.
const CACHE_PREFIX = 'horizon-camera-';
const CACHE_NAME = CACHE_PREFIX + 'v7';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

const INDEX_URL = new URL('./index.html', self.registration.scope).href;

const APP_SHELL_URLS = new Set(
  APP_SHELL.map((path) => new URL(path, self.registration.scope).href)
);

function isCacheable(response) {
  return Boolean(
    response &&
    response.ok &&
    response.type === 'basic'
  );
}

// ---------------------------------------------------------------------------
// INSTALL
// Cache the complete app shell.
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Force fresh copies during installation rather than reusing the browser's
    // normal HTTP cache.
    const requests = APP_SHELL.map((path) =>
      new Request(
        new URL(path, self.registration.scope),
        { cache: 'reload' }
      )
    );

    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});

// ---------------------------------------------------------------------------
// ACTIVATE
// Delete only old Horizon Camera caches.
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(
          (key) =>
            key.startsWith(CACHE_PREFIX) &&
            key !== CACHE_NAME
        )
        .map((key) => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

// ---------------------------------------------------------------------------
// FETCH
// Network-first for HTML.
// Stale-while-revalidate for manifest and icons.
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Do not interfere with third-party or cross-origin requests.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first for page navigations.
  // This lets a newly deployed index.html appear immediately while retaining
  // the cached page as an offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);

        if (isCacheable(response)) {
          const cache = await caches.open(CACHE_NAME);

          await Promise.all([
            cache.put(request, response.clone()),
            cache.put(INDEX_URL, response.clone())
          ]);
        }

        return response;
      } catch (error) {
        return (
          await caches.match(request) ||
          await caches.match(INDEX_URL) ||
          new Response(
            'Horizon Camera is offline and has not finished caching yet.',
            {
              status: 503,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            }
          )
        );
      }
    })());

    return;
  }

  // Only cache known app-shell resources.
  if (!APP_SHELL_URLS.has(url.href)) {
    return;
  }

  // Refresh the cached resource in the background.
  const networkUpdate = fetch(request).then(async (response) => {
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  });

  // Keep the worker alive until the background update finishes.
  event.waitUntil(
    networkUpdate.then(
      () => undefined,
      () => undefined
    )
  );

  event.respondWith(
    caches
      .match(request)
      .then((cachedResponse) => cachedResponse || networkUpdate)
      .catch(() =>
        new Response(
          'Resource unavailable while offline.',
          {
            status: 503,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          }
        )
      )
  );
});
