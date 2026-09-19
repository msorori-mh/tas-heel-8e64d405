import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { fingerprintOfflineText } from "../../src/lib/offline/offline-text-metadata.ts";
const target = new URL(process.env.OFFLINE_PREPARED_PG_URL);
assert.equal(target.hostname, "127.0.0.1");
assert.equal(target.pathname, "/tamkeen_prepared_test");
const db = postgres(target.href, { max: 1 });
const uid = "00000000-0000-4000-8000-000000000001",
  foreign = "00000000-0000-4000-8000-000000000002";
const lesson = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const tables = [
  "lesson_book_contents",
  "lesson_explanations",
  "lesson_summaries",
  "lesson_resources",
  "lesson_capability_lifecycle",
];
try {
  await db.unsafe(await readFile("tests/offline/prepared-descriptors-fixture.sql", "utf8"));
  await db`INSERT INTO lessons(id,owner_id) VALUES (${lesson},${uid}),(${other},${foreign})`;
  await db`INSERT INTO lesson_book_contents(id,lesson_id,content) VALUES (${lesson},${lesson},'<html>TEST_ONLY original</html>'),(${other},${other},'<html>TEST_ONLY private</html>')`;
  const before =
    await db`SELECT id,md5(content) AS hash,updated_at FROM lesson_book_contents ORDER BY id`;
  await db.unsafe(
    await readFile("supabase/migrations/20260920010000_offline_prepared_descriptors.sql", "utf8"),
  );
  await db`SET ROLE authenticated`;
  await db`SELECT set_config('request.jwt.claim.sub',${uid},false)`;
  assert.equal(
    (await db`SELECT offline_manifest_sources_v1(ARRAY[${lesson}::uuid]) AS value`)[0].value
      .pending,
    true,
  );
  await assert.rejects(
    db`SELECT offline_backfill_descriptors_v1('lesson_book_contents',8)`,
    (e) => e.code === "42501",
  );
  await assert.rejects(
    db`INSERT INTO offline_prepared_descriptors VALUES ('lesson_book_contents',${lesson},${lesson},'{}')`,
    (e) => e.code === "42501",
  );
  await db`RESET ROLE`;
  for (const size of [0, 17, null])
    await assert.rejects(
      db`SELECT offline_backfill_descriptors_v1('lesson_book_contents',${size})`,
      (e) => e.code === "22023",
    );
  for (const table of tables)
    while ((await db`SELECT offline_backfill_descriptors_v1(${table},8) AS n`)[0].n > 0) {}
  assert.deepEqual(
    await db`SELECT id,md5(content) AS hash,updated_at FROM lesson_book_contents ORDER BY id`,
    before,
  );
  const vectors = [
    "",
    " \u00a0\ufeff",
    "<html>TEST_ONLY محتوى</html>",
    '<div data-answer="a">x</div>',
    '<div class="answer-key">x</div>',
    '<img src="https://x.test/a">',
    '<img src="data:image/png;base64,AAAA">',
    '<p id="جوابanswer-key">x</p>',
    '<p class="hidden-explanation">x</p>',
    `<html>${"A".repeat(1024 * 1024)}</html>`,
  ];
  for (const body of vectors)
    assert.deepEqual(
      (await db`SELECT _offline_text_descriptor_v1(${body}) AS value`)[0].value,
      await fingerprintOfflineText(body),
    );
  await db`SET ROLE authenticated`;
  const visible = (
    await db`SELECT offline_manifest_sources_v1(ARRAY[${lesson}::uuid,${other}::uuid]) AS value`
  )[0].value;
  assert.equal(visible.pending, false);
  assert.deepEqual(
    visible.books.map((x) => x.id),
    [lesson],
  );
  assert.equal(visible.gates.length, 1);
  assert.equal((await db`SELECT * FROM offline_prepared_descriptors`).length, 1);
  assert.ok(!JSON.stringify(visible).includes("TEST_ONLY"));
  assert.ok(!JSON.stringify(visible).includes('content"'));
  await assert.rejects(
    db`SELECT offline_manifest_sources_v1(array_fill(${lesson}::uuid,ARRAY[65]))`,
    (e) => e.code === "22023",
  );
  await db`RESET ROLE`;
  await db`SET ROLE anon`;
  await assert.rejects(db`SELECT offline_manifest_sources_v1('{}')`, (e) => e.code === "42501");
  await db`RESET ROLE`;
  // Every content category refreshes atomically; metadata writes never edit source timestamps.
  const bodies = {
    lesson_book_contents: "content",
    lesson_explanations: "content",
    lesson_summaries: "summary",
    lesson_resources: "description",
  };
  for (const [table, column] of Object.entries(bodies)) {
    if (table !== "lesson_book_contents")
      await db.unsafe(`INSERT INTO ${table}(id,lesson_id,${column}) VALUES ($1,$1,$2)`, [
        lesson,
        "TEST_ONLY first",
      ]);
    await db.unsafe(`UPDATE ${table} SET ${column}=$2 WHERE id=$1`, [lesson, "TEST_ONLY changed"]);
    const row = (
      await db`SELECT descriptor FROM offline_prepared_descriptors WHERE source_table=${table} AND source_id=${lesson}`
    )[0];
    assert.deepEqual(row.descriptor, await fingerprintOfflineText("TEST_ONLY changed"));
  }
  const snapshot = {
    snapshotVersion: "v3.snapshot.1",
    lessonId: lesson,
    capability: "officialBookContent",
    payload: [{ content: "TEST_ONLY changed" }],
  };
  await db`INSERT INTO lesson_capability_lifecycle(id,lesson_id,capability,status,ready_hash,ready_snapshot) VALUES (${lesson},${lesson},'officialBookContent','READY',encode(sha256(convert_to(_v3_canonical_json_v1(${db.json(snapshot)}),'UTF8')),'hex'),${db.json(snapshot)})`;
  let descriptor = (
    await db`SELECT descriptor FROM offline_prepared_descriptors WHERE source_table='lesson_capability_lifecycle' AND source_id=${lesson}`
  )[0].descriptor;
  assert.equal(descriptor.verified, true);
  assert.deepEqual(descriptor.bodyHashes, [
    (await fingerprintOfflineText("TEST_ONLY changed")).sha256,
  ]);
  await db`UPDATE lesson_capability_lifecycle SET ready_hash=repeat('0',64) WHERE id=${lesson}`;
  descriptor = (
    await db`SELECT descriptor FROM offline_prepared_descriptors WHERE source_table='lesson_capability_lifecycle' AND source_id=${lesson}`
  )[0].descriptor;
  assert.equal(descriptor.verified, false);
  assert.deepEqual(descriptor.bodyHashes, []);
  for (const extra of [{ n: 1.5 }, { n: 9007199254740992 }, { "غير قياسي": 1 }]) {
    const invalid = { ...snapshot, ...extra };
    assert.equal(
      (
        await db`SELECT _offline_snapshot_descriptor_v1(${lesson},'officialBookContent',encode(sha256(convert_to(_v3_canonical_json_v1(${db.json(invalid)}),'UTF8')),'hex'),${db.json(invalid)}) AS value`
      )[0].value.verified,
      false,
    );
  }
  await db`UPDATE lessons SET active=false WHERE id=${lesson}`;
  await db`SET ROLE authenticated`;
  assert.equal(
    (await db`SELECT offline_manifest_sources_v1(ARRAY[${lesson}::uuid]) AS value`)[0].value.books
      .length,
    0,
  );
  assert.equal((await db`SELECT * FROM offline_prepared_descriptors`).length, 0);
  await db`RESET ROLE`;
  for (const table of tables) {
    await db.unsafe(`DELETE FROM ${table} WHERE id=$1`, [lesson]);
    assert.equal(
      (
        await db`SELECT count(*)::int AS n FROM offline_prepared_descriptors WHERE source_table=${table} AND source_id=${lesson}`
      )[0].n,
      0,
    );
  }
  console.log(
    "PASS: source preservation, 10 SQL/JS vectors, bounded backfill, automatic refresh for all categories, snapshot approval binding, no raw bodies, source RLS/revocation, anon/write denial and exact deletion",
  );
} finally {
  await db.end();
}
