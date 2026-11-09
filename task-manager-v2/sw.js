// 오프라인 캐시 (V7 PWA)
// - 이 앱 경로(scope) 안의 파일만 다룬다. Google 로그인·Drive API 요청은 건드리지 않는다.
// - 네트워크 먼저: 배포하면 다음 실행부터 바로 새 버전. 3초 안에 응답이 없거나 오프라인이면 캐시로 연다.
// - 캐시 이름은 같은 도메인의 다른 앱과 겹치지 않게 'tm2-'로 시작한다.
// - 파일을 추가·삭제하면 FILES를 고치고, 배포할 때마다 VERSION 숫자를 올린다.
const VERSION = 'tm2-11';
const FILES = [
  './', './index.html', './style.css', './manifest.webmanifest', './js/pwa.js', './js/config.js', './js/bio.js',
  './js/dialogs.js', './js/logs.js', './js/main.js', './js/md.js', './js/ms.js', './js/render.js',
  './js/state.js', './js/store.js', './js/sync.js', './js/today.js', './js/util.js',
  './js/vault.js', './js/vaultui.js', './js/vcrypto.js', './js/views.js', './icons/icon.svg',
  './icons/icon-32.png', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
const WAIT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('tm2-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(req) {
  return fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
    }
    return res;
  });
}

async function fromCache(req) {
  return (await caches.match(req, { ignoreSearch: true }))
    || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  const net = fromNetwork(req);
  e.waitUntil(net.catch(() => {}));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(async () => { const c = await fromCache(req); if (c) finish(c); }, WAIT_MS);
    net.then(res => { clearTimeout(timer); finish(res); },
      async () => { clearTimeout(timer); finish((await fromCache(req)) || Response.error()); });
  }));
});
