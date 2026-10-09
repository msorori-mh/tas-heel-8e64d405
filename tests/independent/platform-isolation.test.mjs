import assert from "node:assert/strict";
import test from "node:test";
import { guardedFetch } from "../../scripts/independent/fetch-guard.mjs";

test("independent server blocks former platform calls before sending credentials or images", async () => {
  let calls = 0;
  const fetcher = guardedFetch(async () => {
    calls++;
    return new Response("ok");
  });
  for (const host of [
    "ai.gateway.lovable.dev",
    "lovable.dev",
    "x.lovable.app",
    "x.lovableproject.com",
  ]) {
    await assert.rejects(
      fetcher(`https://${host}/`, { method: "POST", body: "TEST_ONLY" }),
      /PLATFORM_DEPENDENCY_BLOCKED/,
    );
  }
  assert.equal(calls, 0);
});

test("a redirect cannot bring a formerly allowed request back to the old platform", async () => {
  let calls = 0;
  const fetcher = guardedFetch(async () => {
    calls++;
    return new Response(null, {
      status: 307,
      headers: { location: "https://ai.gateway.lovable.dev/private" },
    });
  });
  await assert.rejects(
    fetcher("https://generativelanguage.googleapis.com/test", {
      method: "POST",
      body: "TEST_ONLY",
    }),
    /PLATFORM_DEPENDENCY_BLOCKED/,
  );
  assert.equal(calls, 1);
});
