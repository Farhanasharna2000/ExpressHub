// ExpressHub courier service worker. Scope: /courier.
// Caches only the app shell and static assets. API responses (names, phones,
// addresses, proof images) are never cached; they always go to the network.
const VERSION = "courier-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const STATIC_ASSETS = ["/manifest.webmanifest", "/icons/courier-192.png", "/icons/courier-512.png"];

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · ExpressHub Courier</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f7f2;color:#17372f;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}button{min-height:44px;padding:0 20px;border-radius:8px;border:0;background:#196547;color:#fff;font-size:16px}</style></head>
<body><main><h1>You're offline</h1><p>Open this page again once you have a connection. Deliveries you already confirmed stay saved on this phone.</p><button onclick="location.reload()">Try again</button></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC_CACHE)).put(request, response.clone());
  return response;
}

// Network first so couriers always get the current app; the cached shell is the offline fallback.
async function courierPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) (await caches.open(PAGE_CACHE)).put(request, response.clone());
    return response;
  } catch {
    const cache = await caches.open(PAGE_CACHE);
    return (await cache.match(request)) || (await cache.match("/courier")) || new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate" && url.pathname.startsWith("/courier")) {
    event.respondWith(courierPage(request));
  }
});
