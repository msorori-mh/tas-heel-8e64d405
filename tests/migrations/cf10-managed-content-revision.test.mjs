import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "supabase", "migrations");
const repoRoot = join(here, "..", "..");
/**
 * Owning the mechanism means installing the drift refusal. Later migrations legitimately
 * *mention* the marker -- to require the mechanism as a precondition, or to prove they did
 * not delete it -- and those must not count as a second owner.
 */
const OWNS = "RAISE EXCEPTION 'CF10_MANAGED_REVISION_TARGET_DRIFT";
const sqlFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
const candidates = sqlFiles.filter((name) =>
  readFileSync(join(migrationsDir, name), "utf8").includes(OWNS),
);

test("exactly one forward migration owns managed CF10 revisions", () => {
  assert.equal(candidates.length, 1, `owners: ${candidates.join(", ") || "none"}`);
});

test("migrations that merely reference the mechanism do not redefine it", () => {
  const referencing = sqlFiles.filter((name) => {
    const body = readFileSync(join(migrationsDir, name), "utf8");
    return body.includes("CF10_MANAGED_REVISION_TARGET_DRIFT") && !body.includes(OWNS);
  });
  for (const name of referencing) {
    const body = readFileSync(join(migrationsDir, name), "utf8");
    assert.doesNotMatch(
      body,
      /UPDATE public\.lesson_(book_contents|explanations|summaries)\s+SET/,
      `${name} references the managed-revision guard and also rewrites a managed target`,
    );
  }
});

const sql = readFileSync(join(migrationsDir, candidates[0]), "utf8");

test("DRY_RUN pins all mutable target hashes and lifecycle state", () => {
  assert.match(sql, /HASH_PINNED_COMPARE_AND_SWAP/);
  for (const target of ["lesson_book_contents", "lesson_explanations", "lesson_summaries"]) {
    assert.match(sql, new RegExp(`'${target}'[\\s\\S]{0,420}'existingHash'`));
  }
  assert.match(sql, /'lifecycle'[\s\S]{0,900}jsonb_object_agg/);
  assert.ok(
    sql.indexOf("CF10_WRITE_PLAN_HASH_MISMATCH") <
      sql.indexOf("UPDATE public.lesson_capability_lifecycle l"),
    "the reviewed plan gate must precede lifecycle writes",
  );
});

test("only an authoritative bound batch can replace the three non-versioned targets", () => {
  assert.equal((sql.match(/binding_count IS DISTINCT FROM 1/g) ?? []).length, 3);
  for (const target of ["lesson_book_contents", "lesson_explanations", "lesson_summaries"]) {
    assert.match(sql, new RegExp(`UPDATE public\\.${target}\\b`));
    assert.match(sql, new RegExp(`CF10_MANAGED_REVISION_TARGET_DRIFT: ${target}`));
  }
  assert.equal((sql.match(/GET DIAGNOSTICS rc = ROW_COUNT;/g) ?? []).length >= 4, true);
  assert.match(
    sql,
    /UPDATE public\.lesson_explanations[\s\S]{0,260}explanation_code IN \([\s\S]{0,300}lesson_explanations','existingHash/,
  );
  assert.equal(
    (sql.match(/plan #>> ARRAY\['managedRevision','targets',[^\]]+,'existingHash'\]/g) ?? [])
      .length,
    3,
  );
});

test("new revision reopens DRAFT but preserves frozen READY evidence", () => {
  const reopen = sql.slice(
    sql.indexOf("UPDATE public.lesson_capability_lifecycle l"),
    sql.indexOf(
      "GET DIAGNOSTICS rc = ROW_COUNT;",
      sql.indexOf("UPDATE public.lesson_capability_lifecycle l"),
    ),
  );
  assert.match(reopen, /SET status = 'DRAFT'/);
  assert.match(reopen, /draft_hash = e\.source_sha256/);
  assert.match(reopen, /reviewed_by = NULL/);
  assert.match(reopen, /reviewed_at = NULL/);
  assert.match(sql, /FOR UPDATE OF l/);
  assert.match(sql, /CF10_MANAGED_REVISION_LIFECYCLE_DRIFT/);
  for (const preserved of ["ready_snapshot", "ready_hash", "ready_by", "ready_at"]) {
    assert.doesNotMatch(reopen, new RegExp(`${preserved}\\s*=`));
  }
});

test("question revisions and destructive operations remain fail-closed", () => {
  assert.match(sql, /CF10_MANAGED_REVISION_POSTVERIFY_QUESTION_GUARD_LOST/);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|FUNCTION)\b/i);
  assert.doesNotMatch(sql, /UPDATE public\.questions\b/);
  assert.doesNotMatch(sql, /UPDATE public\.question_revisions\b/);
});

test("migration patches the existing function exactly and post-verifies it", () => {
  for (const code of [
    "CF10_MANAGED_REVISION_FUNCTION_NOT_FOUND",
    "CF10_MANAGED_REVISION_ALREADY_APPLIED",
    "CF10_MANAGED_REVISION_PLAN_PRECONDITION",
    "CF10_MANAGED_REVISION_GATE_PRECONDITION",
    "CF10_MANAGED_REVISION_BOOK_PRECONDITION",
    "CF10_MANAGED_REVISION_EXPLANATION_PRECONDITION",
    "CF10_MANAGED_REVISION_SUMMARY_PRECONDITION",
    "CF10_MANAGED_REVISION_POSTVERIFY_TARGETS",
  ]) {
    assert.match(sql, new RegExp(code));
  }
  assert.match(sql, /EXECUTE src;/);
});

test("both disposable PG17 rehearsals apply the managed revision before CF10 assertions", () => {
  for (const script of ["rehearse-content-factory-04.sh", "rehearse-content-factory-11.sh"]) {
    const body = readFileSync(join(repoRoot, "scripts", "content-factory", "pg17", script), "utf8");
    const migration = body.indexOf("20260827010000_cf10_managed_content_revision.sql");
    const assertions = body.indexOf("content-factory-10-assert.sql");
    assert.ok(migration > 0, `${script} does not apply the managed-revision migration`);
    assert.ok(assertions > migration, `${script} does not exercise the migration at runtime`);
  }
});
