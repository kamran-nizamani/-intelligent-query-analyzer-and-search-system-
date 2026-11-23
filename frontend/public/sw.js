const VERSION = "iqa-offline-v2";
const APP_CACHE = VERSION + "-app";
const RUNTIME_CACHE = VERSION + "-runtime";
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    const page = await fetch("/", { cache: "no-cache" });
    if (!page.ok) throw new Error("The app shell could not be cached.");
    await cache.put("/", page.clone());
    await cache.put("/manifest.webmanifest", await fetch("/manifest.webmanifest"));
    // Pre-cache the scripts and styles referenced by the first rendered page.
    const html = await page.text();
    const assets = new Set([
      ...Array.from(html.matchAll(/(?:src|href)="([^"]*\\/_next\\/static\\/[^"]+)"/g), (match) => match[1]),
    ]);
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.all([...assets].map(async (asset) => {
      try {
        const response = await fetch(new URL(asset, self.location.origin));
        if (response.ok) await runtime.put(asset, response);
      } catch { /* an individual optional asset can be fetched on the next online visit */ }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("iqa-offline-") && key !== APP_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(APP_CACHE)).put("/", response.clone());
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/"));
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/manifest.webmanifest" || /\\.(?:woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })());
  }
});
