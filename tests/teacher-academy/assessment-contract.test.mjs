import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260830040000_teacher_academy_mvp_assessment_certificates.sql",
  import.meta.url,
);
const appPath = new URL("../../apps/teacher-academy/src/App.tsx", import.meta.url);
const adminPath = new URL("../../apps/teacher-academy/src/AdminHome.tsx", import.meta.url);
const supabasePath = new URL("../../apps/teacher-academy/src/lib/supabase.ts", import.meta.url);

const [migration, app, admin, supabase] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(adminPath, "utf8"),
  readFile(supabasePath, "utf8"),
]);

test("program version trigger handles DELETE before reading NEW", () => {
  const start = migration.indexOf("function academy.protect_published_program_version");
  const end = migration.indexOf("function academy.admin_get_assessment", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const trigger = migration.slice(start, end);
  assert.ok(
    trigger.indexOf("if tg_op = 'DELETE'") < trigger.indexOf("if new.status = 'PUBLISHED'"),
    "DELETE must return OLD before the trigger reads NEW",
  );
});

test("assessment submit handler calls the server exactly once", () => {
  assert.equal(app.match(/submitAssessment\(programVersionId, answers\)/g)?.length, 1);
});

test("assessment and certificate tables are RLS-protected without client table writes", () => {
  for (const table of [
    "assessments",
    "assessment_questions",
    "assessment_attempts",
    "certificates",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table academy\\.${table} enable row level security`, "i"),
    );
  }
  assert.match(
    migration,
    /revoke all on academy\.assessments, academy\.assessment_questions,\s+academy\.assessment_attempts, academy\.certificates\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:select|insert|update|delete)[^;]+academy\.(?:assessments|assessment_questions|assessment_attempts|certificates)/i,
  );
  assert.match(
    migration,
    /revoke all on all functions in schema academy from public, anon, authenticated/i,
  );
});

test("student assessment never returns the correct option", () => {
  const start = migration.indexOf("function academy.get_assessment");
  const end = migration.indexOf("function academy.submit_assessment", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const studentFunction = migration.slice(start, end);
  assert.doesNotMatch(studentFunction, /correct_option/);
  assert.match(migration, /function academy\.admin_get_assessment/);
  assert.match(migration, /questions\.correct_option/);
});

test("server validates every answer and scores against stored correct options", () => {
  const start = migration.indexOf("function academy.submit_assessment");
  assert.notEqual(start, -1);
  const body = migration.slice(start, start + 9000);
  assert.match(body, /COMPLETE_LESSONS_BEFORE_ASSESSMENT/);
  assert.match(body, /ALL_VALID_ANSWERS_REQUIRED/);
  assert.match(body, /answer\.value not in \('a', 'b', 'c', 'd'\)/);
  assert.match(body, /questions\.correct_option/);
  assert.match(body, /profiles\.status = 'ACTIVE'/);
  assert.match(body, /enrollments\.user_id = auth\.uid\(\)/);
});

test("assessment answer count uses PostgreSQL-supported JSONB key enumeration", () => {
  assert.doesNotMatch(migration, /jsonb_object_length/);
  assert.match(migration, /select count\(\*\) from jsonb_object_keys\(p_answers\)/);
});

test("certificate is issued only on a passing result with an unguessable code", () => {
  assert.match(migration, /if v_passed then/);
  assert.match(
    migration,
    /'TAM-' \|\| upper\(left\(replace\(gen_random_uuid\(\)::text, '-', ''\), 20\)\)/,
  );
  assert.match(migration, /enrollment_id uuid not null unique/);
  assert.match(
    migration,
    /on conflict \(enrollment_id\) do update set enrollment_id = excluded\.enrollment_id/,
  );
});

test("public verification is RPC-only and exposes minimal fields", () => {
  assert.match(migration, /grant usage on schema academy to anon/);
  assert.match(
    migration,
    /grant execute on function academy\.verify_certificate\(text\) to anon, authenticated/,
  );
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)[^;]+to anon/i);
  const start = migration.indexOf("function academy.verify_certificate");
  const end = migration.indexOf("function academy.admin_list_progress", start);
  const body = migration.slice(start, end);
  assert.match(body, /teacher_name text/);
  assert.match(body, /program_title text/);
  assert.doesNotMatch(body, /phone|school_name|governorate_id/);
});

test("publishing requires lessons and at least one assessment question", () => {
  assert.match(migration, /PROGRAM_LESSON_REQUIRED/);
  assert.match(migration, /PROGRAM_ASSESSMENT_QUESTION_REQUIRED/);
});

test("academy admin assessment and progress operations have independent guards", () => {
  const guards = [
    ["admin_get_assessment", "ACADEMY_CATALOG_MANAGE"],
    ["admin_save_assessment", "ACADEMY_CATALOG_MANAGE"],
    ["admin_add_assessment_question", "ACADEMY_CATALOG_MANAGE"],
    ["admin_delete_assessment_question", "ACADEMY_CATALOG_MANAGE"],
    ["admin_list_progress", "ACADEMY_PROGRESS_VIEW"],
    ["admin_revoke_certificate", "ACADEMY_PROGRESS_VIEW"],
  ];
  for (const [functionName, capability] of guards) {
    const start = migration.indexOf(`function academy.${functionName}`);
    assert.notEqual(start, -1, `missing ${functionName}`);
    assert.ok(
      migration.slice(start, start + 6000).includes(capability),
      `${functionName} is missing ${capability}`,
    );
  }
});

test("MVP UI includes assessment, certificates, verification, and progress administration", () => {
  assert.match(app, /function AssessmentPanel/);
  assert.match(app, /function Certificates/);
  assert.match(app, /function VerifyCertificatePage/);
  assert.match(admin, /function ProgressAdmin/);
  assert.match(admin, /AssessmentEditor/);
});

test("production academy is fail-closed behind an explicit feature flag", () => {
  assert.match(supabase, /import\.meta\.env\.PROD/);
  assert.match(supabase, /featureFlag === "true"/);
  assert.match(app, /if \(!academyFeatureEnabled\) return <AcademyUnavailable/);
});
