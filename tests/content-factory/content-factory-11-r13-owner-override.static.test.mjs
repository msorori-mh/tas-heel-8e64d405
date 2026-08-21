import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260821023000_rapid_owner_launch_review_override.sql", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../../src/lib/content-factory/golden-lesson-persistence.functions.ts", import.meta.url),
  "utf8",
);
const panel = readFileSync(
  new URL("../../src/components/admin/GoldenLessonManifestReviewPanel.tsx", import.meta.url),
  "utf8",
);

test("R13 owner override is narrowly role-gated and requires a verified bundle", () => {
  assert.match(migration, /golden_lesson_has_role\(actor, 'admin'\)/);
  assert.match(migration, /golden_lesson_has_role\(actor, 'content_manager'\)/);
  assert.match(migration, /verified_bundle_sha256 IS NOT NULL/);
  assert.match(migration, /verified_storage_path IS NOT NULL/);
  assert.match(migration, /verified_file_count > 0/);
  assert.match(migration, /VERIFIED_BUNDLE_REQUIRED/);
});

test("R13 owner override requires complete evidence and an audit reason", () => {
  for (const key of [
    "packageValidationPassed",
    "officialProvenanceChecked",
    "answerSeparationChecked",
    "responsivePreviewChecked",
  ]) assert.match(migration, new RegExp(key));
  assert.match(migration, /length\(btrim\(COALESCE\(_reason, ''\)\)\) < 20/);
  assert.match(migration, /RAPID_LAUNCH_OWNER_APPROVAL/);
  assert.match(migration, /'ownerOverride', true/);
});

test("R13 approval performs no lesson-domain writes and keeps normal review intact", () => {
  assert.match(migration, /'domain_writes_performed', 0/);
  assert.doesNotMatch(migration, /INSERT INTO public\.(lessons|lesson_book_contents|lesson_explanations|lesson_summaries|lesson_resources|lesson_assessments|questions)/);
  assert.match(server, /ownerApproveGoldenLessonForStaging/);
  assert.match(server, /golden_lesson_owner_approve_for_staging/);
  assert.match(panel, /اعتماد مالك المنصة للتجهيز/);
  assert.match(panel, /ownerReason\.trim\(\)\.length < 20/);
});
