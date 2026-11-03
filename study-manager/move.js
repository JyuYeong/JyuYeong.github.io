// 옛 주소(/study-manager/)의 서비스 워커와 캐시(sm-)를 정리하고 새 주소로 이동
(async () => {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations() || [];
    await Promise.all(regs.filter(r => r.scope.endsWith('/study-manager/')).map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('sm-')).map(k => caches.delete(k)));
  } catch {}
  location.replace('../study/');
})();
