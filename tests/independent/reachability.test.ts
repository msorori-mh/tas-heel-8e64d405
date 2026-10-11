import test from "node:test";
import assert from "node:assert/strict";
import { createServiceReachability } from "../../src/lib/network/service-reachability.ts";
const target = "https://yjpirilbpqxtmnayruht.supabase.co";
const hang: typeof fetch = (_, init) =>
  new Promise((_, reject) =>
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }),
  );
function setup(t: test.TestContext, fetcher: typeof fetch, physicalOnline = () => true) {
  const calls: unknown[][] = [];
  const service = createServiceReachability({
    url: target,
    publicKey: "sb_publishable_TEST_ONLY",
    physicalOnline,
    probeMs: 25,
    authMs: 35,
    fetch: async (...args) => {
      calls.push(args);
      return fetcher(...args);
    },
  });
  t.after(() => service.stop());
  service.start();
  return { service, calls };
}
test("OS online plus unavailable upstream starts paused and bounds the probe", async (t) => {
  const { service, calls } = setup(t, hang);
  assert.equal(service.isOnline(), false);
  await assert.rejects(service.fetch(target + "/rest/v1/subjects"));
  assert.equal(calls.length, 1);
  await service.probe();
  assert.equal(service.isOnline(), false);
});
test("network loss bounds auth wait; subsequent local mode is immediate; recovery works", async (t) => {
  let broken = false;
  const { service } = setup(t, (u, i) =>
    broken ? hang(u, i) : Promise.resolve(new Response("{}")),
  );
  await service.probe();
  assert.equal(service.isOnline(), true);
  broken = true;
  const before = performance.now();
  await assert.rejects(service.fetch(target + "/auth/v1/user"));
  assert.ok(performance.now() - before < 300);
  assert.equal(service.isOnline(), false);
  const repeat = performance.now();
  await assert.rejects(service.fetch(target + "/auth/v1/user"));
  assert.ok(performance.now() - repeat < 50);
  broken = false;
  await service.probe();
  assert.equal(service.isOnline(), true);
});
test("401 and 403 remain server refusals, never offline permissions", async (t) => {
  let status = 401;
  const { service } = setup(t, (u) =>
    Promise.resolve(new Response("{}", { status: String(u).endsWith("/settings") ? 200 : status })),
  );
  await service.probe();
  assert.equal((await service.fetch(target + "/auth/v1/user")).status, 401);
  assert.equal(service.isOnline(), true);
  status = 403;
  assert.equal((await service.fetch(target + "/auth/v1/user")).status, 403);
  assert.equal(service.isOnline(), true);
});
test("caller abort does not announce an outage; headers survive", async (t) => {
  let captured: RequestInit | undefined;
  const { service } = setup(t, (u, i) => {
    captured = i;
    return String(u).endsWith("/settings") ? Promise.resolve(new Response("{}")) : hang(u, i);
  });
  await service.probe();
  const c = new AbortController();
  const promise = service.fetch(target + "/auth/v1/user", {
    signal: c.signal,
    headers: { Authorization: "Bearer TEST_ONLY" },
  });
  c.abort();
  await assert.rejects(promise);
  assert.equal(service.isOnline(), true);
  assert.deepEqual(captured?.headers, { Authorization: "Bearer TEST_ONLY" });
});
test("mutations, refreshes and unrelated origins are forwarded once without replay", async (t) => {
  const { service, calls } = setup(t, async () => new Response("{}"));
  await service.fetch(target + "/rest/v1/progress", { method: "POST", body: "{}" });
  await service.fetch(target + "/auth/v1/token", { method: "POST", body: "{}" });
  await service.fetch("https://example.test/file");
  assert.equal(calls.length, 4);
});
test("physical offline wins over an in-flight successful probe", async (t) => {
  let resolve!: (response: Response) => void;
  let connected = true;
  const { service } = setup(
    t,
    () => new Promise((r) => (resolve = r)),
    () => connected,
  );
  const pending = service.probe();
  connected = false;
  service.physicalChanged(false);
  resolve(new Response("{}"));
  await pending;
  assert.equal(service.isOnline(), false);
});
test("probe excludes user credentials and physical offline never starts one", async (t) => {
  const { service, calls } = setup(t, async () => new Response("{}"));
  await service.probe();
  const init = calls[0][1] as RequestInit;
  assert.deepEqual(init.headers, { apikey: "sb_publishable_TEST_ONLY" });
  assert.equal(init.credentials, "omit");
  const offline = setup(
    t,
    async () => {
      throw Error("must not fetch");
    },
    () => false,
  );
  await offline.service.probe();
  assert.equal(offline.calls.length, 0);
});
test("Supabase SDK preserves retryable classification for the bounded transport failure", async (t) => {
  const { createClient, isAuthRetryableFetchError } = await import("@supabase/supabase-js");
  let broken = false;
  const { service } = setup(t, (u, i) =>
    broken ? hang(u, i) : Promise.resolve(new Response("{}")),
  );
  await service.probe();
  broken = true;
  const sdk = createClient(target, "sb_publishable_TEST_ONLY", {
    global: { fetch: service.fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await sdk.auth.getUser("TEST_ONLY");
  assert.equal(isAuthRetryableFetchError(result.error), true);
  assert.equal(service.isOnline(), false);
});
