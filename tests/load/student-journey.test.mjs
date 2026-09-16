import test from "node:test";
import assert from "node:assert/strict";
import {
  Histogram,
  passes,
  passesJourneyCoverage,
  validateInput,
  STAGING,
} from "../../scripts/load-test/student-journey.mjs";
const cfg = { project: STAGING, run: "captest2026" };
function session(id = "test-user", patch = {}) {
  return {
    id,
    access_token:
      "x." +
      Buffer.from(
        JSON.stringify({
          sub: id,
          role: "authenticated",
          iss: `https://${STAGING}.supabase.co/auth/v1`,
          exp: Date.now() / 1000 + 7200,
          app_metadata: { test_only: true, capacity_run: cfg.run },
          ...patch,
        }),
      ).toString("base64url") +
      ".x",
  };
}
test("rejects production, reused users, expired sessions and non-test identities", () => {
  assert.throws(
    () => validateInput({ ...cfg, project: "zbdhxyuulyovihjgeqbn" }, [session()], 1, 60),
    /STAGING/,
  );
  assert.throws(() => validateInput(cfg, [session(), session()], 2, 60), /DUPLICATE/);
  assert.throws(() => validateInput(cfg, [session("u", { exp: 1 })], 1, 60), /EXPIRES/);
  assert.throws(() => validateInput(cfg, [session("u", { app_metadata: {} })], 1, 60), /TEST_ONLY/);
  assert.throws(() => validateInput(cfg, [session()], 500, 60), /DISTINCT/);
  assert.doesNotThrow(() => validateInput(cfg, [session()], 1, 60));
});
test("busy users cannot hide users that never completed a journey", () => {
  assert.equal(passesJourneyCoverage(Uint32Array.from([10, 10, 0])), false);
  assert.equal(passesJourneyCoverage(Uint32Array.from([1, 1, 1])), true);
  assert.equal(passesJourneyCoverage(new Uint32Array()), false);
});
test("histogram keeps bounded memory, counts semantic failures and gates tail latency", () => {
  const h = new Histogram();
  for (let i = 0; i < 100; i++) h.add(300, true, 100);
  assert.equal(h.report().p95Ms, 300);
  assert.equal(h.bytes, 10000);
  assert.equal(passes(h.report()), true);
  h.add(500, false, 10, "semantic_failure");
  assert.equal(passes(h.report()), false);
  const slow = new Histogram();
  for (let i = 0; i < 100; i++) slow.add(i < 90 ? 100 : 3000, true);
  assert.equal(passes(slow.report()), false);
  assert.equal(h.bins.length, 60002);
});
