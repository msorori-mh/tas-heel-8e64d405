import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync("supabase/migrations-pending/20260819190000_content_factory_04_package_staging.sql", "utf8");

test("CF04 persists versioned manifests and immutable review evidence only", () => {
  for (const table of ["golden_lesson_packages", "golden_lesson_package_versions", "golden_lesson_package_reviews"]) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}`));
  }
  assert.match(migration, /UNIQUE \(package_id, version\)/);
  assert.match(migration, /ON DELETE RESTRICT/g);
  assert.doesNotMatch(migration, /ON DELETE CASCADE/);
});

test("client and server hashes are separate and new versions reset to DRAFT", () => {
  assert.match(migration, /client_manifest_sha256/);
  assert.match(migration, /canonical_manifest_sha256/);
  assert.match(migration, /digest\(convert_to\(_manifest::text, 'UTF8'\), 'sha256'\)/);
  assert.match(migration, /review_status = 'DRAFT'/);
  assert.match(migration, /PACKAGE_IDENTITY_IMMUTABLE/);
});

test("all mutations are RPC-only under RLS and no anonymous write exists", () => {
  assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length, 3);
  assert.match(migration, /REVOKE ALL ON public\.golden_lesson_packages/);
  assert.doesNotMatch(migration, /GRANT (INSERT|UPDATE|DELETE|ALL).* TO authenticated/);
  assert.doesNotMatch(migration, /GRANT .* TO anon/);
  assert.match(migration, /SECURITY DEFINER/g);
  assert.match(migration, /SET search_path = public, pg_temp/g);
});

test("review transitions are version-pinned, role-separated and evidence-gated", () => {
  assert.match(migration, /STALE_PACKAGE_VERSION/);
  assert.equal((migration.match(/required_role := 'content_manager'/g) ?? []).length, 2);
  assert.match(migration, /REVIEWER_MUST_DIFFER_FROM_SUBMITTER/);
  assert.match(migration, /TECHNICAL_REVIEWER_MUST_DIFFER/);
  assert.match(migration, /required_role := 'admin'/);
  for (const evidence of ["packageValidationPassed", "officialProvenanceChecked", "answerSeparationChecked", "responsivePreviewChecked"]) {
    assert.match(migration, new RegExp(evidence));
  }
  assert.doesNotMatch(migration, /review_status\s*=\s*'READY'|publication_status|is_published/);
});

test("server repeats the Golden Lesson security contract fail closed", () => {
  for (const guard of ["CAPABILITY_ORDER_INVALID", "ARTIFACT_SET_INVALID", "APPLICABILITY_MISMATCH", "AUTHORITY_MISMATCH", "OFFICIAL_PROVENANCE_MISSING", "ANSWER_COMPANION_INVALID", "SECURITY_CONTRACT_INVALID"]) {
    assert.match(migration, new RegExp(guard));
  }
  assert.match(migration, /productionApply/);
  assert.match(migration, /publicPayloadContainsAnswers/);
  assert.match(migration, /htmlNetworkAccess/);
});
