import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { benchmarkCapacity } from "./capacity-benchmark.mjs";
let db;
if (process.env.CAPACITY_PG_URL) {
  const target = new URL(process.env.CAPACITY_PG_URL);
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.pathname, "/tamkeen_capacity_test");
  const module = await import(process.env.CAPACITY_PG_MODULE);
  const { Client } = module.default ?? module;
  const client = new Client({ connectionString: target.href });
  await client.connect();
  db = {
    exec: (sql) => client.query(sql),
    query: (...args) => client.query(...args),
    close: () => client.end(),
  };
} else {
  const { PGlite } = await import(process.env.CAPACITY_PGLITE_MODULE);
  db = new PGlite();
}
try {
  await db.exec(await readFile("tests/load/capacity-fixture.sql", "utf8"));
  if (process.env.CAPACITY_PG_URL) {
    // Synthetic 1 MiB HTML payloads: representative transfer sizes, no real content/users.
    await db.exec(
      `UPDATE lesson_book_contents SET content='<html><img src="data:image/png;base64,'||repeat('VEVTVF9PTkxZ',87381)||'"></html>'`,
    );
  }
  const identities = [1, 2, 3, 4, 5];
  async function visible(id) {
    await db.exec(
      `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-${String(id).padStart(12, "0")}',false);`,
    );
    const rows = (await db.query("SELECT id FROM lessons ORDER BY id")).rows;
    const books = (await db.query("SELECT id FROM lesson_book_contents ORDER BY id")).rows;
    await db.exec("RESET ROLE");
    return { rows, books };
  }
  const contentBefore = (
    await db.query(
      "SELECT id,md5(content) AS hash,updated_at FROM lesson_book_contents ORDER BY id",
    )
  ).rows;
  const expected = [];
  for (const id of identities) expected.push([id, await visible(id)]);
  const beforeBenchmark = process.env.CAPACITY_PG_URL
    ? await benchmarkCapacity(db, "before")
    : null;
  await db.exec(
    await readFile(
      "supabase/migrations/20260914004320_offline_capacity_metadata_and_access.sql",
      "utf8",
    ),
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT id,md5(content) AS hash,updated_at FROM lesson_book_contents ORDER BY id",
      )
    ).rows,
    contentBefore,
  );
  for (const [id, rows] of expected)
    assert.deepEqual(await visible(id), rows, `access changed for ${id}`);
  assert.equal((await visible(5)).rows.length, 0, "cross-track access");
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`,
  );
  const gates = (
    await db.query(
      `SELECT * FROM lesson_student_content_gates(ARRAY['40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000005']::uuid[])`,
    )
  ).rows;
  assert.deepEqual(
    gates.map((g) => g.lesson_id),
    ["40000000-0000-4000-8000-000000000001"],
  );
  await assert.rejects(
    () =>
      db.query(
        `SELECT * FROM lesson_student_content_gates(array_fill('40000000-0000-4000-8000-000000000001'::uuid,ARRAY[201]))`,
      ),
    /OFFLINE_GATE_BATCH_TOO_LARGE/,
  );
  await assert.rejects(
    () =>
      db.query(
        `UPDATE lesson_book_contents SET offline_metadata_v1='{}' WHERE id='40000000-0000-4000-8000-000000000001'`,
      ),
    (e) => e.code === "428C9",
  );
  assert.deepEqual(
    (
      await db.query(
        `UPDATE lesson_book_contents SET content='TEST_ONLY forbidden' WHERE id='40000000-0000-4000-8000-000000000001' RETURNING id`,
      )
    ).rows,
    [],
    "student must not edit content",
  );
  await db.exec("RESET ROLE; SET ROLE anon;");
  await assert.rejects(
    () => db.query(`SELECT * FROM lesson_student_content_gates('{}')`),
    /permission denied/,
  );
  await db.exec("RESET ROLE");
  const old = (
    await db.query(
      `SELECT content,updated_at,offline_metadata_v1 FROM lesson_book_contents ORDER BY id LIMIT 1`,
    )
  ).rows[0];
  assert.equal(old.offline_metadata_v1.byteSize, Buffer.byteLength(old.content));
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false)`,
  );
  await db.exec(
    `UPDATE lesson_book_contents SET content='<html>TEST_ONLY revised</html>' WHERE id='40000000-0000-4000-8000-000000000001'`,
  );
  const fresh = (
    await db.query(
      `SELECT offline_metadata_v1 FROM lesson_book_contents WHERE id='40000000-0000-4000-8000-000000000001'`,
    )
  ).rows[0];
  assert.notEqual(fresh.offline_metadata_v1.sha256, old.offline_metadata_v1.sha256);
  await db.exec("RESET ROLE");
  // Real PostgreSQL regex/SHA parity with the client reference, including Arabic boundaries.
  const vectors = JSON.parse(
    await readFile("artifacts/capacity/offline-metadata-vectors.json", "utf8"),
  );
  for (const { body, metadata } of vectors) {
    const observed = (
      await db.query("SELECT public.offline_text_metadata_v1($1) AS metadata", [body])
    ).rows[0].metadata;
    assert.deepEqual(observed, metadata, body.slice(0, 100));
  }
  console.log(
    `PASS: 5-role equivalence, grade/track/draft isolation, batch bound, generated-column protection, anon denial, source refresh, ${vectors.length} SQL/JS parity vectors`,
  );
  if (beforeBenchmark) {
    const afterBenchmark = await benchmarkCapacity(db, "after");
    assert.ok(
      afterBenchmark.textSourcePayload.bytes < beforeBenchmark.textSourcePayload.bytes * 0.01,
      "metadata should remove >99% of the text-source payload",
    );
    await mkdir("artifacts/capacity", { recursive: true });
    await writeFile(
      "artifacts/capacity/benchmark.json",
      JSON.stringify({ before: beforeBenchmark, after: afterBenchmark }, null, 2),
    );
    console.log(JSON.stringify({ before: beforeBenchmark, after: afterBenchmark }));
  }
} finally {
  await db.close();
}
