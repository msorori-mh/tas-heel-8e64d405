/** TEST_ONLY. Creates an isolated database fixture; never accepts remote targets. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

assert.equal(process.env.UNIFIED_TEST_ONLY, "1");
const url = new URL(process.env.UNIFIED_PG_URL);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/tamkeen_journey_test");
const module = await import(process.env.UNIFIED_PG_MODULE);
const { Client } = module.default ?? module;
const db = new Client({ connectionString: url.href });
await db.connect();
try {
  await db.query(await readFile("tests/load/capacity-fixture.sql", "utf8"));
  await db.query("CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;");
  await db.query("CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);");
  const schema = await readFile("tests/offline/fixtures/pg17-offline-assessment-schema.sql", "utf8");
  const start = schema.indexOf("CREATE TABLE public.questions (");
  assert.ok(start > 0);
  await db.query(schema.slice(start));
  await db.query(await readFile("tests/load/journeys/fixture.sql", "utf8"));
  const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRzQAAAAASUVORK5CYII=";
  const body = '<article dir="rtl">TEST_ONLY محتوى الدرس<img alt="TEST_ONLY" src="data:image/png;base64,' + image + '"></article><!--' + randomBytes(786432).toString("base64") + "-->";
  await db.query("UPDATE lesson_book_contents SET content=$1", [body]);
  await db.query(await readFile("supabase/migrations/20260912030000_offline_assessment_answer_layer.sql", "utf8"));
  await db.query(await readFile("supabase/migrations/20260914004320_offline_capacity_metadata_and_access.sql", "utf8"));
  await db.query("UPDATE lesson_capability_lifecycle c SET ready_hash=b.offline_metadata_v1->>'sha256' FROM lesson_book_contents b WHERE b.lesson_id=c.lesson_id AND c.capability='officialBookContent'");
  await db.query("ANALYZE");
  const counts = (await db.query("SELECT (SELECT count(*) FROM auth.users)::int users,(SELECT count(*) FROM lessons)::int lessons,(SELECT count(*) FROM questions)::int questions,(SELECT count(*) FROM lesson_book_contents)::int books,pg_database_size(current_database())::bigint database_bytes")).rows[0];
  await mkdir("artifacts/journeys", { recursive: true });
  await writeFile("artifacts/journeys/fixture.json", JSON.stringify({ scope: "TEST_ONLY generated users/content; not a production copy", ...counts, bookBodyBytes: Buffer.byteLength(body) }, null, 2));
  console.log(JSON.stringify(counts));
} finally {
  await db.end();
}
