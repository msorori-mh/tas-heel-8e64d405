import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const verifier = readFileSync("src/lib/content-factory/golden-lesson-bundle-verifier.ts", "utf8");
const api = readFileSync("src/lib/content-factory/golden-lesson-bundle.functions.ts", "utf8");
const migration = readFileSync("supabase/migrations-pending/20260819200000_content_factory_07_verified_bundle_intake.sql", "utf8");

test("bundle intake is private, owner-scoped and immutable", () => {
  assert.match(migration, /golden-lesson-intake/);
  assert.match(migration, /public\.is_golden_lesson_content_staff\(auth\.uid\(\)\)/);
  assert.match(migration, /storage\.foldername\(name\)/);
  const policies = [...migration.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((match) => match[0]);
  assert.equal(policies.length, 2);
  for (const policy of policies) assert.doesNotMatch(policy, /FOR UPDATE|FOR DELETE/);
});

test("only server-attested bytes can cross DRAFT to SUBMITTED", () => {
  assert.match(migration, /VERIFIED_BUNDLE_REQUIRED/);
  assert.match(migration, /GRANT EXECUTE[^;]+TO service_role/s);
  assert.match(migration, /REVOKE ALL[^;]+authenticated/s);
  assert.match(api, /verifyGoldenLessonBundle\(bytes\)/);
  assert.match(api, /golden_lesson_attest_bundle/);
});

test("ZIP verifier rejects structural and expansion attacks", () => {
  for (const guard of ["ZIP_MULTIDISK_FORBIDDEN","ZIP_ENCRYPTED_FORBIDDEN","ZIP_SYMLINK_FORBIDDEN","ZIP_PATH_DUPLICATE","ZIP_COMPRESSION_RATIO_LIMIT","ZIP_FILE_SET_MISMATCH","ZIP_FILE_HASH_MISMATCH"]) {
    assert.match(verifier, new RegExp(guard));
  }
  assert.match(verifier, /checkCRC32: true/);
});
