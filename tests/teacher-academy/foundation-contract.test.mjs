import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260830020000_teacher_academy_mvp_foundation.sql",
  import.meta.url,
);
const appPath = new URL("../../apps/teacher-academy/src/App.tsx", import.meta.url);
const configPath = new URL("../../supabase/config.toml", import.meta.url);
const packagePath = new URL("../../package.json", import.meta.url);
const redirectsPath = new URL("../../apps/teacher-academy/public/_redirects", import.meta.url);

const [migration, app, config, packageSource, redirects] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(configPath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(redirectsPath, "utf8"),
]);

test("academy is a separately exposed API schema and separate build", () => {
  assert.match(config, /schemas\s*=\s*\[[^\]]*"academy"/);
  assert.match(migration, /create schema if not exists academy;/i);

  const packageJson = JSON.parse(packageSource);
  assert.equal(
    packageJson.scripts["academy:build"],
    "vite build --config apps/teacher-academy/vite.config.ts",
  );
  assert.equal(redirects.trim(), "/* /index.html 200");
});

test("teacher profile requires exactly the MVP professional identity fields", () => {
  for (const column of [
    "full_name text not null",
    "primary_subject_id uuid not null",
    "governorate_id uuid not null",
    "school_name text not null",
    "phone text not null",
  ]) {
    assert.ok(migration.includes(column), `missing required column: ${column}`);
  }

  assert.match(migration, /status text not null default 'ACTIVE'/);
  assert.match(app, /جميع الحقول التالية\s*إلزامية/);
  assert.match(app, /لا تحتاج إلى دعوة أو موافقة مسبقة/);
});

test("academy does not mutate student role or student profile authorization", () => {
  assert.doesNotMatch(migration, /alter\s+type\s+public\.app_role/i);
  assert.doesNotMatch(
    migration,
    /(?:insert|update|delete|alter)\s+(?:into\s+)?public\.user_roles/i,
  );
  assert.doesNotMatch(migration, /(?:insert|update|delete|alter)\s+(?:into\s+)?public\.profiles/i);
  assert.match(migration, /academy\.capability_grants/);
});

test("all academy tables are RLS-protected and anonymous access is revoked", () => {
  const tables = [
    "subjects",
    "teacher_profiles",
    "capability_grants",
    "programs",
    "program_versions",
    "program_version_subjects",
    "enrollments",
  ];

  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(`alter table academy\\.${table} enable row level security`, "i"),
    );
  }

  assert.match(
    migration,
    /revoke all on all tables in schema academy from public, anon, authenticated/i,
  );
  assert.doesNotMatch(migration, /grant\s+[^;]+\s+to\s+anon/i);
});

test("catalog visibility is enforced server-side by active profile and primary subject", () => {
  assert.match(migration, /create or replace function academy\.list_visible_programs\(\)/i);
  assert.match(migration, /profiles\.user_id = auth\.uid\(\)/);
  assert.match(migration, /profiles\.status = 'ACTIVE'/);
  assert.match(migration, /targets\.subject_id = profiles\.primary_subject_id/);
  assert.match(migration, /versions\.audience_type = 'ALL_TEACHERS'/);
  assert.match(migration, /versions\.audience_type = 'SUBJECT_SPECIFIC'/);

  assert.match(migration, /create or replace function academy\.self_enroll/i);
  assert.match(migration, /PROGRAM_NOT_VISIBLE/);
});

test("only immutable published versions can be surfaced", () => {
  assert.match(migration, /programs\.current_published_version_id/);
  assert.match(migration, /versions\.status = 'PUBLISHED'/);
  assert.match(migration, /PUBLISHED_PROGRAM_VERSION_IS_IMMUTABLE/);
  assert.match(migration, /PUBLISHED_PROGRAM_TARGETS_ARE_IMMUTABLE/);
  assert.match(migration, /SUBJECT_TARGET_REQUIRED/);
});

test("foundation version trigger handles DELETE before reading NEW", () => {
  const start = migration.indexOf("function academy.protect_published_program_version");
  const end = migration.indexOf(
    "create trigger academy_program_versions_immutable_after_publish",
    start,
  );
  const trigger = migration.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.ok(
    trigger.indexOf("if tg_op = 'DELETE'") < trigger.indexOf("if new.status = 'PUBLISHED'"),
  );
});

test("self profile writes cannot update account status", () => {
  const updateGrant = migration.match(
    /grant update \(([^)]+)\)\s+on academy\.teacher_profiles to authenticated;/i,
  );
  assert.ok(updateGrant);
  assert.doesNotMatch(updateGrant[1], /status/i);
  assert.match(migration, /with check \(user_id = auth\.uid\(\)\);/);
});

test("academy admin operations require independent academy capabilities", () => {
  const capabilityGuards = [
    ["admin_create_program", "ACADEMY_CATALOG_MANAGE"],
    ["admin_update_draft_program", "ACADEMY_CATALOG_MANAGE"],
    ["admin_publish_program", "ACADEMY_CATALOG_MANAGE"],
    ["admin_list_teachers", "ACADEMY_TEACHERS_VIEW"],
    ["admin_set_teacher_status", "ACADEMY_TEACHERS_VIEW"],
  ];

  for (const [functionName, capability] of capabilityGuards) {
    const start = migration.indexOf(`function academy.${functionName}`);
    assert.notEqual(start, -1, `missing ${functionName}`);
    const body = migration.slice(start, start + 5000);
    assert.ok(body.includes(capability), `${functionName} does not require ${capability}`);
  }
});

test("academy administrators do not need a teacher profile to open administration", () => {
  assert.match(app, /if \(!profile && capabilities\.size === 0\)/);
  assert.match(app, /hasTeacherAccess \? "catalog" : "admin"/);
  assert.match(app, /profile: TeacherProfile \| null/);
  assert.doesNotMatch(app, /if \(!profile\) return <ProfileForm/);
});

test("program technical identifier is generated by the server", () => {
  assert.match(migration, /'program-' \|\| left\(replace\(gen_random_uuid\(\)::text/);
  assert.doesNotMatch(app, /اسم تقني|رمز البرنامج|program slug/i);
});
