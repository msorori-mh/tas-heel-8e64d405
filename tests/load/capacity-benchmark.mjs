import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";

const student = "00000000-0000-4000-8000-000000000001";
const percentile = (xs, p) =>
  [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * p) - 1)];

/** Isolated PG17 component benchmark, not a production or end-to-end capacity claim. */
export async function benchmarkCapacity(db, phase) {
  const url = new URL(process.env.CAPACITY_PG_URL);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/tamkeen_capacity_test");
  const module = await import(process.env.CAPACITY_PG_MODULE);
  const { Client } = module.default ?? module;
  const scenarios = [];
  for (const concurrency of [1, 5, 25, 50]) {
    const clients = [];
    try {
      for (let i = 0; i < concurrency; i++) {
        const client = new Client({ connectionString: url.href });
        await client.connect();
        await client.query(
          `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${student}',false)`,
        );
        clients.push(client);
      }
      const samples = [];
      const started = performance.now();
      await Promise.all(
        clients.map(async (client) => {
          for (let i = 0; i < 2; i++) {
            const t = performance.now();
            const result = await client.query(
              "SELECT count(*)::integer AS visible FROM public.lessons",
            );
            assert.ok(result.rows[0].visible > 0 && result.rows[0].visible < 1458);
            samples.push(performance.now() - t);
          }
        }),
      );
      scenarios.push({
        concurrency,
        requests: samples.length,
        elapsedMs: performance.now() - started,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
        errors: 0,
      });
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  }
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${student}',false)`,
  );
  const column = phase === "before" ? "content" : "offline_metadata_v1";
  const started = performance.now();
  const bytes = await db.query(
    `SELECT octet_length(json_agg(row_to_json(s))::text) AS bytes FROM (SELECT id,lesson_id,${column} FROM lesson_book_contents WHERE lesson_id IN (SELECT id FROM lessons WHERE subject_id='10000000-0000-4000-8000-000000000001')) s`,
  );
  await db.exec("RESET ROLE");
  return {
    phase,
    scope:
      "TEST_ONLY PostgreSQL catalog component; 2 queries/client; no think time; not real student capacity",
    scenarios,
    textSourcePayload: { bytes: bytes.rows[0].bytes, elapsedMs: performance.now() - started },
  };
}
