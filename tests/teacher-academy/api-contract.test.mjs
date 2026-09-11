import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiPath = new URL("../../apps/teacher-academy/src/lib/academy-api.ts", import.meta.url);
const migrationPaths = [
  "../../supabase/migrations/20260830020000_teacher_academy_mvp_foundation.sql",
  "../../supabase/migrations/20260830030000_teacher_academy_mvp_learning.sql",
  "../../supabase/migrations/20260830040000_teacher_academy_mvp_assessment_certificates.sql",
  "../../supabase/migrations/20260830100000_teacher_academy_admin_operational_closure.sql",
  "../../supabase/migrations/20260830110000_academy_program_details_structured_learning_live_sessions.sql",
  "../../supabase/migrations/20260911020000_academy_admin_program_management_closure.sql",
  "../../supabase/migrations/20260911030000_academy_admin_reports_settings_closure.sql",
  "../../supabase/migrations/20260911040000_academy_google_only_teacher_portal.sql",
  "../../supabase/migrations/20260916010000_academy_teacher_profile_save_rpc.sql",
  "../../supabase/migrations/20260911171430_school_directory_review.sql",
].map((path) => new URL(path, import.meta.url));

const [api, ...migrations] = await Promise.all([
  readFile(apiPath, "utf8"),
  ...migrationPaths.map((path) => readFile(path, "utf8")),
]);
const database = migrations.join("\n");

test("every academy RPC used by the client exists in the database contract", () => {
  const rpcNames = [...api.matchAll(/academySupabase\.rpc\("([a-z0-9_]+)"/g)].map(
    (match) => match[1],
  );

  assert.ok(rpcNames.length > 0);
  assert.equal(new Set(rpcNames).size, rpcNames.length, "duplicate client RPC invocation");

  for (const rpcName of rpcNames) {
    assert.match(
      database,
      new RegExp(`create(?: or replace)? function academy\\.${rpcName}\\s*\\(`, "i"),
      `missing database function for client RPC ${rpcName}`,
    );
  }
});

test("the client uses direct table access only for safe profile setup reads and writes", () => {
  const academyTables = [...api.matchAll(/\.from\("([a-z0-9_]+)"\)/g)].map((match) => match[1]);

  assert.deepEqual([...new Set(academyTables)].sort(), [
    "governorates",
    "subjects",
    "teacher_profiles",
  ]);
  assert.doesNotMatch(api, /\.from\("(?:assessment_questions|certificates|enrollments|lessons)"\)/);
});

test("teacher profile creation and updates use the guarded Google-only RPC", () => {
  const saveProfile = api.match(
    /export async function saveTeacherProfile[\s\S]*?export async function loadVisiblePrograms/,
  )?.[0];

  assert.ok(saveProfile);
  assert.match(saveProfile, /auth\.getSession\(\)/);
  assert.match(saveProfile, /session\.user\.id !== user\.id/);
  assert.match(saveProfile, /academySupabase\.rpc\("save_my_teacher_profile_with_school"/);
  assert.doesNotMatch(saveProfile, /\.from\("teacher_profiles"\)\.(?:insert|update|upsert)/);
  assert.match(database, /function academy\.save_my_teacher_profile/);
  assert.match(database, /v_actor uuid := auth\.uid\(\)/);
  assert.match(database, /not academy\.i_have_google_identity\(\)/);
  assert.match(database, /on conflict \(user_id\) do update/);
  assert.doesNotMatch(
    database.match(/function academy\.save_my_teacher_profile[\s\S]*?commit;/)?.[0] ?? "",
    /status\s*=\s*excluded\.status/,
  );
});
