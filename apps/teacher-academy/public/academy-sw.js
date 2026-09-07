/* eslint-disable no-undef */
const VERSION = "v1",
  SHELL = `tamkeen-academy-shell-${VERSION}`,
  STATIC = `tamkeen-academy-static-${VERSION}`;
const FILES = [
  "/academy-offline.html",
  "/academy-manifest.webmanifest",
  "/academy-icon.svg",
  "/academy-icon-192.png",
  "/academy-icon-512.png",
  "/academy-apple-touch-icon.png",
];
const cacheable = (response) =>
  response?.ok &&
  response.type === "basic" &&
  !/no-store|private/i.test(response.headers.get("Cache-Control") || "");
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(FILES))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("tamkeen-academy-") && ![SHELL, STATIC].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (FILES.includes(url.pathname)) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
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
      caches.open(STATIC).then(async (cache) => {
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
          (await caches.open(SHELL).then((cache) => cache.match("/academy-offline.html"))) ||
          Response.error(),
      ),
    );
  }
});
