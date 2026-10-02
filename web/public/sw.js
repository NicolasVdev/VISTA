const CACHE_NAME = "vista-shell-v4";
const APP_SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/fonts/figtree-latin-wght-normal.woff2", "/fonts/figtree-latin-ext-wght-normal.woff2", "/vendor/pdf-lib.min.js", "/vendor/jszip.min.js"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Cache the production bundles before activating, not only after a request.
    // This avoids an incomplete application shell on a first offline restart.
    const html = await (await cache.match("/")).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map((match) => match[1]);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("vista-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(async () => (await caches.match("/")) || caches.match("/offline.html")),
    );
    return;
  }

  event.respondWith(
    // The static shell has no personalized variants. Module/CSS requests may
    // carry Origin while install-time requests do not (Vary: Origin on dev CDN).
    caches.match(event.request, { ignoreVary: true }).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })),
  );
});
