import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("academy manifest is isolated from the student PWA", async () => {
  const manifest = JSON.parse(await read("public/academy-manifest.webmanifest"));
  assert.equal(manifest.id, "/academy/");
  assert.equal(manifest.start_url, "/academy/");
  assert.equal(manifest.scope, "/academy/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
  assert.match(manifest.name, /للمعلمين/);
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
});

test("academy route advertises its own manifest and controls", async () => {
  const route = await read("src/routes/academy.tsx");
  const app = await read("apps/teacher-academy/src/App.tsx");
  assert.match(route, /academy-manifest\.webmanifest/);
  assert.match(app, /AcademyPwaControls/);
  assert.doesNotMatch(route, /\/manifest\.webmanifest/);
});

test("academy worker is narrow and never caches API or account responses", async () => {
  const worker = await read("public/academy-sw.js");
  assert.match(worker, /tamkeen-academy-/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.destination/);
  const navigationHandler = worker.slice(worker.indexOf('if (request.mode === "navigate"'));
  assert.doesNotMatch(navigationHandler, /cache\.put/);
  assert.doesNotMatch(worker, /\/api\//);
  assert.doesNotMatch(worker, /supabase/i);
});

test("academy registers its worker only for the academy scope", async () => {
  const client = await read("apps/teacher-academy/src/pwa/academy-pwa.ts");
  assert.match(client, /register\("\/academy-sw\.js", \{ scope: "\/academy\/" \}\)/);
  assert.match(client, /window\.isSecureContext/);
  assert.match(client, /SKIP_WAITING/);
});
