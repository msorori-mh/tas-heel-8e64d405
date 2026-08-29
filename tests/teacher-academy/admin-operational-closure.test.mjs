import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260830100000_teacher_academy_admin_operational_closure.sql",
  import.meta.url,
);
const adminPath = new URL("../../apps/teacher-academy/src/AdminHome.tsx", import.meta.url);
const assessmentPath = new URL(
  "../../apps/teacher-academy/src/AssessmentEditor.tsx",
  import.meta.url,
);
const apiPath = new URL("../../apps/teacher-academy/src/lib/academy-api.ts", import.meta.url);

const [migration, admin, assessment, api] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(adminPath, "utf8"),
  readFile(assessmentPath, "utf8"),
  readFile(apiPath, "utf8"),
]);

test("new administration RPCs remain capability guarded and RPC-only", () => {
  const functions = [
    "admin_list_programs_v2",
    "admin_create_draft_version",
    "admin_validate_program",
    "admin_set_program_archived",
    "admin_update_lesson",
    "admin_update_assessment_question",
  ];

  for (const functionName of functions) {
    const start = migration.indexOf(`function academy.${functionName}`);
    assert.notEqual(start, -1, `missing ${functionName}`);
    const body = migration.slice(start, start + 10000);
    assert.match(body, /ACADEMY_CATALOG_MANAGE/);
    assert.match(
      migration,
      new RegExp(
        `revoke all on function academy\\.${functionName}\\([^;]*from public, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function academy\\.${functionName}\\(`, "i"),
    );
  }

  assert.doesNotMatch(
    api,
    /\.from\("(?:programs|program_versions|lessons|assessment_questions)"\)/,
  );
});

test("published program cloning copies content and assessment without learning records", () => {
  const start = migration.indexOf("function academy.admin_create_draft_version");
  const end = migration.indexOf("function academy.admin_validate_program", start);
  const body = migration.slice(start, end);

  assert.match(body, /versions\.status = 'DRAFT'/);
  assert.match(body, /insert into academy\.program_versions/);
  assert.match(body, /insert into academy\.program_version_subjects/);
  assert.match(body, /insert into academy\.courses/);
  assert.match(body, /insert into academy\.modules/);
  assert.match(body, /insert into academy\.lessons/);
  assert.match(body, /insert into academy\.assessments/);
  assert.match(body, /insert into academy\.assessment_questions/);
  assert.doesNotMatch(
    body,
    /insert into academy\.(?:enrollments|lesson_progress|assessment_attempts|certificates)/,
  );
});

test("server validation proves every publish prerequisite independently", () => {
  const start = migration.indexOf("function academy.admin_validate_program");
  const end = migration.indexOf("function academy.admin_set_program_archived", start);
  const body = migration.slice(start, end);

  for (const check of ["DRAFT_VERSION", "AUDIENCE", "LESSONS", "ASSESSMENT"]) {
    assert.match(body, new RegExp(`'${check}'`));
  }
  assert.match(body, /v_lesson_count > 0/);
  assert.match(body, /v_question_count > 0/);
});

test("admin UI closes draft, validation, publish, versioning, and preview paths", () => {
  assert.match(admin, /adminCreateDraftVersion/);
  assert.match(admin, /adminUpdateDraftProgram/);
  assert.match(admin, /adminValidateProgram/);
  assert.match(admin, /فحص الجاهزية/);
  assert.match(admin, /نشر الإصدار/);
  assert.match(admin, /معاينة المحتوى/);
  assert.match(admin, /adminSetProgramArchived/);
  assert.match(admin, /adminUpdateLesson/);
  assert.match(assessment, /adminUpdateAssessmentQuestion/);
  assert.match(assessment, /readOnly/);
});

test("operational overview, filters, exports, and accessible tabs are present", () => {
  assert.match(admin, /function AdminOverview/);
  assert.match(admin, /نسبة إكمال التسجيلات/);
  assert.match(admin, /function downloadCsv/);
  assert.match(admin, /academy-teachers\.csv/);
  assert.match(admin, /academy-progress\.csv/);
  assert.match(admin, /role="tab"/);
  assert.match(admin, /aria-selected=/);
  assert.match(admin, /role="tabpanel"/);
});
