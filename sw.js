/* Service Worker — 离线缓存（PWA） */
const CACHE_NAME = 'cube-helper-v3';
const ASSETS = [
  './',
  './index.html',
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

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 请求：缓存优先，失败回退网络
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // 仅缓存同源且成功的响应
        if (resp.ok && new URL(event.request.url).origin === self.location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
