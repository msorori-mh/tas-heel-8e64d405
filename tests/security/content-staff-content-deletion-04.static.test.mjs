import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260911020000_content_staff_content_deletion.sql",
  "utf8",
);
const lessonRoute = readFileSync(
  "src/routes/_authenticated/admin.lesson-content.$lessonId.tsx",
  "utf8",
);
const curriculumDialog = readFileSync("src/components/admin/CurriculumDeleteDialog.tsx", "utf8");

test("content managers receive only audited content deletion RPCs", () => {
  assert.match(migration, /NOT public\.is_content_staff\(v_actor\)/);
  assert.match(migration, /NOT public\.is_content_staff\(auth\.uid\(\)\)/);
  assert.match(migration, /CONTENT_DELETE_COMPONENT_GATE_DRIFT/);
  assert.match(migration, /CONTENT_DELETE_CURRICULUM_GATE_DRIFT/);
  assert.match(migration, /STUDENT_COMMENTS/);
  assert.match(migration, /STUDENT_QUESTION_NOTES/);
  assert.match(migration, /PRACTICE_ATTEMPTS/);
  assert.doesNotMatch(migration, /to_regprocedure\('public\.admin_curriculum_force_delete/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon/);
});

test("lesson component deletion is visible to all content staff", () => {
  assert.match(lessonRoute, /const \{ isContentStaff \} = useAuth\(\)/);
  assert.match(lessonRoute, /if \(!isContentStaff\) return/);
  assert.match(lessonRoute, /onDelete=\{[\s\S]*isContentStaff/);
});

test("ordinary unit and lesson cascade deletion is enabled for content staff", () => {
  assert.match(curriculumDialog, /const \{ isAdmin, isContentStaff \} = useAuth\(\)/);
  assert.match(curriculumDialog, /disabled=\{!isContentStaff \|\| !preview\?\.deletable/);
  assert.match(curriculumDialog, /\{isAdmin &&[\s\S]*حذف نهائي/);
  assert.match(curriculumDialog, /قد يحذف نشاطاً طلابياً/);
});
