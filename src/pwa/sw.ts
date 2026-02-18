const CACHE = "cutgym-cache-v1";
const ASSETS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event: any) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => (self as any).skipWaiting())
  );
});

self.addEventListener("activate", (event: any) => {
  event.waitUntil((self as any).clients.claim());
});

self.addEventListener("fetch", (event: any) => {
  const req = event.request;
  // Network-first for navigation; cache-first for others.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/"))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});