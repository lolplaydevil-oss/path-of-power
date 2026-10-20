const CACHE = 'path-of-power-v1';
const FILES = ['/', '/index.html', '/app.js', '/avatars.js', '/style.css', '/manifest.json'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return; // API всегда идёт в сеть
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
