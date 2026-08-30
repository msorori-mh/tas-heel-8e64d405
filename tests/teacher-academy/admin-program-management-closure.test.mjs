import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260911020000_academy_admin_program_management_closure.sql",
    import.meta.url,
  ),
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
const validator = await readFile(
  new URL("../../apps/teacher-academy/src/lib/program-bundle.ts", import.meta.url),
  "utf8",
);

test("migration is atomic and exposes readiness metrics through an admin-only RPC", () => {
  assert.match(migration, /^--[\s\S]*\nbegin;/);
  assert.match(migration, /create or replace function academy\.admin_list_programs_v3\(\)/);
  for (const metric of [
    "structured_lesson_count",
    "lesson_minutes",
    "assessment_pass_percentage",
    "live_session_count",
  ]) {
    assert.match(migration, new RegExp(`\\b${metric}\\b`));
  }
  assert.match(migration, /where academy\.i_have_capability\('ACADEMY_CATALOG_MANAGE'\)/);
  assert.match(
    migration,
    /grant execute on function academy\.admin_list_programs_v3\(\) to authenticated/,
  );
  assert.match(migration, /commit;\s*$/);
});

test("bundle import is one fail-closed draft transaction and never publishes", () => {
  const body = migration.match(
    /create or replace function academy\.admin_import_program_bundle[\s\S]*?revoke all on function academy\.admin_list_programs_v3/,
  )?.[0];
  assert.ok(body);
  assert.match(body, /ACADEMY_CATALOG_MANAGE_REQUIRED/);
  assert.match(body, /jsonb_array_length\(p_bundle->'lessons'\) not between 1 and 100/);
  assert.match(body, /ACADEMY_IMPORT_PROGRAM_ALREADY_EXISTS/);
  assert.match(body, /academy\.admin_create_program_v2/);
  assert.match(body, /academy\.admin_save_structured_lesson/);
  assert.match(body, /academy\.admin_save_assessment/);
  assert.match(body, /academy\.admin_add_assessment_question/);
  assert.match(body, /academy\.admin_validate_program/);
  assert.doesNotMatch(body, /admin_publish_program/);
  assert.doesNotMatch(body, /admin_save_live_session/);
});

test("lesson ordering requires the exact draft lesson set and preserves unique order keys", () => {
  const body = migration.match(
    /create or replace function academy\.admin_reorder_lessons[\s\S]*?create or replace function academy\.admin_delete_draft_version/,
  )?.[0];
  assert.ok(body);
  assert.match(body, /versions\.status = 'DRAFT'/);
  assert.match(body, /count\(distinct lesson_id\)/);
  assert.match(body, /LESSON_ORDER_MUST_BE_EXACT/);
  assert.match(body, /display_order = lessons\.display_order \+ 1000000/);
  assert.match(body, /with ordinality requested\(lesson_id, ordinality\)/);
});

test("draft deletion refuses published or learning-linked versions and deletes children explicitly", () => {
  const body = migration.match(
    /create or replace function academy\.admin_delete_draft_version[\s\S]*?create or replace function academy\.admin_import_program_bundle/,
  )?.[0];
  assert.ok(body);
  assert.match(body, /versions\.status = 'DRAFT'/);
  assert.match(body, /current_published_version_id = p_program_version_id/);
  assert.match(body, /DRAFT_PROGRAM_HAS_LEARNING_RECORDS/);
  assert.match(body, /delete from academy\.assessment_questions/);
  assert.match(body, /delete from academy\.lesson_sections/);
  assert.match(body, /delete from academy\.program_versions/);
  assert.match(body, /programs\.current_published_version_id is null/);
});

test("new RPCs are execute-only for authenticated users and avoid unsafe bypasses", () => {
  for (const signature of [
    "admin_reorder_lessons\\(uuid, uuid\\[\\]\\)",
    "admin_delete_draft_version\\(uuid\\)",
    "admin_import_program_bundle\\(jsonb\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function academy\\.${signature} from public, anon, authenticated`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function academy\\.${signature} to authenticated`),
    );
  }
  assert.doesNotMatch(migration, /session_replication_role/i);
  assert.doesNotMatch(migration, /disable\s+trigger/i);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on\s+academy\./i);
});

test("admin API uses RPC boundaries and has a deployment-safe v3-to-v2 read fallback", () => {
  assert.match(api, /rpc\("admin_list_programs_v3"\)/);
  assert.match(api, /current\.error\.code === "PGRST202"/);
  assert.match(api, /rpc\("admin_list_programs_v2"\)/);
  assert.match(api, /rpc\("admin_import_program_bundle"/);
  assert.match(api, /rpc\("admin_reorder_lessons"/);
  assert.match(api, /rpc\("admin_delete_draft_version"/);
  assert.doesNotMatch(api, /from\("program_versions"\).*\.(insert|update|delete)/s);
});

test("admin program UI closes creation, discovery, readiness, ordering, import and deletion paths", () => {
  assert.match(adminHome, /className="admin-form program-wizard"/);
  assert.match(adminHome, /البيانات الأساسية/);
  assert.match(adminHome, /التفاصيل والأهداف/);
  assert.match(adminHome, /الجمهور والمراجعة/);
  assert.match(adminHome, /استيراد JSON/);
  assert.match(adminHome, /validateProgramImportBundle/);
  assert.match(adminHome, /className="filter-grid program-filter-grid"/);
  assert.match(adminHome, /اكتمال الإعداد/);
  assert.match(adminHome, /adminReorderLessons/);
  assert.match(adminHome, /حذف المسودة/);
  assert.match(adminHome, /مراحل إعداد محتوى البرنامج/);
});

test("client validator mirrors critical server bundle limits before upload", () => {
  assert.match(validator, /root\.lessons\.length < 1 \|\| root\.lessons\.length > 100/);
  assert.match(validator, /question\.options\.length !== 4/);
  assert.match(validator, /activeSubjectCodes\.has\(subjectCode\)/);
  assert.match(
    validator,
    /"objective"[\s\S]*"introduction"[\s\S]*"content"[\s\S]*"example"[\s\S]*"activity"[\s\S]*"summary"/,
  );
  assert.match(validator, /estimatedMinutes[\s\S]*100_000/);
});
