// 오프라인 캐시: 파일을 바꿔 배포할 때마다 VERSION을 올린다.
const VERSION = 'swm-0.1.0';
const FILES = [
  './', './index.html', './style.css', './app.js', './write.js', './add.js', './digits.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('swm-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 네트워크 먼저, 안 되면 캐시 (배포하면 바로 새 버전이 보이게)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
