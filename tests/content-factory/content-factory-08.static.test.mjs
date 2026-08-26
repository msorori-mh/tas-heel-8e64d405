import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const adapter = readFileSync("src/lib/content-factory/golden-lesson-domain-staging.ts", "utf8");
const api = readFileSync(
  "src/lib/content-factory/golden-lesson-domain-staging.functions.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations-pending/20260819210000_content_factory_08_atomic_domain_staging.sql",
  "utf8",
);

test("CF08 maps exactly seven capabilities without live-domain mutation", () => {
  for (const target of [
    "lesson_book_contents",
    "lesson_explanations",
    "lesson_summaries",
    "lesson_resources:mindmap",
    "lesson_resources:experiment",
    "questions:official",
    "lesson_assessments:self_test",
  ]) {
    assert.match(adapter, new RegExp(target.replace(/:/g, "\\:")));
  }
  assert.match(migration, /domain_writes_performed',0/);
  assert.doesNotMatch(
    migration,
    /INSERT INTO public\.(lesson_book_contents|lesson_explanations|lesson_summaries|lesson_resources|questions|lesson_assessments)\b/,
  );
});

test("approved, current, byte-attested package is mandatory", () => {
  assert.match(api, /APPROVED_FOR_STAGING/);
  assert.match(api, /verifyGoldenLessonBundle/);
  assert.match(api, /VERIFIED_BUNDLE_IDENTITY_MISMATCH/);
  assert.match(migration, /PACKAGE_NOT_APPROVED_FOR_DOMAIN_STAGING/);
  assert.match(migration, /VERIFIED_BUNDLE_IDENTITY_MISMATCH/);
  assert.match(migration, /digest\(payload,'sha256'\)/);
});

test("staging is immutable, atomic and service-role only", () => {
  assert.match(migration, /GOLDEN_DOMAIN_STAGE_IMMUTABLE/);
  assert.match(migration, /UNIQUE \(package_id, package_version\)/);
  assert.match(migration, /GRANT EXECUTE[^;]+TO service_role/s);
  assert.match(migration, /REVOKE ALL[^;]+authenticated/s);
  assert.match(migration, /golden domain answers admin read/);
  assert.match(migration, /is_golden_lesson_admin\(auth\.uid\(\)\)/);
  assert.doesNotMatch(
    migration,
    /review_status\s*=\s*'READY'|publication_status\s*=\s*'published'/,
  );
});
