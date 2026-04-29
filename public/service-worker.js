/* ═══════════════════════════════════════════════
   ElectIQ — Service Worker
   Enables offline capabilities and asset caching
   ═══════════════════════════════════════════════ */

const CACHE_NAME = 'electiq-v2.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/reset.css',
  '/assets/css/variables.css',
  '/assets/css/layout.css',
  '/assets/css/chat.css',
  '/assets/css/timeline.css',
  '/assets/css/responsive.css',
  '/assets/data/election-knowledge.json',
];

/**
 * @description Installation event: populates the cache with static assets
 * @param {ExtendableEvent} event
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/**
 * @description Activation event: cleans up legacy caches
 * @param {ExtendableEvent} event
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/**
 * @description Fetch event: implements stale-while-revalidate for assets
 * @param {FetchEvent} event
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Network-first for API traffic
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase.io')
  ) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Stale-while-revalidate for local assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request).then((res) => {
          cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
