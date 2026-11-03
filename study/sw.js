// Study Manager는 /study-manager/로 되돌렸다. 이 서비스 워커는 옛 캐시(st-)를 지우고 스스로 해제한다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('st-')).map(k => caches.delete(k))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll())
    .then(cs => cs.forEach(c => c.navigate && c.navigate('../study-manager/').catch(() => {}))));
});
