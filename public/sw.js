// public/sw.js - RealEditPDF Offline Service Worker
// Implements Stale-While-Revalidate caching for HTML, CSS, JS, WASM & CDN assets
// Enables authentic offline functionality for the Zero-Upload Privacy Shield.

const CACHE_NAME = 'realeditpdf-v1';

// Critical core assets to precache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) => {
          const isCrossDomain = url.startsWith('http') && !url.startsWith(self.location.origin);
          const req = new Request(url, { mode: isCrossDomain ? 'no-cors' : 'cors' });
          return cache.add(req).catch((err) => {
            console.warn('[SW] Precache item failed:', url, err);
          });
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only intercept GET requests
  if (request.method !== 'GET') return;

  // Only handle http and https requests
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) return;

  // Bypass XML sitemaps and robots.txt from Service Worker handling
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname.endsWith('.xml') || requestUrl.pathname === '/robots.txt') return;

  // Stale-While-Revalidate caching strategy
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);

      const networkFetch = fetch(request)
        .then((networkResponse) => {
          // Cache successful and opaque (CDN) responses
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            cache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async (error) => {
          // If offline and navigating to a page, attempt to serve cached root or fallback
          if (request.mode === 'navigate') {
            const fallback = (await cache.match(request)) || (await cache.match('/'));
            if (fallback) return fallback;
          }
          throw error;
        });

      // Stale-While-Revalidate: Return cached response immediately while fetching fresh in background
      if (cachedResponse) {
        event.waitUntil(networkFetch.catch(() => {}));
        return cachedResponse;
      }

      // If not cached, wait for network fetch with offline fallback
      try {
        return await networkFetch;
      } catch (err) {
        if (request.mode === 'navigate') {
          const fallback = await cache.match('/');
          if (fallback) return fallback;
        }
        return new Response('Offline: Resource currently unavailable in local cache.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })
  );
});
