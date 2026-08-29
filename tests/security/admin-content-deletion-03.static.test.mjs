import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260911010000_admin_content_deletion.sql",
  "utf8",
);
const workspace = readFileSync("src/components/admin/LessonContentWorkspace.tsx", "utf8");
const lessonRoute = readFileSync(
  "src/routes/_authenticated/admin.lesson-content.$lessonId.tsx",
  "utf8",
);
const resourceDialog = readFileSync("src/components/admin/LessonResourcesDialog.tsx", "utf8");
const curriculumDialog = readFileSync("src/components/admin/CurriculumDeleteDialog.tsx", "utf8");

test("component deletion is full-admin, exact, audited and withdraws student visibility", () => {
  assert.match(migration, /is_full_admin\(v_actor\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /cf11_open_revocation_ticket/);
  assert.match(migration, /DELETE FROM public\.lesson_capability_lifecycle/);
  assert.match(migration, /archived_at = now\(\)/);
  assert.match(migration, /student_can_see_this_component', false/);
  assert.match(migration, /admin_lesson_component_delete/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon/);
});

test("all seven components expose the same simple full-admin delete action", () => {
  assert.match(workspace, /حذف المكوّن/);
  for (const capability of [
    "officialBookContent",
    "tamkeenExplanationHtml",
    "lessonSummaryHtml",
    "mindMapHtml",
    "labExperimentHtml",
    "officialBookQuestions",
    "selfTest",
  ])
    assert.ok(lessonRoute.includes(`"${capability}"`), `missing ${capability}`);
  assert.match(lessonRoute, /window\.confirm/);
  assert.match(lessonRoute, /admin_delete_lesson_component/);
});

test("legacy interactive-resource removal uses the controlled component RPC", () => {
  assert.match(resourceDialog, /item\.resource_type === "mindmap"/);
  assert.match(resourceDialog, /admin_delete_lesson_component/);
  assert.match(resourceDialog, /directIds/);
});

test("lesson deletion is immediately available for blocked test lessons and covers V2 ledgers", () => {
  assert.match(curriculumDialog, /preview\s*&&\s*!preview\.deletable/);
  assert.match(curriculumDialog, /حذف نهائي/);
  assert.doesNotMatch(curriculumDialog, /blocked &&/);
  assert.match(migration, /lesson_component_publications_v2/);
  assert.match(migration, /lesson_component_intakes_v2/);
  assert.match(migration, /golden_lesson_component_publications/);
  assert.match(migration, /v2_aware/);
});
