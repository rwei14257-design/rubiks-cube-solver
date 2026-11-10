/* Service Worker — scoped network-first cache for reliable updates and offline use. */
const CACHE_NAME = 'rubiks-cube-solver-v5';
const ASSETS = [
  './',
  './index.html',
  './guide.html',
  './style.css',
  './app.js',
  './solver.js',
  './solver-worker.js',
  './scanner.js',
  './timer.js',
  './cube.js',
  './bigcube.js',
  './manifest.json',
  './vendor/three/three.module.js',
  './vendor/three/OrbitControls.js',
  './vendor/three/RoundedBoxGeometry.js',
  './vendor/cube-solver.js',
  './icon-192.png',
  './icon-512.png',
];

// Keep the previous worker usable until every essential asset has been cached.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Cache Storage is shared by all GitHub Pages projects on the same origin.
// Delete only this project's old caches, never caches belonging to other apps.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key === 'cube-helper-v3' ||
          (key.startsWith('rubiks-cube-solver-') && key !== CACHE_NAME))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Prefer current files while online; use last-good cached files offline.
// Limit interception to this app's path to avoid touching other GitHub Pages projects.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        event.waitUntil(cache.put(request, response.clone()).catch((err) => {
          console.warn('Offline cache write failed:', err);
        }));
      }
      return response;
    } catch (err) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const fallback = await cache.match(new URL('index.html', scope).href);
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
