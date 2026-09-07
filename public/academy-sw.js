/* eslint-disable no-undef */
const VERSION = "v1";
const SHELL_CACHE = `tamkeen-academy-shell-${VERSION}`;
const STATIC_CACHE = `tamkeen-academy-static-${VERSION}`;
const ACTIVE_CACHES = [SHELL_CACHE, STATIC_CACHE];
const SHELL_ASSETS = [
  "/academy-offline.html",
  "/academy-manifest.webmanifest",
  "/academy-icon.svg",
  "/academy-icon-192.png",
  "/academy-icon-512.png",
  "/academy-apple-touch-icon.png",
];

function cacheable(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  return !/no-store|private/i.test(response.headers.get("Cache-Control") || "");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("tamkeen-academy-") && !ACTIVE_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const stored = await cache.match(request);
        if (stored) return stored;
        const response = await fetch(request);
        if (cacheable(response)) await cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/assets/") &&
    ["script", "style", "font"].includes(request.destination)
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (cacheable(response)) await cache.put(request, response.clone());
          return response;
        } catch {
          return (await cache.match(request)) || Response.error();
        }
      }),
    );
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/academy")) {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.open(SHELL_CACHE).then((cache) => cache.match("/academy-offline.html"))) ||
          Response.error(),
      ),
    );
  }
});
