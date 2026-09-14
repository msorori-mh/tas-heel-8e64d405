import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ENDPOINTS,
  assertSafeTarget,
  percentile,
  summarize,
  runScenario,
} from "../../scripts/load-test/tamkeen-capacity.mjs";

test("anonymous capacity traffic contains public catalog endpoints only", () => {
  assert.deepEqual(DEFAULT_ENDPOINTS, [
    "/rest/v1/grades?select=id,name&order=sort_order.asc&limit=20",
    "/rest/v1/subjects?select=id,name,grade_id&limit=100",
    "/rest/v1/units?select=id,title,subject_id&limit=100",
  ]);
  assert.equal(
    DEFAULT_ENDPOINTS.some((endpoint) => endpoint.includes("/lessons")),
    false,
  );
});

test("production targets are fail-closed", () => {
  assert.throws(() => assertSafeTarget("https://studentamkeen.com"), /Production/);
  assert.throws(() => assertSafeTarget("https://zbdhxyuulyovihjgeqbn.supabase.co"), /Production/);
});

test("only explicit HTTPS Supabase staging targets are accepted", () => {
  assert.equal(
    assertSafeTarget("https://qwfvlppsffcmmbjpznkw.supabase.co").hostname,
    "qwfvlppsffcmmbjpznkw.supabase.co",
  );
  assert.throws(() => assertSafeTarget("http://qwfvlppsffcmmbjpznkw.supabase.co"), /HTTPS/);
  assert.throws(() => assertSafeTarget("https://example.com"), /Supabase staging/);
});

test("percentiles and thresholds are deterministic", () => {
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40);
  const pass = summarize(
    [
      { ok: true, status: 200, latencyMs: 100 },
      { ok: true, status: 200, latencyMs: 200 },
    ],
    1000,
    { maxErrorRate: 0.01, maxP95Ms: 1200, maxP99Ms: 2500 },
  );
  assert.equal(pass.pass, true);
  assert.equal(pass.requestsPerSecond, 2);
});

test("an excessive error rate fails the gate", () => {
  const result = summarize(
    [
      { ok: true, status: 200, latencyMs: 100 },
      { ok: false, status: 500, latencyMs: 200 },
    ],
    1000,
    { maxErrorRate: 0.01, maxP95Ms: 1200, maxP99Ms: 2500 },
  );
  assert.equal(result.pass, false);
});


test("staging isolation rejects other projects, credentials, paths and overrides", () => {
  for (const url of [
    "https://another-project.supabase.co",
    "https://qwfvlppsffcmmbjpznkw.supabase.co.attacker.example",
    "https://user:password@qwfvlppsffcmmbjpznkw.supabase.co",
    "https://qwfvlppsffcmmbjpznkw.supabase.co:8443",
    "https://qwfvlppsffcmmbjpznkw.supabase.co/rest/v1",
    "https://qwfvlppsffcmmbjpznkw.supabase.co?target=production",
    "https://qwfvlppsffcmmbjpznkw.supabase.co#fragment",
  ]) assert.throws(() => assertSafeTarget(url), /approved Supabase staging/);
  assert.throws(() => assertSafeTarget("https://zbdhxyuulyovihjgeqbn.supabase.co", true), /Production/);
});


test("endpoint overrides cannot send traffic outside the catalog", async () => {
  for (const endpoint of ["https://studentamkeen.com", "//studentamkeen.com", "/rest/v1/lessons"]) {
    await assert.rejects(runScenario({
      baseUrl: "https://qwfvlppsffcmmbjpznkw.supabase.co",
      endpoints: [endpoint],
    }), /approved public catalog/);
  }
});

test("requests reject redirects and count network failures", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(url.origin, "https://qwfvlppsffcmmbjpznkw.supabase.co");
    assert.equal(options.redirect, "error");
    throw new TypeError("redirect rejected");
  });
  const result = await runScenario({
    baseUrl: "https://qwfvlppsffcmmbjpznkw.supabase.co",
    endpoints: DEFAULT_ENDPOINTS, apiKey: "test-placeholder",
    concurrency: 1, requests: 1, timeoutMs: 1000,
    thresholds: { maxErrorRate: 0.01, maxP95Ms: 1200, maxP99Ms: 2500 },
  });
  assert.equal(calls, 1);
  assert.equal(result.failures, 1);
  assert.equal(result.pass, false);
});
