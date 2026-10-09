import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { readInventory } from "../../scripts/independent/collect-inventory.mjs";

test("inventory runs read-only, detects missing owners and never emits user row values", async () => {
  assert.ok(process.env.INVENTORY_TEST_DATABASE_URL, "disposable test database is required");
  const sql = postgres(process.env.INVENTORY_TEST_DATABASE_URL, { max: 1 });
  try {
    await sql.unsafe(`
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
      CREATE TABLE storage.buckets(id text PRIMARY KEY, public bool, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(bucket_id text, owner_id text);
      CREATE TABLE public."quoted table"(id int, private_value text);
      ALTER TABLE public."quoted table" ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_fixture ON public."quoted table" USING (false);
      INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001','TEST_ONLY_PRIVATE');
      INSERT INTO storage.buckets VALUES ('receipts',false,1000000,ARRAY['image/png']);
      INSERT INTO storage.objects VALUES ('receipts','00000000-0000-4000-8000-000000000001'),('receipts','missing'),('receipts',null);
      INSERT INTO public."quoted table" VALUES (1,'TEST_ONLY_PRIVATE');
    `);
    const wrapped = Object.assign(sql, { begin: sql.begin.bind(sql) });
    const original = wrapped.begin;
    wrapped.begin = (options, callback) => {
      assert.equal(options, "isolation level repeatable read read only");
      return original(options, async (tx) => {
        const [mode] = await tx`SHOW transaction_read_only`;
        assert.equal(mode.transaction_read_only, "on");
        return callback(tx);
      });
    };
    const report = await readInventory(wrapped, "fixture");
    assert.equal(report.status, "READ_ONLY_INVENTORY_NOT_PARITY_PROOF");
    assert.equal(report.tables.find((t) => t.table === "quoted table").rows, "1");
    assert.deepEqual(report.ownership[0], {
      bucket_id: "receipts",
      objects: "3",
      without_owner: "1",
      missing_owner_accounts: "1",
    });
    assert.equal(report.rls.find((t) => t.table === "quoted table").enabled, true);
    assert.equal(report.migrations, null);
    assert.ok(!JSON.stringify(report).includes("TEST_ONLY_PRIVATE"));
    assert.ok(!JSON.stringify(report).includes("00000000-0000-4000-8000-000000000001"));
    await sql`UPDATE public."quoted table" SET private_value='CHANGED'`;
    const after = await readInventory(wrapped, "fixture");
    assert.deepEqual(after.tables, report.tables); // Deliberately NOT row parity proof.
    assert.deepEqual(after.schemaHashes, report.schemaHashes);
  } finally {
    await sql.end();
  }
});
