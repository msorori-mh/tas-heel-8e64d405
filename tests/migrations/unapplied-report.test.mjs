import assert from "node:assert/strict";
import { test } from "node:test";
import { planUnapplied, readRepoMigrations } from "../../scripts/migrations/unapplied-report.mjs";

const file = (version, name = `${version}_x.sql`) => ({
  dir: "supabase/migrations",
  file: name,
  version,
  path: `supabase/migrations/${name}`,
});

test("a migration recorded under its own version is not outstanding", () => {
  const { outstanding, skewed } = planUnapplied([file("20260101000000")], ["20260101000000"]);
  assert.deepEqual(outstanding, []);
  assert.deepEqual(skewed, []);
});

/**
 * Lovable records some migrations a second or two off the filename timestamp. Reporting
 * those as drift would bury the real backlog in false positives — the first pass of this
 * audit produced 83 "missing" files, 27 of which were only this.
 */
test("a one-second recording skew is reported separately, not as drift", () => {
  // Same-minute skew, which is the shape the real data has.
  const sameMinute = planUnapplied([file("20260606003616")], ["20260606003615"]);
  assert.deepEqual(sameMinute.outstanding, []);
  assert.equal(sameMinute.skewed[0]?.appliedAs, "20260606003615");

  // And across a year boundary, where subtracting from the digits would be wrong:
  // one second before 20260101000000 is 20251231235959, not 20260100595959.
  const acrossBoundary = planUnapplied([file("20260101000000")], ["20251231235959"]);
  assert.deepEqual(acrossBoundary.outstanding, []);
  assert.equal(acrossBoundary.skewed[0]?.appliedAs, "20251231235959");
});

test("a genuinely unapplied migration is reported, oldest first", () => {
  const { outstanding } = planUnapplied(
    [file("20260301000000"), file("20260101000000"), file("20260201000000")],
    ["20260101000000"],
  );
  assert.deepEqual(
    outstanding.map((item) => item.version),
    ["20260201000000", "20260301000000"],
  );
});

test("a skew wider than the tolerance is real drift", () => {
  const { outstanding, skewed } = planUnapplied([file("20260101000000")], ["20260101000010"]);
  assert.equal(outstanding.length, 1);
  assert.deepEqual(skewed, []);
});

test("both migration folders are scanned — migrations-pending is applied in production too", () => {
  const files = readRepoMigrations();
  const dirs = new Set(files.map((item) => item.dir));
  assert.ok(files.length > 100, `expected the real migration set, saw ${files.length}`);
  assert.ok(dirs.has("supabase/migrations"));
  assert.ok(
    dirs.has("supabase/migrations-pending"),
    "migrations-pending is misleadingly named: 12 of its files are live in production",
  );
});
