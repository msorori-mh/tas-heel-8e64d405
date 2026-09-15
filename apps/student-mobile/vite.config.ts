import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  envDir: path.resolve(root, "../.."),
  plugins: [
    react(),
    {
      name: "student-shell-precache",
      generateBundle(_options, bundle) {
        const files = ["./", ...Object.keys(bundle).map((file) => "./" + file)];
        const revision = createHash("sha256")
          .update(JSON.stringify(files))
          .digest("hex")
          .slice(0, 16);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `
const CACHE = "tamkeen-student-shell-${revision}";
const FILES = ${JSON.stringify(files)};
const URLS = new Set(FILES.map((path) => new URL(path, self.registration.scope).href));
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("tamkeen-student-shell-") && key !== CACHE)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match("./index.html")).then((response) => response || fetch(event.request)));
  } else if (URLS.has(url.href)) {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match(event.request)).then((response) => response || fetch(event.request)));
  }
});
`,
        });
      },
    },
  ],
  // Shared auth config reads build-time public variables; no Node globals or
  // server environment are included in the installed client.
  define: { "process.env": "{}" },
  resolve: { alias: { "@": path.resolve(root, "../../src") } },
  build: { outDir: path.resolve(root, "../../dist-student-mobile"), emptyOutDir: true },
  server: { port: 4176, strictPort: true },
  preview: { port: 4176, strictPort: true },
});
