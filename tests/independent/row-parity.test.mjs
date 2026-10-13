import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import {
  parityKey,
  readRowManifest,
  compareRowManifests,
} from "../../scripts/independent/row-parity.mjs";

const source = "zbdhxyuulyovihjgeqbn",
  target = "yjpirilbpqxtmnayruht";
const key = parityKey("a1".repeat(32));
test("keyed snapshots detect same-count edits, replacements and deletions without exporting private values", async () => {
  // CI uses disposable PostgreSQL 17; local fallback executes the same SQL in PGlite.
  let db, sql;
  if (process.env.PARITY_TEST_DATABASE_URL) {
    sql = postgres(process.env.PARITY_TEST_DATABASE_URL, { max: 1 });
  } else {
    db = new PGlite();
    const unsafe = (query) => ({
      then: (yes, no) =>
        db
          .query(query)
          .then((r) => r.rows)
          .then(yes, no),
      cursor: async function* () {
        yield (await db.query(query)).rows;
      },
    });
    sql = {
      unsafe,
      begin: async (options, callback) => {
        assert.equal(options, "isolation level repeatable read read only");
        await db.exec("BEGIN " + options);
        try {
          const result = await callback({ unsafe });
          await db.exec("COMMIT");
          return result;
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
    };
  }
  try {
    for (const statement of [
      "CREATE SCHEMA auth",
      "CREATE TABLE auth.users(id uuid PRIMARY KEY, email text)",
      "CREATE TABLE auth.identities(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users)",
      'CREATE TABLE public."quoted table"("odd key" int, part int, value text, PRIMARY KEY("odd key",part))',
      "INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001','TEST_ONLY_PRIVATE@example.invalid')",
      "INSERT INTO public.\"quoted table\" VALUES (1,1,'TEST_ONLY_PRIVATE'), (2,1,'before')",
    ])
      await sql.unsafe(statement);
    const before = await readRowManifest(sql, source, key);
    const same = await readRowManifest(sql, target, key);
    assert.equal(compareRowManifests(before, same).status, "ROWS_MATCH_NOT_CUTOVER_CLEARANCE");
    assert.equal(compareRowManifests(before, same).cutoverAllowed, false);
    assert.ok(!JSON.stringify(before).includes("TEST_ONLY_PRIVATE"));
    assert.ok(!JSON.stringify(before).includes("00000000-0000-4000-8000-000000000001"));
    await sql.unsafe('UPDATE public."quoted table" SET value=\'after\' WHERE "odd key"=1');
    await sql.unsafe('DELETE FROM public."quoted table" WHERE "odd key"=2');
    await sql.unsafe("INSERT INTO public.\"quoted table\" VALUES (3,1,'replacement')");
    const after = await readRowManifest(sql, target, key);
    const comparison = compareRowManifests(before, after);
    const table = comparison.tables.find((t) => t.name === "quoted table");
    assert.equal(comparison.status, "HOLD_ROW_DIFFERENCES_OR_SCOPE");
    assert.deepEqual(
      [table.sourceRows, table.targetRows, table.changed, table.missingOnTarget, table.targetOnly],
      [2, 2, 1, 1, 1],
    );
    const otherKey = await readRowManifest(sql, target, parityKey("b2".repeat(32)));
    assert.throws(() => compareRowManifests(before, otherKey), /Different parity keys/);
    const duplicate = structuredClone(same);
    duplicate.tables
      .find((t) => t.name === "users")
      .entries.push(same.tables.find((t) => t.name === "users").entries[0]);
    assert.throws(() => compareRowManifests(before, duplicate), /duplicate row/);
    assert.throws(() => compareRowManifests({ ...before, tables: [] }, same), /scope/);
    assert.throws(() => compareRowManifests(same, before), /Invalid row manifest/);
    await sql.unsafe('CREATE TABLE public."no key"(v int)');
    const noKeyA = await readRowManifest(sql, source, key),
      noKeyB = await readRowManifest(sql, target, key);
    assert.equal(compareRowManifests(noKeyA, noKeyB).status, "HOLD_ROW_DIFFERENCES_OR_SCOPE");
    assert.equal(compareRowManifests(before, noKeyB).status, "HOLD_ROW_DIFFERENCES_OR_SCOPE");
    // The actual transaction rejects writes, not merely a reported read-only label.
    await assert.rejects(
      sql.begin("isolation level repeatable read read only", async (tx) => {
        await tx.unsafe('INSERT INTO public."no key" VALUES (1)');
      }),
      /read.only/i,
    );
    await sql.unsafe('ALTER TABLE public."quoted table" ENABLE ROW LEVEL SECURITY');
    await sql.unsafe("CREATE ROLE parity_fixture_reader NOLOGIN");
    await sql.unsafe("GRANT USAGE ON SCHEMA public,auth TO parity_fixture_reader");
    await sql.unsafe("GRANT SELECT ON ALL TABLES IN SCHEMA public,auth TO parity_fixture_reader");
    await sql.unsafe("SET ROLE parity_fixture_reader");
    try {
      await assert.rejects(readRowManifest(sql, source, key), /row.level security/i);
    } finally {
      await sql.unsafe("RESET ROLE");
    }
  } finally {
    if (db) await db.close();
    else await sql.end();
  }
});

test("comparison key is explicitly configured and never inferred from a public project key", () => {
  for (const bad of [undefined, "", "test", "a".repeat(63), "z".repeat(64)])
    assert.throws(() => parityKey(bad));
  assert.equal(parityKey("f".repeat(64)).length, 32);
});
