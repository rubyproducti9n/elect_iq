/* ═══════════════════════════════════════════════
   ElectIQ — Service Worker (Offline-first PWA)
   ═══════════════════════════════════════════════ */

const CACHE_NAME = 'electiq-v1';
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

/* ── Install: pre-cache shell ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ── Activate: purge old caches ── */
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

/* ── Fetch: stale-while-revalidate for assets, network-first for API ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Do not cache non-GET requests (e.g., POST)
  if (request.method !== 'GET') return;

  // Network-first for API calls
  if (
    url.hostname.includes('generativelanguage.googleapis.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('texttospeech.googleapis.com')
  ) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Stale-while-revalidate for static assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cachedResponse) => {
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      })
    )
  );
});
