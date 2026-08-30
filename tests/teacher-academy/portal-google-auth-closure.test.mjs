import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const [app, callback, studentGoogle, migration, indexRoute, adminRoute, verifyRoute] =
  await Promise.all([
    read("apps/teacher-academy/src/App.tsx"),
    read("src/routes/auth.callback.tsx"),
    read("src/lib/auth/google-sign-in.ts"),
    read("supabase/migrations/20260911040000_academy_google_only_teacher_portal.sql"),
    read("src/routes/academy.index.tsx"),
    read("src/routes/academy.admin.tsx"),
    read("src/routes/academy.verify.tsx"),
  ]);

test("teacher, admin, and certificate routes select explicit isolated portals", () => {
  assert.match(indexRoute, /portal="teacher"/);
  assert.match(adminRoute, /portal="admin"/);
  assert.match(verifyRoute, /portal="verify"/);
  assert.match(adminRoute, /noindex,nofollow/);
});

test("the teacher entry point offers Google only", () => {
  const teacherAuth = app.match(/function TeacherAuthPage[\s\S]*?function AdminAuthPage/)?.[0];
  assert.ok(teacherAuth);
  assert.match(teacherAuth, /startTeacherGoogleSignIn/);
  assert.match(teacherAuth, /المتابعة باستخدام Google/);
  assert.match(teacherAuth, /الطريقة الوحيدة المعتمدة/);
  assert.doesNotMatch(teacherAuth, /signInWithPassword|signUp|type="password"|type="email"/);
});

test("Google OAuth returns through the existing callback without an open redirect", () => {
  assert.match(app, /signInWithOAuth\(\{\s*provider: "google"/);
  assert.match(app, /skipBrowserRedirect: true/);
  assert.match(app, /queryParams: \{ prompt: "select_account" \}/);
  assert.match(app, /usesRootCallback \? "\/auth\/callback" : academyUrl\(\)/);
  assert.match(callback, /parsed\.path !== "\/academy"/);
  assert.match(callback, /ACADEMY_OAUTH_RETURN_MAX_AGE_MS/);
  assert.match(callback, /window\.location\.replace\(academyReturn\)/);
  assert.match(studentGoogle, /removeItem\(ACADEMY_OAUTH_RETURN_KEY\)/);
});

test("the admin entry point keeps existing administrator credentials and cannot create accounts", () => {
  const adminAuth = app.match(/function AdminAuthPage[\s\S]*?function ProfileForm/)?.[0];
  assert.ok(adminAuth);
  assert.match(adminAuth, /signInWithPassword/);
  assert.match(adminAuth, /دخول الإدارة/);
  assert.doesNotMatch(adminAuth, /signUp|إنشاء الحساب|إنشاء حساب معلم/);
});

test("portal selection never mixes teacher and administrator navigation", () => {
  assert.match(app, /const hasAdminAccess = portal === "admin" && capabilities\.size > 0/);
  assert.match(
    app,
    /const hasTeacherAccess = portal === "teacher" && profile\?\.status === "ACTIVE"/,
  );
  assert.match(app, /title="لا يملك هذا الحساب صلاحية الإدارة"/);
  assert.match(app, /title="بوابة المعلمين تتطلب حساب Google"/);
  assert.match(app, /title="هذا حساب إدارة الأكاديمية"/);
});

test("the database requires a Google identity for teacher profile creation and updates", () => {
  assert.match(migration, /^--[\s\S]*\nbegin;/);
  assert.match(migration, /create or replace function academy\.i_have_google_identity\(\)/);
  assert.match(migration, /from auth\.identities identities/);
  assert.match(migration, /identities\.provider = 'google'/);
  assert.match(migration, /academy_teacher_profiles_insert_self[\s\S]*i_have_google_identity\(\)/);
  assert.match(migration, /academy_teacher_profiles_update_self[\s\S]*i_have_google_identity\(\)/);
  assert.match(
    migration,
    /revoke all on function academy\.i_have_google_identity\(\) from public, anon, authenticated/,
  );
  assert.match(migration, /commit;\s*$/);
});
