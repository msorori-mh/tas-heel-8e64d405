import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260911030000_academy_admin_reports_settings_closure.sql",
    import.meta.url,
  ),
  "utf8",
);
const reports = await readFile(
  new URL("../../apps/teacher-academy/src/AdminReports.tsx", import.meta.url),
  "utf8",
);
const settings = await readFile(
  new URL("../../apps/teacher-academy/src/AdminSettings.tsx", import.meta.url),
  "utf8",
);
const adminHome = await readFile(
  new URL("../../apps/teacher-academy/src/AdminHome.tsx", import.meta.url),
  "utf8",
);
const api = await readFile(
  new URL("../../apps/teacher-academy/src/lib/academy-api.ts", import.meta.url),
  "utf8",
);

test("settings and audit storage are singleton, RLS-protected and not directly exposed", () => {
  assert.match(migration, /^--[\s\S]*\nbegin;/);
  assert.match(migration, /create table academy\.settings/);
  assert.match(migration, /primary key default 1 check \(id = 1\)/);
  assert.match(migration, /create table academy\.admin_audit_log/);
  assert.match(migration, /alter table academy\.settings enable row level security/);
  assert.match(migration, /alter table academy\.admin_audit_log enable row level security/);
  assert.match(
    migration,
    /revoke all on academy\.settings, academy\.admin_audit_log from public, anon, authenticated/,
  );
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on\s+academy\./i);
  assert.match(migration, /commit;\s*$/);
});

test("reports are progress-gated, accept a bounded date range and expose no direct tables", () => {
  for (const functionName of ["admin_report_programs", "admin_report_lesson_engagement"]) {
    const start = migration.indexOf(`create or replace function academy.${functionName}`);
    assert.notEqual(start, -1);
    const next = migration.indexOf("create or replace function academy.", start + 1);
    const body = migration.slice(start, next === -1 ? undefined : next);
    assert.match(body, /ACADEMY_PROGRESS_VIEW_REQUIRED/);
    assert.match(body, /p_from is not null and p_to is not null and p_from > p_to/);
    assert.match(body, /INVALID_REPORT_DATE_RANGE/);
  }
  assert.match(api, /rpc\("admin_report_programs"/);
  assert.match(api, /rpc\("admin_report_lesson_engagement"/);
  assert.match(reports, /تاريخ التسجيل/);
  assert.match(reports, /academy-program-report\.csv/);
  assert.match(reports, /academy-lesson-engagement\.csv/);
  assert.match(reports, /ليس حكمًا نهائيًا/);
});

test("admin capability management blocks self lockout and preserves a catalog manager", () => {
  const body = migration.match(
    /create or replace function academy\.admin_set_user_capabilities[\s\S]*?create or replace function academy\.admin_list_audit_log/,
  )?.[0];
  assert.ok(body);
  assert.match(body, /ACADEMY_CATALOG_MANAGE_REQUIRED/);
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /ACADEMY_ADMIN_SELF_LOCKOUT_BLOCKED/);
  assert.match(body, /ACADEMY_LAST_CATALOG_MANAGER_REQUIRED/);
  assert.match(body, /INVALID_ACADEMY_CAPABILITY/);
  assert.match(settings, /لا يمكنك سحب صلاحية إدارة الأكاديمية من حسابك الحالي/);
  assert.match(settings, /يجب أن يبقى مسؤول واحد على الأقل/);
});

test("important future admin mutations are captured by append-only audit triggers", () => {
  for (const action of [
    "SETTINGS_UPDATED",
    "CAPABILITY_GRANTED",
    "CAPABILITY_REVOKED",
    "PROGRAM_PUBLISHED",
    "PROGRAM_DRAFT_DELETED",
    "PROGRAM_ARCHIVED",
    "TEACHER_STATUS_UPDATED",
    "CERTIFICATE_REVOKED",
    "LIVE_SESSION_CREATED",
  ]) {
    assert.match(migration, new RegExp(`'${action}'`));
  }
  assert.match(migration, /create trigger academy_settings_admin_audit/);
  assert.match(migration, /create trigger academy_program_versions_admin_audit/);
  assert.match(migration, /create trigger academy_live_sessions_admin_audit/);
  assert.match(settings, /لا يمكن تعديلها أو حذفها/);
});

test("the generic audit trigger branches by table before reading dynamic OLD or NEW fields", () => {
  const body = migration.match(
    /create or replace function academy\.capture_admin_audit_event[\s\S]*?create trigger academy_settings_admin_audit/,
  )?.[0];
  assert.ok(body);
  assert.match(body, /if tg_table_name = 'settings' then/);
  assert.match(body, /elsif tg_table_name = 'capability_grants' then/);
  assert.match(body, /elsif tg_table_name = 'program_versions' then/);
  assert.doesNotMatch(
    body,
    /tg_table_name = 'capability_grants'\s+and[\s\S]{0,120}old\.revoked_at/,
  );
  assert.doesNotMatch(body, /tg_table_name = 'program_versions'\s+and[\s\S]{0,120}old\.status/);
});

test("admin navigation exposes reports and settings only through matching capabilities", () => {
  assert.match(adminHome, /id: "reports"[\s\S]*ACADEMY_PROGRESS_VIEW/);
  assert.match(adminHome, /id: "settings"[\s\S]*ACADEMY_CATALOG_MANAGE/);
  assert.match(adminHome, /<AdminReports \/>/);
  assert.match(adminHome, /<AdminSettings \/>/);
  assert.match(settings, /adminUpdateSettings/);
  assert.match(settings, /adminSetUserCapabilities/);
});

test("saved defaults flow into new programs, assessments and live sessions", () => {
  assert.match(adminHome, /adminGetSettings\(\)/);
  assert.match(adminHome, /defaultMinutes={operationSettings\.default_program_minutes}/);
  assert.match(adminHome, /defaultPassPercentage={operationSettings\.default_pass_percentage}/);
  assert.match(adminHome, /defaultProvider={operationSettings\.default_live_provider}/);
  assert.match(adminHome, /defaultInstructions={operationSettings\.default_live_instructions}/);
});
