import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeTarget,
  percentile,
  summarize,
} from "../../scripts/load-test/tamkeen-capacity.mjs";

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
