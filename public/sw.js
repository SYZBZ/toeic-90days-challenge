const CACHE_NAME = "toeic90-static-v2";
const BASE = "/toeic-90days-challenge/";
const PRECACHE = [
  `${BASE}`,
  `${BASE}404.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icons/icon-192.svg`,
  `${BASE}icons/icon-512.svg`,
  `${BASE}data/vocabulary.json`,
  `${BASE}data/grammar.json`,
  `${BASE}data/questions-part5.json`,
  `${BASE}data/questions-part6.json`,
  `${BASE}data/questions-part7.json`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return caches.match(`${BASE}`);
    }
  })());
});
