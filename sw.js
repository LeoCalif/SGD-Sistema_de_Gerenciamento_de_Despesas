const CACHE_NAME = 'klif-despesas-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/state.js',
  './js/utils.js',
  './js/auth.js',
  './js/db.js',
  './js/render.js',
  './js/importexport.js',
  './assets/Klif Despesas.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

// Install event: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-first falling back to cache, with stale-while-revalidate for static assets
self.addEventListener('fetch', event => {
  // Exclude Supabase or external APIs from cache
  if (event.request.url.includes('supabase.co') || event.request.method !== 'GET') {
    return; // network-only
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch in background to update cache (stale-while-revalidate)
        fetch(event.request).then(networkResponse => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {/* ignore network failure */});
        
        return cachedResponse;
      }

      return fetch(event.request).then(response => {
        // Cache new static requests if appropriate
        if (response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
