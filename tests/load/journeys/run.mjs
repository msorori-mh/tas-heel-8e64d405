/** Actual application handlers + Supabase client + PostgREST/PG17.
 * Only the identity issuer and safe question projection are TEST_ONLY fixtures.
 * This is not a Google login, deployed-worker, WAN or final capacity guarantee.
 */
import assert from "node:assert/strict";
import { createServer, request as proxyRequest } from "node:http";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
import { Route as Manifest } from "../../../src/routes/api/offline-pack.manifest.$subjectId.ts";
import { Route as Artifact } from "../../../src/routes/api/offline-pack.artifact.$resourceId.ts";

assert.equal(process.env.UNIFIED_TEST_ONLY, "1");
const databaseUrl = new URL(process.env.UNIFIED_PG_URL);
assert.equal(databaseUrl.hostname, "127.0.0.1");
assert.equal(databaseUrl.pathname, "/tamkeen_journey_test");
const origin = "http://127.0.0.1:4388";
const restOrigin = "http://127.0.0.1:3001";
const secret = "TEST_ONLY_journey_hmac_key_never_use_in_production";
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.ok([origin, restOrigin].includes(url.origin), "External traffic is forbidden");
  return nativeFetch(input, { ...init, redirect: "error" });
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(role, sub, expires = Math.floor(Date.now() / 1000) + 3600) {
  const body =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({ role, sub, aud: "authenticated", exp: expires, iat: Math.floor(Date.now() / 1000) });
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}
const student = (i) => "90000000-0000-4000-8000-" + String(i).padStart(12, "0");
const anonKey = token("anon", undefined);
const serviceKey = token("service_role", undefined);
process.env.SUPABASE_URL = origin;
process.env.SUPABASE_PUBLISHABLE_KEY = anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
function claims(header) {
  try {
    const raw = (header ?? "").replace(/^*** "");
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const expected = createHmac("sha256", secret)
      .update(parts[0] + "." + parts[1])
      .digest();
    const signature = Buffer.from(parts[2], "base64url");
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const value = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (!value.sub || value.exp <= Date.now() / 1000) return null;
    return value;
  } catch {
    return null;
  }
}
const module = await import(process.env.UNIFIED_PG_MODULE);
const { Client } = module.default ?? module;
const db = new Client({ connectionString: databaseUrl.href });
await db.connect();
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
let peakRss = 0,
  peakBackends = 0,
  authCalls = 0,
  sampling = false;
const sampler = setInterval(async () => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  if (sampling) return;
  sampling = true;
  try {
    const result = await db.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE backend_type='client backend'",
    );
    peakBackends = Math.max(peakBackends, result.rows[0].n);
  } finally {
    sampling = false;
  }
}, 1000);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  if (url.pathname.startsWith("/auth/v1/")) {
    authCalls++;
    const identity = claims(req.headers.authorization);
    res.setHeader("content-type", "application/json");
    if (!identity) {
      res.writeHead(401);
      res.end(JSON.stringify({ message: "TEST_ONLY invalid identity" }));
      return;
    }
    res.end(
      JSON.stringify({
        id: identity.sub,
        aud: "authenticated",
        role: identity.role,
        email: "test-only@example.invalid",
        app_metadata: { provider: "test-only" },
        user_metadata: {},
        identities: [],
        created_at: "2026-01-01T00:00:00Z",
      }),
    );
    return;
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const upstream = proxyRequest(
      restOrigin + url.pathname.slice("/rest/v1".length) + url.search,
      { method: req.method, headers: { ...req.headers, host: "127.0.0.1:3001" } },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
    return;
  }
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      signal: controller.signal,
    });
    let response;
    if (url.pathname.startsWith("/api/offline-pack/manifest/")) {
      response = await Manifest.options.server.handlers.GET({
        request,
        params: { subjectId: decodeURIComponent(url.pathname.split("/").at(-1)) },
      });
    } else if (url.pathname.startsWith("/api/offline-pack/artifact/")) {
      response = await Artifact.options.server.handlers[req.method]({
        request,
        params: { resourceId: decodeURIComponent(url.pathname.split("/").at(-1)) },
      });
    } else {
      res.writeHead(404);
      res.end();
      return;
    }
    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(body);
  } catch (error) {
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "TEST_ONLY_HANDLER_FAILURE", message: String(error) }));
  }
});
await new Promise((resolve) => server.listen(4388, "127.0.0.1", resolve));
await mkdir("artifacts/journeys", { recursive: true });
const subjectId = "10000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const rpcPath = (name) => "/rest/v1/rpc/" + name;
const mutation = (key, progress = 40) => ({
  _idempotency_key: key,
  _kind: "lesson-progress",
  _entity_id: lessonId,
  _lesson_id: null,
  _occurred_at: "2026-01-01T00:00:00Z",
  _progress_percent: progress,
  _answer_text: null,
  _payload_sha256: "0".repeat(64),
});
let samples = [];
async function request(label, path, identityToken, payload, allowed = [200]) {
  const started = performance.now();
  let status = 0,
    bytes = 0,
    data;
  try {
    const response = await fetch(origin + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        apikey: anonKey,
        Authorization: "Bearer " + identityToken,
        ...(payload === undefined ? {} : { "content-type": "application/json" }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    status = response.status;
    const raw = await response.text();
    bytes = Buffer.byteLength(raw);
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    assert.ok(allowed.includes(status), label + " status=" + status + " " + raw.slice(0, 180));
    return data;
  } finally {
    samples.push({
      label,
      ms: performance.now() - started,
      status,
      bytes,
      ok: allowed.includes(status),
    });
  }
}
const p = (values, percentile) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * percentile) - 1]
    : null;
function summarize(rows) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row.label))].map((label) => {
      const group = rows.filter((row) => row.label === label),
        times = group.filter((row) => row.ok).map((row) => row.ms);
      return [
        label,
        {
          requests: group.length,
          failures: group.filter((row) => !row.ok).length,
          p50Ms: p(times, 0.5),
          p95Ms: p(times, 0.95),
          p99Ms: p(times, 0.99),
          bytes: group.reduce((n, row) => n + row.bytes, 0),
          statuses: Object.fromEntries(
            [...new Set(group.map((row) => row.status))].map((status) => [
              status,
              group.filter((row) => row.status === status).length,
            ]),
          ),
        },
      ];
    }),
  );
}
const report = {
  scope:
    "TEST_ONLY actual HTTP application handlers, Supabase JS, PostgREST 16.3 and PG17; synthetic identity issuer and safe-question SQL adapter; not Google, WAN or deployed worker capacity",
  sourceSha: process.env.UNIFIED_SOURCE_SHA,
  applicationSourceSha: "c587980518a91dfa47b367daa480b21ab0e3f241",
  fixture: JSON.parse(await readFile("artifacts/journeys/fixture.json", "utf8")),
  host: {
    cpuCount: os.cpus().length,
    totalMemory: os.totalmem(),
    databaseCpuLimit: 2,
    databaseMemoryBytes: 1073741824,
    postgrestPool: 12,
  },
  scenarios: [],
};
try {
  const good = token("authenticated", student(1));
  await request("anonymous", "/api/offline-pack/manifest/" + subjectId, "", undefined, [401]);
  await request(
    "bad-signature",
    "/api/offline-pack/manifest/" + subjectId,
    good.slice(0, -2) + "xx",
    undefined,
    [401],
  );
  await request(
    "expired",
    "/api/offline-pack/manifest/" + subjectId,
    token("authenticated", student(1), 1),
    undefined,
    [401],
  );
  await request(
    "other-track",
    "/api/offline-pack/manifest/" + subjectId,
    token("authenticated", "00000000-0000-4000-8000-000000000005"),
    undefined,
    [403],
  );
  await request(
    "answer-layer-denial",
    rpcPath("get_offline_assessment_answer_layer"),
    good,
    { _lesson_id: lessonId, _kind: "self-test", _revision_ids: [] },
    [401, 403, 404],
  );
  const pack = await request("manifest-smoke", "/api/offline-pack/manifest/" + subjectId, good);
  assert.ok(pack.manifest.artifacts.some((a) => a.resourceId.startsWith("official-book:")));
  assert.ok(pack.manifest.artifacts.some((a) => a.resourceId.startsWith("self-test:")));
  assert.ok(!JSON.stringify(pack).includes("correctOptionId"));
  const book = pack.manifest.artifacts.find((a) => a.resourceId.startsWith("official-book:"));
  const html = await request(
    "artifact-smoke",
    "/api/offline-pack/artifact/" + encodeURIComponent(book.resourceId),
    good,
  );
  assert.equal(createHash("sha256").update(html).digest("hex"), book.sha256);
  const quiz = await request(
    "assessment-smoke",
    "/api/offline-pack/artifact/" + encodeURIComponent("self-test:" + lessonId),
    good,
  );
  assert.equal(quiz.questions.length, 5);
  assert.equal(quiz.questions[0].correctOptionId, "B");
  const key = "TEST_ONLY_REPLAY_PREFLIGHT";
  await request("sync-first", rpcPath("apply_offline_learning_mutation"), good, mutation(key));
  const replay = await request(
    "sync-replay",
    rpcPath("apply_offline_learning_mutation"),
    good,
    mutation(key),
  );
  assert.equal(replay.replayed, true);
  const ledger = await db.query(
    "SELECT count(*)::int AS n FROM offline_learning_mutations WHERE idempotency_key=$1",
    [key],
  );
  assert.equal(ledger.rows[0].n, 1);
  report.preflight = {
    pass: true,
    accessAndReplay: summarize(samples),
    googleSignIn: "NOT_TESTED",
  };
  for (const concurrency of [25, 50, 100]) {
    samples = [];
    let completed = 0,
      failed = 0;
    const errors = [];
    const start = performance.now(),
      stop = start + 30000;
    await Promise.all(
      Array.from({ length: concurrency }, async (_, index) => {
        const identity = token("authenticated", student(index + 1));
        let cycle = 0;
        while (performance.now() < stop && cycle < 40) {
          cycle++;
          try {
            await request("subjects", "/rest/v1/subjects?select=id,name&limit=25", identity);
            await request(
              "lessons",
              "/rest/v1/lessons?select=id,title&subject_id=eq." + subjectId + "&limit=50",
              identity,
            );
            if (cycle === 1)
              await request(
                "first-book",
                "/rest/v1/lesson_book_contents?select=content&lesson_id=eq." + lessonId,
                identity,
              );
            await request("safe-questions", rpcPath("get_lesson_questions_with_images"), identity, {
              _lesson_id: lessonId,
              _kind: "self_test",
            });
            // One in ten learners starts a download once per phase; normal reading is cached.
            if (cycle === 1 && index % 10 === 0) {
              await request("manifest", "/api/offline-pack/manifest/" + subjectId, identity);
              await request(
                "book-download",
                "/api/offline-pack/artifact/" + encodeURIComponent("official-book:" + lessonId),
                identity,
              );
              await request(
                "quiz-download",
                "/api/offline-pack/artifact/" + encodeURIComponent("self-test:" + lessonId),
                identity,
              );
            }
            await request(
              "sync",
              rpcPath("apply_offline_learning_mutation"),
              identity,
              mutation("TEST_ONLY_" + concurrency + "_" + index + "_" + cycle + "_progress"),
            );
            completed++;
          } catch (error) {
            failed++;
            if (errors.length < 5) errors.push(String(error));
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }),
    );
    const elapsedMs = performance.now() - start;
    const result = {
      concurrentSyntheticStudents: concurrency,
      scheduledDurationMs: 30000,
      elapsedMs,
      completedCycles: completed,
      failedCycles: failed,
      failureRate: failed / (completed + failed),
      successfulCyclesPerSecond: completed / (elapsedMs / 1000),
      endpoints: summarize(samples),
      errorExamples: errors,
    };
    report.scenarios.push(result);
    console.log("JOURNEY_PHASE " + JSON.stringify(result));
  }
  // Burst against the actual bounded manifest handler; report 503 as overload, not success.
  samples = [];
  const burstStart = performance.now();
  await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      request(
        "manifest-burst",
        "/api/offline-pack/manifest/" + subjectId,
        token("authenticated", student(index + 1)),
        undefined,
        [200],
      ).catch(() => {}),
    ),
  );
  report.burst = {
    clients: 50,
    elapsedMs: performance.now() - burstStart,
    endpoints: summarize(samples),
  };
  const recovery = await request("recovery", "/api/offline-pack/manifest/" + subjectId, good);
  assert.ok(recovery.manifest);
  report.recovery = true;
} catch (error) {
  report.functionalFailure = String(error);
  process.exitCode = 1;
} finally {
  clearInterval(sampler);
  eventLoop.disable();
  report.resources = {
    peakProcessRssBytes: Math.max(peakRss, process.memoryUsage().rss),
    peakDatabaseClientBackends: peakBackends,
    eventLoopP95Ms: eventLoop.percentile(95) / 1e6,
    authFixtureCalls: authCalls,
  };
  report.limits = [
    "30 seconds per concurrency step is an initial sustained component exercise, not a production soak test",
    "50k fixture profiles are not 50k simultaneous clients",
    "App server and load generator share the CI runner",
    "Online high-stakes exam submission, Google token renewal and real-device cold start are not covered",
    "First-file bytes do not include Internet protocol overhead",
  ];
  await writeFile("artifacts/journeys/results.json", JSON.stringify(report, null, 2));
  console.log("JOURNEY_RESULT " + JSON.stringify(report));
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await db.end();
}
