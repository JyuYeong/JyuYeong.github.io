// 서비스 워커 등록 (설치형 앱·오프라인 열기)
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('서비스 워커 등록 실패', err));
  });
}
