/* eslint-disable no-undef */
/**
 * Minimal PWA service worker — static shell only.
 * Does not cache Supabase/API/auth responses or sensitive dynamic data.
 */

const SHELL_CACHE = "tasheel-shell-v1";

const SHELL_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

const NAV_DENYLIST = [
  /^\/api\//,
  /^\/auth/,
  /^\/admin/,
  /^\/import-templates\//,
  /\/callback/,
  /^\/_server/,
  /^\/_build/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept cross-origin requests (Supabase, fonts, etc.).
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  if (NAV_DENYLIST.some((pattern) => pattern.test(path))) return;

  if (path.startsWith("/assets/")) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          return Response.error();
        }
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        const offline = await cache.match("/offline.html");
        return offline ?? Response.error();
      }),
    );
  }
});
