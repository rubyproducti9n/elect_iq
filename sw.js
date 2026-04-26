const STATIC_CACHE = 'electiq-static-v1';
const DATA_CACHE = 'electiq-data-v1';

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'assets/css/reset.css',
  'assets/css/variables.css',
  'assets/css/layout.css',
  'assets/css/chat.css',
  'assets/css/timeline.css',
  'assets/css/journey.css',
  'assets/css/glossary.css',
  'assets/css/ui.css',
  'assets/css/responsive.css',
  'assets/js/main.js',
  'assets/js/router.js',
  'assets/js/chat.js',
  'assets/js/gemini.js',
  'assets/js/timeline.js',
  'assets/js/journey.js',
  'assets/js/glossary.js',
  'assets/js/firebase.js',
  'assets/js/accessibility.js',
  'assets/js/sanitize.js',
  'assets/js/tts.js',
  'assets/js/ui.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DATA_CACHE).map(key => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for API calls (Gemini/Firebase)
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebaseio.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for election data
  if (url.pathname.includes('election-knowledge.json')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(cache => {
        return cache.match(event.request).then(response => {
          return response || fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
