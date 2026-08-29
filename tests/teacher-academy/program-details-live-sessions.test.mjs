import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260830110000_academy_program_details_structured_learning_live_sessions.sql",
  import.meta.url,
);
const appPath = new URL("../../apps/teacher-academy/src/App.tsx", import.meta.url);
const adminPath = new URL("../../apps/teacher-academy/src/AdminHome.tsx", import.meta.url);
const apiPath = new URL("../../apps/teacher-academy/src/lib/academy-api.ts", import.meta.url);

const [migration, app, admin, api] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(adminPath, "utf8"),
  readFile(apiPath, "utf8"),
]);

test("program metadata is versioned, immutable after publish, and visible to teachers", () => {
  assert.match(migration, /create table academy\.program_version_details/);
  assert.match(migration, /PUBLISHED_PROGRAM_DETAILS_ARE_IMMUTABLE/);
  assert.match(migration, /detailed_description text/);
  assert.match(migration, /objectives text\[\]/);
  assert.match(migration, /prerequisites text\[\]/);
  assert.match(migration, /instructions text\[\]/);
  assert.match(app, /عن البرنامج/);
  assert.match(app, /أهداف البرنامج/);
  assert.match(app, /تعليمات الدراسة/);
});

test("a subject-specific version targets exactly one active subject", () => {
  assert.match(migration, /academy_program_version_one_subject_uq/);
  assert.match(migration, /EXACTLY_ONE_SUBJECT_REQUIRED/);
  assert.match(migration, /p_subject_id uuid/);
  assert.match(admin, /اختر مادة واحدة/);
  assert.doesNotMatch(admin, /مواد محددة/);
});

test("structured lessons require objective, content, and summary sections", () => {
  assert.match(migration, /create table academy\.lesson_sections/);
  for (const sectionType of [
    "OBJECTIVE",
    "CONTENT",
    "EXAMPLE",
    "ACTIVITY",
    "SUMMARY",
    "RESOURCE",
  ]) {
    assert.match(migration, new RegExp(`'${sectionType}'`));
  }
  assert.match(migration, /STRUCTURED_LESSON_SECTIONS_REQUIRED/);
  assert.match(api, /admin_save_structured_lesson/);
  assert.match(admin, /تحريك القسم لأعلى/);
  assert.match(app, /learning-section/);
  assert.doesNotMatch(app, /dangerouslySetInnerHTML/);
});

test("live sessions are provider-neutral, HTTPS-only, and capability guarded", () => {
  assert.match(migration, /create table academy\.live_sessions/);
  assert.match(migration, /meeting_url ~ '\^https:\/\/'/);
  assert.match(migration, /provider_label text/);
  assert.match(migration, /admin_save_live_session/);
  const start = migration.indexOf("function academy.admin_save_live_session");
  assert.notEqual(start, -1);
  assert.match(migration.slice(start, start + 8000), /ACADEMY_CATALOG_MANAGE/);
  assert.match(admin, /Zoom/);
  assert.match(admin, /Google Meet/);
  assert.match(app, /الانضمام للمحاضرة/);
});

test("live-session links are returned only to active teachers who can see or joined the program", () => {
  const start = migration.indexOf("function academy.list_program_live_sessions");
  assert.notEqual(start, -1);
  const body = migration.slice(start, start + 8000);
  assert.match(body, /profiles\.status = 'ACTIVE'/);
  assert.match(body, /enrollments\.user_id = auth\.uid\(\)/);
  assert.match(body, /programs\.current_published_version_id = versions\.id/);
  assert.match(body, /targets\.subject_id = profiles\.primary_subject_id/);
});

test("existing published programs and lessons receive safe structured backfill", () => {
  assert.match(migration, /from academy\.program_versions versions/);
  assert.match(migration, /from academy\.lessons lessons/);
  assert.match(migration, /التدريس الفعّال في المرحلة الثانوية/);
  assert.match(migration, /التهيئة المهنية لاستخدام منصة تمكين/);
});
