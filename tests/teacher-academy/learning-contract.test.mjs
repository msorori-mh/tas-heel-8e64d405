import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260830030000_teacher_academy_mvp_learning.sql",
  import.meta.url,
);
const apiPath = new URL("../../apps/teacher-academy/src/lib/academy-api.ts", import.meta.url);
const adminPath = new URL("../../apps/teacher-academy/src/AdminHome.tsx", import.meta.url);

const [migration, api, admin] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(apiPath, "utf8"),
  readFile(adminPath, "utf8"),
]);

test("learning tables are isolated, RLS-protected, and have no direct client grants", () => {
  for (const table of ["courses", "modules", "lessons", "lesson_progress"]) {
    assert.match(
      migration,
      new RegExp(`alter table academy\\.${table} enable row level security`, "i"),
    );
  }
  assert.match(
    migration,
    /revoke all on academy\.courses, academy\.modules, academy\.lessons, academy\.lesson_progress\s+from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke all on all functions in schema academy from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:select|insert|update|delete)[^;]+academy\.(?:courses|modules|lessons|lesson_progress)/i,
  );
});

test("published content is immutable and publishing requires a lesson", () => {
  assert.match(migration, /PUBLISHED_ACADEMY_CONTENT_IS_IMMUTABLE/);
  assert.match(migration, /PROGRAM_LESSON_REQUIRED/);
  assert.match(migration, /versions\.status = 'DRAFT'/);
  assert.match(migration, /create trigger academy_lessons_require_draft/);
  assert.match(
    migration,
    /courses\.id = case when tg_op = 'DELETE' then old\.course_id else new\.course_id end/,
  );
});

test("learning version trigger handles DELETE before reading NEW", () => {
  const start = migration.indexOf("function academy.protect_published_program_version");
  const end = migration.indexOf("function academy.admin_list_lessons", start);
  const trigger = migration.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.ok(
    trigger.indexOf("if tg_op = 'DELETE'") < trigger.indexOf("if new.status = 'PUBLISHED'"),
  );
});

test("lesson resources are HTTPS-only and text is stored as plain content", () => {
  assert.match(migration, /resource_url ~ '\^https:\/\/'/);
  assert.match(migration, /lesson_type in \('TEXT', 'VIDEO', 'LINK'\)/);
  assert.doesNotMatch(admin, /dangerouslySetInnerHTML/);
});

test("admin content functions require catalog capability", () => {
  for (const functionName of ["admin_list_lessons", "admin_add_lesson", "admin_delete_lesson"]) {
    const start = migration.indexOf(`function academy.${functionName}`);
    assert.notEqual(start, -1, `missing ${functionName}`);
    assert.ok(
      migration.slice(start, start + 5000).includes("ACADEMY_CATALOG_MANAGE"),
      `${functionName} is missing the capability guard`,
    );
  }
});

test("student learning data is returned only for auth.uid active enrollments", () => {
  for (const functionName of ["list_my_learning", "get_learning_lessons", "complete_lesson"]) {
    const start = migration.indexOf(`function academy.${functionName}`);
    assert.notEqual(start, -1, `missing ${functionName}`);
    const body = migration.slice(start, start + 5000);
    assert.match(body, /enrollments\.user_id = auth\.uid\(\)/);
    assert.match(body, /profiles\.status = 'ACTIVE'/);
  }
  assert.match(api, /completeLearningLesson/);
});
