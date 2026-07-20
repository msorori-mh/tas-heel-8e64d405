import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const freeAccessMigration = read(
  "supabase/migrations/20260719204006_6e612827-6040-4c8c-9c09-bea5554b5cea.sql",
);
const baselineMigration = read(
  "supabase/migrations/20260606004917_18901270-9c14-4c37-bea7-1b33e3e26812.sql",
);
const adminAccess = read("src/lib/admin-route-access.ts");
const authenticatedLayout = read("src/routes/_authenticated/route.tsx");
const studentFreeAccess = read("src/lib/student-free-access.ts");
const walletRoute = read("src/routes/_authenticated/wallet.tsx");
const subscriptionRoute = read("src/routes/_authenticated/subscription.tsx");
const paymentsRoute = read("src/routes/_authenticated/payments.index.tsx");
const newPaymentRoute = read("src/routes/_authenticated/payments.new.tsx");

function functionBody(sql, name, nextMarker = "CREATE OR REPLACE FUNCTION") {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = sql.indexOf(nextMarker, start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

test("free access removes subscription gates but retains exam and practice identity gates", () => {
  const startExam = functionBody(freeAccessMigration, "start_exam_session");
  const gradePractice = functionBody(freeAccessMigration, "grade_unit_practice");

  for (const body of [startExam, gradePractice]) {
    assert.match(body, /auth\.uid\(\)/);
    assert.doesNotMatch(body, /has_active_subscription|subscription_required/);
    assert.match(body, /grade_uuid/);
    assert.match(body, /curriculum_track_id|user_can_access_subject_curriculum/);
  }
});

test("the audit detects the P0 lesson gate regression", () => {
  const lessonGate = functionBody(freeAccessMigration, "can_access_lesson");

  assert.doesNotMatch(lessonGate, /auth\.uid\(\) IS NOT NULL/);
  assert.doesNotMatch(lessonGate, /grade_uuid|grade_id/);
  assert.match(lessonGate, /user_can_access_subject_curriculum/);
});

test("the audit detects that subject-only questions remain subscription gated", () => {
  const subjectGate = functionBody(baselineMigration, "can_access_subject");

  assert.match(subjectGate, /has_active_subscription/);
  assert.doesNotMatch(freeAccessMigration, /FUNCTION public\.can_access_subject/);
});

test("the audit detects incomplete anon hardening on subject and lesson helpers", () => {
  assert.match(baselineMigration, /REVOKE EXECUTE ON FUNCTION public\.can_access_lesson\(uuid\) FROM anon/);
  assert.match(baselineMigration, /REVOKE EXECUTE ON FUNCTION public\.can_access_subject\(uuid\) FROM anon/);
  assert.doesNotMatch(
    baselineMigration,
    /REVOKE (?:ALL|EXECUTE) ON FUNCTION public\.can_access_lesson\(uuid\) FROM (?:PUBLIC|public)/,
  );
  assert.doesNotMatch(
    baselineMigration,
    /REVOKE (?:ALL|EXECUTE) ON FUNCTION public\.can_access_subject\(uuid\) FROM (?:PUBLIC|public)/,
  );
});

test("student payment surfaces are frozen while financial infrastructure remains", () => {
  assert.match(studentFreeAccess, /STUDENT_FREE_ACCESS = true/);
  for (const route of [walletRoute, subscriptionRoute, paymentsRoute, newPaymentRoute]) {
    assert.match(route, /STUDENT_FREE_ACCESS/);
  }
  assert.match(walletRoute, /wallet_accounts/);
  assert.match(newPaymentRoute, /payment_requests/);
});

test("content managers are denied full-admin financial and student administration paths", () => {
  for (const path of [
    "/admin/students",
    "/admin/users",
    "/admin/payment-methods",
    "/admin/payment-requests",
    "/admin/wallet-topups",
  ]) {
    assert.match(adminAccess, new RegExp(`path\\.startsWith\\(\"${path}\"\\)`));
  }
});

test("the audit detects that content staff are not centrally excluded from student routes", () => {
  assert.match(authenticatedLayout, /!profileComplete && !isAdmin && !isContentStaff/);
  assert.doesNotMatch(authenticatedLayout, /isContentStaff.*navigate\(\{ to: \"\/admin\/academic\"/s);
});

test("cross-student profile and exam-session reads use owner RLS", () => {
  const coreSchema = read(
    "supabase/migrations/20260606003842_a271db04-ff59-4b13-8785-56e938afc1cc.sql",
  );
  assert.match(coreSchema, /Users can view own profile[\s\S]*?auth\.uid\(\) = user_id/);
  const examSchema = read(
    "supabase/migrations/20260607234143_a6084a8b-78b7-4fdf-8b6c-7d36fe1d7f58.sql",
  );
  assert.match(examSchema, /Users read own sessions[\s\S]*?user_id = auth\.uid\(\)/);
});
