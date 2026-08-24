import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../../supabase/migrations/20260824170000_golden_lesson_identity_preflight_rebind.sql",
  import.meta.url,
), "utf8");

test("rebind migration is admin-only, DRAFT-only and dependency fail-closed", () => {
  assert.match(migration, /golden_lesson_rebind_draft_identity/);
  assert.match(migration, /golden_lesson_has_role\(actor, 'admin'\)/);
  assert.match(migration, /review_status IS DISTINCT FROM 'DRAFT'/);
  assert.match(migration, /golden_lesson_package_reviews/);
  assert.match(migration, /golden_lesson_domain_stage_batches/);
  assert.match(migration, /DRAFT_IDENTITY_REBIND_REVIEW_EXISTS/);
  assert.match(migration, /DRAFT_IDENTITY_REBIND_DOMAIN_STAGE_EXISTS/);
});

test("rebind migration preserves stable key and appends an audit version", () => {
  for (const field of ["gradeCode", "subjectCode", "lessonCode", "lessonSlug"]) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /golden_lesson_package_versions/);
  assert.match(migration, /golden_lesson_identity_rebindings/);
  assert.match(migration, /old_identity/);
  assert.match(migration, /new_identity/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /ON DELETE CASCADE/);
});

test("authenticated users cannot write the audit ledger directly", () => {
  assert.match(migration, /REVOKE ALL ON public\.golden_lesson_identity_rebindings FROM anon, authenticated/);
  assert.doesNotMatch(migration, /GRANT (INSERT|UPDATE|DELETE|ALL) ON public\.golden_lesson_identity_rebindings TO authenticated/);
});
