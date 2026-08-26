import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260821010000_storage_lesson_media_policy_security_definer_fix.sql",
    import.meta.url,
  ),
  "utf8",
);

test("lesson media lookup is isolated behind a pinned SECURITY DEFINER helper", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.can_read_lesson_media_storage_object\(_object_name text\)/,
  );
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = public, pg_temp/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.can_read_lesson_media_storage_object\(text\) FROM PUBLIC/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.can_read_lesson_media_storage_object\(text\) TO authenticated/,
  );
  assert.match(migration, /public\.can_access_lesson\(l\.id\)/);
});

test("storage policy no longer references lessons under the authenticated invoker", () => {
  const policyStart = migration.indexOf(
    'CREATE POLICY "Students can read lesson media with lesson access"',
  );
  assert.notEqual(policyStart, -1);
  const policy = migration.slice(policyStart);
  assert.match(policy, /public\.can_read_lesson_media_storage_object\(name\)/);
  assert.doesNotMatch(policy, /FROM public\.lessons/);
  assert.match(policy, /'lesson-pdfs'::text, 'lesson-videos'::text/);
});

test("the remediation does not restore direct lesson SELECT", () => {
  assert.doesNotMatch(migration, /GRANT\s+SELECT\s+ON\s+(?:TABLE\s+)?public\.lessons/i);
});
