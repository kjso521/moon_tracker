// 오프라인 지원: 온라인이면 항상 최신 파일(network-first), 끊기면 캐시로 동작해요.
// 출사 장소는 인터넷이 약한 경우가 많아서, 3초 안에 응답이 없으면 캐시를 먼저 써요.
// GitHub Pages는 max-age=600을 보내요. 브라우저 HTTP 캐시를 거치면 배포 후 최대 10분간 옛 파일이 보이므로,
// 설치할 때는 cache: 'reload'(항상 새로 받기), 평소에는 cache: 'no-cache'(서버에 변경 여부 확인)로 받아요.
const CACHE = 'moon-tracker-v10';
const SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const sameOrigin = new URL(request.url).origin === self.location.origin;
    // 페이지 이동(navigate) 요청은 옵션을 붙이면 오류가 나서, URL로 새 요청을 만들어요.
    const network = fetch(sameOrigin ? new Request(request.url, { cache: 'no-cache' }) : request).then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const first = await Promise.race([network, timeout]);
      if (first) return first;
      return (await cache.match(request, { ignoreSearch: true })) ?? await network;
    } catch {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw new Error('offline');
    }
  })());
});
