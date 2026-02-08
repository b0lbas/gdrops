const CACHE = "geodrops-cache-v3";
const CORE = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(CORE.map(u => new Request(u, {cache: "reload"}))); } catch {}
    self.skipWaiting();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const url = new URL(req.url);
    if (url.origin !== location.origin) return fetch(req);

    const cache = await caches.open(CACHE);

    // Always try network first for seed content
    if (url.pathname.startsWith("/seeds/")) {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cachedSeed = await cache.match(req);
        return cachedSeed || new Response("", { status: 504 });
      }
    }

    // SPA navigations: network-first for index
    if (req.mode === "navigate") {
      const cachedIndex = await cache.match("/index.html");
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cachedIndex || new Response("offline", {status: 200, headers: {"Content-Type":"text/plain"}});
      }
    }

    // Network-first for app assets to avoid stale cache
    if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cachedAsset = await cache.match(req);
        return cachedAsset || new Response("", {status: 504});
      }
    }

    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached || new Response("", {status: 504});
    }
  })());
});
