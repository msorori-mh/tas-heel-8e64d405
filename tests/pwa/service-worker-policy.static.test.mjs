// Static policy checks for the PWA service worker and web app manifest.
// Run from the repo root with:
//   node --test tests/pwa/
// No network, no service worker runtime — text-level policy assertions only.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(
  readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"),
);

test("sensitive routes are denylisted and never cached", () => {
  for (const route of [
    "/auth",
    "/admin",
    "/api/",
    "/_server",
    "/wallet",
    "/subscription",
    "/payments",
    "/exams",
  ]) {
    const expectedPattern = "/^" + route.replaceAll("/", "\\/");
    assert.ok(
      sw.includes(expectedPattern),
      `sw.js must denylist ${route} (missing ${expectedPattern})`,
    );
  }
});

test("non-GET and cross-origin requests are never intercepted", () => {
  assert.match(sw, /request\.method !== "GET"/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
});

test("credentialed/no-store/private responses are never cached", () => {
  assert.match(sw, /no-store\|private/i);
  assert.match(sw, /response\.type !== "basic"/);
});

test("no navigation HTML is cached and offline fallback exists", () => {
  assert.match(sw, /request\.mode === "navigate"/);
  assert.match(sw, /\/offline\.html/);
  const navigateBlock = sw.slice(sw.indexOf('request.mode === "navigate"'));
  assert.doesNotMatch(navigateBlock, /cache\.put/);
});

test("activation waits for explicit SKIP_WAITING (no auto session break)", () => {
  const installBlock = sw.slice(sw.indexOf('"install"'), sw.indexOf('"activate"'));
  assert.doesNotMatch(installBlock, /self\.skipWaiting\s*\(/);
  assert.match(sw, /SKIP_WAITING/);
});

test("exams and practice are not made offline-capable", () => {
  assert.doesNotMatch(sw, /indexedDB|localStorage/);
});

test("manifest is installable and brand-consistent", () => {
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#1E2A78");
  assert.equal(manifest.background_color, "#F8FAFC");
  assert.ok(manifest.start_url);
  for (const size of ["192x192", "512x512"]) {
    assert.ok(
      manifest.icons.some((icon) => icon.sizes === size && icon.purpose.includes("any")),
      `missing any ${size}`,
    );
  }
  assert.ok(
    manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose.includes("maskable")),
    "missing maskable 512x512",
  );
});
