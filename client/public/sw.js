const CACHE_NAME = 'walkie-talkie-shell-v1';
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install event: cache core shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(APP_SHELL_FILES).catch((err) => {
        console.warn('[SW] Cache prefetch notice:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-first with cache fallback for app shell assets.
// Strictly NEVER cache API requests, WebSocket endpoints, or WebRTC traffic!
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Exclude non-GET requests, API requests, WebSocket, and LiveKit RTC endpoints
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/ws') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    url.port === '7880' ||
    url.port === '7881' ||
    url.port === '7882'
  ) {
    return; // Pass through directly to network
  }

  // App shell caching strategy: Network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache valid static responses (CSS, JS, images, HTML)
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Offline: try serving from cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // If navigating to an HTML route while offline, serve cached root index.html
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
        return new Response('Network error (Offline)', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' }),
        });
      })
  );
});
