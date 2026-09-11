import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260918040000_self_test_answer_and_question_management.sql",
    import.meta.url,
  ),
  "utf8",
);
const transitionHotfix = await readFile(
  new URL(
    "../../supabase/migrations/20260918041000_self_test_admin_update_transition_fix.sql",
    import.meta.url,
  ),
  "utf8",
);
const mediaHotfix = await readFile(
  new URL(
    "../../supabase/migrations/20260918042000_self_test_admin_update_media_preservation.sql",
    import.meta.url,
  ),
  "utf8",
);
const dialog = await readFile(
  new URL("../../src/components/admin/LessonSelfTestQuestionsDialog.tsx", import.meta.url),
  "utf8",
);
const route = await readFile(
  new URL("../../src/routes/_authenticated/admin.lesson-content.$lessonId.tsx", import.meta.url),
  "utf8",
);

test("self-test publisher resolves the normalized assessment identity", () => {
  assert.match(migration, /normalize_content_code\(_lesson_code\|\|''-SELFTEST''\)/);
  assert.match(migration, /SELF_TEST_FIX_PUBLISHER_SHAPE_UNEXPECTED/);
});

test("correct-option materialisation repairs existing revisions and future publications", () => {
  assert.match(migration, /CREATE TRIGGER trg_sync_self_test_correct_option/);
  assert.match(migration, /option_code = v\.correct_option_id/);
  assert.match(migration, /'self_test_correct_option_v1'/);
  assert.match(migration, /SELF_TEST_CORRECT_OPTION_POSTVERIFY_FAILED/);
});

test("admin question mutations preserve history through revisions and archival", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lesson_self_test_question_update/);
  assert.match(migration, /INSERT INTO public\.question_revisions/);
  assert.match(migration, /SET status = 'SUPERSEDED'/);
  assert.match(migration, /archived_at = now\(\), archived_by = v_actor/);
  assert.match(migration, /v_old_revision\.requires_media/);
  assert.match(
    migration,
    /FROM public\.question_media WHERE question_revision_id = v_old_revision\.id/,
  );
  assert.match(transitionHotfix, /status = ''APPROVED''/);
  assert.match(mediaHotfix, /SELF_TEST_ADMIN_MEDIA_PRESERVATION_SHAPE_UNEXPECTED/);
  assert.doesNotMatch(migration, /DELETE FROM public\.(practice_attempt|exam_session)/);
});

test("admin RPCs are authenticated, role checked, and audited", () => {
  assert.match(migration, /NOT public\.is_content_staff\(v_actor\)/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.lesson_self_test_questions_admin_list\(uuid\) FROM PUBLIC, anon/,
  );
  assert.match(migration, /lesson_self_test_question_update/);
  assert.match(migration, /lesson_self_test_question_delete/);
  assert.match(migration, /INSERT INTO public\.audit_logs/g);
});

test("lesson workspace exposes per-question editing and deletion", () => {
  assert.match(route, /lessonAssessment: \(\) => setOpenSelfTestDialog\(true\)/);
  assert.match(route, /<LessonSelfTestQuestionsDialog/);
  assert.match(dialog, /lesson_self_test_questions_admin_list/);
  assert.match(dialog, /lesson_self_test_question_update/);
  assert.match(dialog, /lesson_self_test_question_delete/);
  assert.match(dialog, /حفظ إصدار جديد/);
});
