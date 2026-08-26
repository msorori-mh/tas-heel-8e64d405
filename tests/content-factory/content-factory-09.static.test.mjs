import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const api = readFileSync(
  "src/lib/content-factory/golden-lesson-identity-binding.functions.ts",
  "utf8",
);
const sql = readFileSync(
  "supabase/migrations-pending/20260819220000_content_factory_09_authoritative_identity_binding.sql",
  "utf8",
);

test("CF09 binds authoritative existing rows and never creates curriculum", () => {
  for (const table of [
    "grades",
    "curriculum_tracks",
    "subjects",
    "subject_curriculum_tracks",
    "units",
    "lessons",
  ]) {
    assert.match(sql, new RegExp(`public\\.${table}`));
  }
  assert.doesNotMatch(
    sql,
    /INSERT INTO public\.(grades|curriculum_tracks|subjects|subject_curriculum_tracks|units|lessons)\b/,
  );
  assert.match(api, /curriculumCreationPerformed: false/);
  assert.match(api, /domainWritesPerformed: 0/);
});

test("CF09 is exact, immutable, admin-only and idempotent", () => {
  for (const guard of [
    "IDENTITY_GRADE_NOT_EXACTLY_ONE",
    "IDENTITY_TRACK_NOT_EXACTLY_ONE_ACTIVE",
    "IDENTITY_SUBJECT_GRADE_MISMATCH",
    "IDENTITY_SUBJECT_TRACK_BINDING_MISSING",
    "IDENTITY_UNIT_NOT_EXACTLY_ONE",
    "IDENTITY_LESSON_NOT_EXACTLY_ONE",
    "IDENTITY_LESSON_UNIT_MISMATCH",
  ]) {
    assert.match(sql, new RegExp(guard));
  }
  assert.match(sql, /golden_identity_binding_immutable/);
  assert.match(sql, /UNIQUE\s+REFERENCES public\.golden_lesson_domain_stage_batches/s);
  assert.match(sql, /GRANT EXECUTE[^;]+TO service_role/s);
  assert.doesNotMatch(sql, /publication_status\s*=|review_status\s*=\s*'READY'/);
});

test("CF09 pins a deterministic identity snapshot for future TOCTOU checks", () => {
  assert.match(sql, /identity_snapshot jsonb NOT NULL/);
  assert.match(sql, /digest\(convert_to\(snapshot::text,'UTF8'\),'sha256'\)/);
  assert.match(sql, /externalLessonCode/);
  assert.match(sql, /lessons\.slug/);
});
