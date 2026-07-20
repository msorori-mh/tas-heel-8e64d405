import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260720120000_free_access_content_gates_security_hardening.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

test("preserves both public function signatures and security-definer search paths", () => {
  for (const fn of ["can_access_subject", "can_access_lesson"]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(_[a-z_]+ uuid\\)`));
  }
  assert.equal((sql.match(/SECURITY DEFINER/g) ?? []).length, 2);
  assert.equal((sql.match(/SET search_path TO 'public'/g) ?? []).length, 2);
});

test("denies anonymous calls and narrows execution to authenticated", () => {
  assert.equal((sql.match(/auth\.uid\(\) IS NOT NULL/g) ?? []).length, 2);
  for (const fn of ["can_access_subject", "can_access_lesson"]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(uuid\\) FROM PUBLIC;`));
    assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(uuid\\) FROM anon;`));
    assert.match(
      sql,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(uuid\\) TO authenticated;`),
    );
  }
  assert.doesNotMatch(sql, /GRANT\s+EXECUTE[\s\S]*\sTO\s+anon\b/i);
});

test("keeps the admin bypass", () => {
  assert.match(sql, /has_role\(auth\.uid\(\), 'admin'::app_role\)/);
});

test("requires the student's normalized or legacy grade to match the subject", () => {
  assert.match(sql, /p\.grade_uuid = s\.grade_id/);
  assert.match(sql, /p\.grade_id = s\.grade_id::text/);
});

test("requires a matching curriculum track for track-specific subjects", () => {
  assert.match(sql, /s\.curriculum_track_id IS NULL/);
  assert.match(sql, /p\.curriculum_track_id IS NOT NULL/);
  assert.match(sql, /p\.curriculum_track_id = s\.curriculum_track_id/);
});

test("lesson access delegates to the hardened subject boundary", () => {
  assert.match(sql, /public\.can_access_subject\(l\.subject_id\)/);
  assert.doesNotMatch(sql, /has_active_subscription|subscription_required|\bis_free\b/);
});

test("subject-only questions remain free for the correct student without changing question RLS", () => {
  assert.doesNotMatch(sql, /has_active_subscription|subscription_required/);
  assert.doesNotMatch(sql, /CREATE\s+POLICY|ALTER\s+POLICY|DROP\s+POLICY/i);
  assert.doesNotMatch(sql, /correct_index|explanation|answer/i);
});

test("contains no destructive, storage, or financial changes", () => {
  assert.doesNotMatch(sql, /DROP\s+TABLE|DELETE\s+FROM|TRUNCATE\b/i);
  assert.doesNotMatch(sql, /storage\.objects/i);
  assert.doesNotMatch(sql, /wallet|payment|subscription/i);
});
