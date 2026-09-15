importScripts("/academy-shell/revision.js");
const VERSION = `v2-${self.ACADEMY_SHELL_REVISION}`,
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
  event.waitUntil(
    caches.open(SHELL).then(async (cache) => {
      await cache.addAll(FILES);
      const response = await fetch("/academy-shell/index.html", { cache: "reload" });
      if (!response.ok) throw new Error("ACADEMY_SHELL_UNAVAILABLE");
      const html = await response.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="(\/academy-shell\/[^"#]+)"/g)].map(
        (match) => match[1],
      );
      const assetResponse = await fetch("/academy-shell/assets.json", { cache: "reload" });
      if (!assetResponse.ok) throw new Error("ACADEMY_ASSETS_UNAVAILABLE");
      const chunks = await assetResponse.json();
      if (
        !Array.isArray(chunks) ||
        chunks.length > 100 ||
        chunks.some(
          (path) =>
            typeof path !== "string" ||
            !/^\/academy-shell\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(path),
        )
      )
        throw new Error("ACADEMY_ASSETS_INVALID");
      await cache.addAll([...new Set([...assets, ...chunks])]);
      await cache.put("/academy-shell/index.html", response);
    }),
  ),
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
  if (FILES.includes(url.pathname) || url.pathname.startsWith("/academy-shell/")) {
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
          (await caches.open(SHELL).then((cache) => cache.match("/academy-shell/index.html"))) ||
          Response.error(),
      ),
    );
  }
});
