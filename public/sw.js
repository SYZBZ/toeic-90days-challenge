const CACHE_NAME = "toeic90-static-v1";
const BASE = "/toeic-90days-challenge/";
const PRECACHE = [
  `${BASE}`,
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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return res;
      }).catch(() => caches.match(`${BASE}`));
    }),
  );
});
