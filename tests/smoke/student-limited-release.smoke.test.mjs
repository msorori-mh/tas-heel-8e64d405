// STUDENT-LIMITED-RELEASE-SMOKE-PACKAGE-01 — skeleton smoke test.
//
// READ-ONLY by design: signs in with an EXISTING test account and reads the
// student's subjects + a public question payload shape. It never writes
// data, never starts exam sessions, and never imports anything.
//
// Skips loudly unless SMOKE_STUDENT_EMAIL and SMOKE_STUDENT_PASSWORD are
// set to an existing test account:
//   SMOKE_STUDENT_EMAIL=... SMOKE_STUDENT_PASSWORD=... \
//     node --test tests/smoke/student-limited-release.smoke.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    // .env.local optional
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON_KEY = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.SMOKE_STUDENT_EMAIL;
const PASSWORD = process.env.SMOKE_STUDENT_PASSWORD;

const SKIP_REASON =
  "SKIP: no test-account credentials. Set SMOKE_STUDENT_EMAIL and SMOKE_STUDENT_PASSWORD for an EXISTING test student (read-only smoke).";

test(
  "student limited-release smoke (read-only)",
  { skip: !EMAIL || !PASSWORD ? SKIP_REASON : false },
  async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: auth, error: authError } = await client.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });
    assert.equal(authError, null, `login failed: ${authError?.message}`);
    assert.ok(auth.user?.id, "no user after login");

    // Subjects for the student's grade — must be readable (free access).
    const { data: profile } = await client
      .from("profiles")
      .select("grade_uuid, grade_id, curriculum_track_id")
      .eq("user_id", auth.user.id)
      .single();
    assert.ok(profile, "profile must exist for the test student");

    const gradeKey = profile.grade_uuid ?? String(profile.grade_id ?? "");
    const { data: subjects, error: subjError } = await client
      .from("subjects")
      .select("id,name,sort_order")
      .eq("grade_id", gradeKey)
      .order("sort_order");
    assert.equal(subjError, null, `subjects read failed: ${subjError?.message}`);
    assert.ok(subjects.length > 0, "student must see at least one subject after import");

    // Answer-key leak guard: the public payload must not expose the answer columns.
    const { error: answersError } = await client
      .from("questions")
      .select("correct_index,explanation")
      .limit(1);
    assert.ok(
      answersError,
      "correct_index/explanation must be denied at the privilege level for students",
    );

    console.log(`smoke ok: ${subjects.length} subjects visible, answer columns blocked`);
  },
);
