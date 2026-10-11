import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { validateStagingOrigin, TARGET_URL } from "../../scripts/independent/config.mjs";
import { guardedFetch } from "../../scripts/independent/fetch-guard.mjs";
import { prepareAndroid } from "../../scripts/independent/prepare-android.mjs";
test("staging origin excludes production, HTTP, database, credentials and paths", () => {
  for (const value of [
    undefined,
    "http://test.example",
    "https://studentamkeen.com",
    "https://www.studentamkeen.com",
    TARGET_URL,
    "https://a.lovable.app",
    "https://u:p@test.example",
    "https://test.example/path",
    "https://test.example/?x=1",
  ])
    assert.throws(() => validateStagingOrigin(value));
  assert.equal(
    validateStagingOrigin("https://tamkeen-test.example/"),
    "https://tamkeen-test.example",
  );
});
test("fetch guard rejects old project and strips credentials on cross-origin redirects", async () => {
  let called = 0;
  const fetcher = guardedFetch(async () => {
    called++;
    return new Response("{}");
  });
  await assert.rejects(fetcher("https://zbdhxyuulyovihjgeqbn.supabase.co/rest/v1/lessons"));
  assert.equal(called, 0);
  const requests = [];
  const redirect = guardedFetch(async (request) => {
    requests.push(request);
    return requests.length === 1
      ? new Response(null, { status: 302, headers: { location: "https://example.test/file" } })
      : new Response("ok");
  });
  await redirect(TARGET_URL + "/storage/v1/object/test", {
    headers: { apikey: "TEST_ONLY", Authorization: "Bearer TEST_ONLY" },
  });
  assert.equal(requests[1].headers.has("apikey"), false);
  assert.equal(requests[1].headers.has("authorization"), false);
});
test("Android staging patch isolates app, callbacks and offline fallback without changing source checkout", () => {
  const dir = mkdtempSync(resolve("tests/independent/.fixture-"));
  try {
    for (const file of [
      "capacitor.config.ts",
      "android/app/build.gradle",
      "android/app/src/main/AndroidManifest.xml",
      "android/app/src/main/res/values/strings.xml",
      "mobile/www/index.html",
    ])
      cpSync(file, resolve(dir, file), { recursive: true });
    const proof = prepareAndroid(dir, "https://tamkeen-test.example");
    assert.equal(proof.applicationId, "app.studentamkeen.tamkeen.staging");
    assert.match(
      readFileSync(resolve(dir, "android/app/build.gradle"), "utf8"),
      /namespace = "app.studentamkeen.tamkeen"/,
    );
    assert.match(
      readFileSync(resolve(dir, "android/app/build.gradle"), "utf8"),
      /applicationId "app.studentamkeen.tamkeen.staging"/,
    );
    assert.match(
      readFileSync(resolve(dir, "mobile/www/index.html"), "utf8"),
      /var ORIGIN = "https:\/\/tamkeen-test.example"/,
    );
    assert.throws(() => prepareAndroid(dir, "https://tamkeen-test.example"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.match(readFileSync("capacitor.config.ts", "utf8"), /appId: "app.studentamkeen.tamkeen"/);
});
