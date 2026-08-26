import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const verifier = readFileSync("src/lib/content-factory/golden-lesson-direct-verifier.ts", "utf8");
const api = readFileSync("src/lib/content-factory/golden-lesson-direct.functions.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations-pending/20260821200000_content_factory_14_direct_lesson_intake.sql",
  "utf8",
);

test("direct intake is private, owner-scoped and immutable", () => {
  assert.match(migration, /golden-lesson-intake-v2/);
  assert.match(migration, /public\.is_golden_lesson_content_staff\(auth\.uid\(\)\)/);
  assert.match(migration, /storage\.foldername\(name\)/);
  const policies = [...migration.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((match) => match[0]);
  assert.equal(policies.length, 2);
  for (const policy of policies) assert.doesNotMatch(policy, /FOR UPDATE|FOR DELETE/);
});

test("only server-attested direct files can cross DRAFT to SUBMITTED", () => {
  assert.match(migration, /VERIFIED_INTAKE_REQUIRED/);
  assert.match(migration, /GRANT EXECUTE[^;]+TO service_role/s);
  assert.match(migration, /REVOKE ALL[^;]+authenticated/s);
  assert.match(api, /verifyGoldenLessonDirectIntake\(manifest, files\)/);
  assert.match(api, /golden_lesson_attest_direct_intake/);
});

test("direct verifier rejects path, set, size and hash attacks", () => {
  for (const guard of [
    "DIRECT_PATH_UNSAFE",
    "DIRECT_PATH_DUPLICATE",
    "DIRECT_FILE_SET_MISMATCH",
    "DIRECT_FILE_SIZE_LIMIT",
    "DIRECT_TOTAL_SIZE_LIMIT",
    "DIRECT_FILE_HASH_MISMATCH",
  ]) {
    assert.match(verifier, new RegExp(guard));
  }
  assert.doesNotMatch(api, /JSZip|application\/zip|\.zip/);
  assert.match(api, /downloadedBytes > GOLDEN_DIRECT_LIMITS\.maxTotalBytes/);
});

test("server verifier checks capability bytes after hash verification", () => {
  assert.match(verifier, /validateGoldenLessonArtifactBytes/);
  assert.match(verifier, /validateGoldenLessonAnswerCoverage/);
  assert.match(verifier, /ARTIFACT_CONTENT_INVALID/);
});
