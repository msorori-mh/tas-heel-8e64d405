/* eslint-disable no-undef */
/**
 * PWA service worker — static shell and hashed assets only.
 *
 * Hard rules:
 * - Never intercept cross-origin requests (Supabase, fonts, storage, etc.).
 * - Never cache non-GET requests or credentialed/private/no-store responses.
 * - Never cache sensitive routes (auth, admin, api, server, wallet,
 *   subscription, payments) or any dynamic account/progress/exam data.
 * - Exams and unit practice stay online-required: no cached HTML, no
 *   offline queue, no local persistence of questions/answers/submissions.
 * - Updates are user-driven: the worker waits until the client sends
 *   SKIP_WAITING (see src/lib/pwa/register-sw.ts), so an open session —
 *   including an in-progress exam — is never interrupted.
 */

const SW_VERSION = "v2";
const SHELL_CACHE = `tasheel-shell-${SW_VERSION}`;
const STATIC_CACHE = `tasheel-static-${SW_VERSION}`;
const ACTIVE_CACHES = [SHELL_CACHE, STATIC_CACHE];

const SHELL_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

/**
 * Routes that must always hit the network directly and never be cached.
 * Matched against the same-origin request path.
 */
const SENSITIVE_DENYLIST = [
  /^\/auth/,
  /^\/admin/,
  /^\/api\//,
  /^\/_server/,
  /^\/_build/,
  /^\/wallet/,
  /^\/subscription/,
  /^\/payments/,
  /^\/import-templates\//,
  /\/callback/,
];

function isSensitivePath(path) {
  return SENSITIVE_DENYLIST.some((pattern) => pattern.test(path));
}

/** Only cache basic same-origin responses that explicitly allow storing. */
function isCacheableResponse(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  const cacheControl = response.headers.get("Cache-Control") || "";
  if (/no-store|private/i.test(cacheControl)) return false;
  return true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  // No skipWaiting here: activation happens only after the client confirms
  // via the SKIP_WAITING message, so running sessions are never disrupted.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !ACTIVE_CACHES.includes(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept cross-origin requests (Supabase API/storage, fonts, ...).
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Sensitive and server routes: straight to network, never cached.
  if (isSensitivePath(path)) return;

  // Hashed build assets: network-first with cache fallback.
  if (path.startsWith("/assets/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (isCacheableResponse(response)) {
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

  // Static shell files (icons, manifest, favicon, offline page).
  if (SHELL_ASSETS.includes(path)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (isCacheableResponse(response)) {
          await cache.put(request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  // Navigations: network-first, static offline fallback.
  // The fallback is never served for sensitive/exam routes (denylisted
  // above), and no navigation HTML is ever cached.
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
