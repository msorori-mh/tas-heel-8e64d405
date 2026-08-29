import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiPath = new URL("../../apps/teacher-academy/src/lib/academy-api.ts", import.meta.url);
const migrationPaths = [
  "../../supabase/migrations/20260830020000_teacher_academy_mvp_foundation.sql",
  "../../supabase/migrations/20260830030000_teacher_academy_mvp_learning.sql",
  "../../supabase/migrations/20260830040000_teacher_academy_mvp_assessment_certificates.sql",
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
      new RegExp(`create or replace function academy\\.${rpcName}\\s*\\(`, "i"),
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
