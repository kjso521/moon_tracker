// 오프라인 지원: 온라인이면 항상 최신 파일(network-first), 끊기면 캐시로 동작해요.
// 출사 장소는 인터넷이 약한 경우가 많아서, 3초 안에 응답이 없으면 캐시를 먼저 써요.
const CACHE = 'moon-tracker-v3';
const SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
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
    const network = fetch(request).then((response) => {
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
