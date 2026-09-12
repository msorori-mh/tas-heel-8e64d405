import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("student and academy clients have no embedded Supabase project fallback", async () => {
  const [student, academy] = await Promise.all([
    read("src/integrations/supabase/client.ts"),
    read("apps/teacher-academy/src/lib/supabase.ts"),
  ]);
  for (const source of [student, academy]) {
    assert.doesNotMatch(source, /zbdhxyuulyovihjgeqbn|PUBLIC_SUPABASE_/);
    assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
  }
  assert.match(student, /Configure the deployment environment explicitly/);
  assert.match(academy, /configuration-required\.invalid/);
});

test("the environment contract separates browser-safe and server-only keys", async () => {
  const env = await read(".env.example");
  assert.match(env, /^VITE_SUPABASE_URL=$/m);
  assert.match(env, /^VITE_SUPABASE_PUBLISHABLE_KEY=$/m);
  assert.match(env, /^SUPABASE_SERVICE_ROLE_KEY=$/m);
  assert.doesNotMatch(env, /VITE_SUPABASE_SERVICE_ROLE_KEY/);
});
