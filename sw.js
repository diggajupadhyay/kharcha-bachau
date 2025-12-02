const CACHE_NAME = 'kharcha-bachau-v1';
const ASSETS_CACHE = 'assets-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Assets to pre-cache immediately
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  'https://cdn-icons-png.flaticon.com/512/2382/2382461.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== ASSETS_CACHE && key !== DYNAMIC_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Firestore / API: Network Only (Never cache DB calls to ensure data freshness)
  if (url.href.includes('firestore.googleapis.com') || url.href.includes('googleapis.com')) {
    return;
  }

  // 2. Images & Fonts: Cache First (Fall back to Network)
  if (event.request.destination === 'image' || event.request.destination === 'font') {
    event.respondWith(
      caches.open(ASSETS_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 3. App Shell (HTML, JS, CSS): Stale-While-Revalidate
  // Serve cached content immediately for speed, then update cache from network in background
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => {
            // Offline fallback could go here
        });

      return cachedResponse || fetchPromise;
    })
  );
});