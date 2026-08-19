import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const api = readFileSync("src/lib/content-factory/golden-lesson-persistence.functions.ts", "utf8");
const ui = readFileSync("src/components/admin/GoldenLessonManifestReviewPanel.tsx", "utf8");
const migration = readFileSync("supabase/migrations-pending/20260819190000_content_factory_04_package_staging.sql", "utf8");

test("CF05 uses the operator JWT under content-staff middleware", () => {
  assert.match(api, /requireContentStaffAuth/);
  assert.doesNotMatch(api, /supabaseAdmin|SERVICE_ROLE|service_role/);
});

test("pending schema is an explicit fail-closed capability", () => {
  assert.match(api, /SCHEMA_NOT_APPLIED/);
  assert.match(api, /42P01/);
  assert.match(ui, /persistence\.available/);
  assert.match(ui, /المخطط غير مطبق/);
});

test("only staging and review RPCs are reachable", () => {
  assert.match(api, /golden_lesson_stage_manifest/);
  assert.match(api, /golden_lesson_advance_review/);
  assert.doesNotMatch(api, /execute|publish|READY/);
});

test("production roles and actor separation are enforced server-side", () => {
  assert.match(migration, /content_manager/);
  assert.doesNotMatch(migration, /required_role := 'content_editor'|required_role := 'content_reviewer'/);
  assert.match(migration, /REVIEWER_MUST_DIFFER_FROM_SUBMITTER/);
  assert.match(migration, /TECHNICAL_REVIEWER_MUST_DIFFER/);
});
