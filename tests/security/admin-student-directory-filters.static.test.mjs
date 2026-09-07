import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260918010000_admin_student_directory_filters.sql",
    import.meta.url,
  ),
  "utf8",
);
const page = readFileSync(
  new URL("../../src/routes/_authenticated/admin.students.tsx", import.meta.url),
  "utf8",
);

test("student directory RPCs are admin-only and anon cannot execute them", () => {
  assert.match(migration, /not public\.has_role\(auth\.uid\(\), 'admin'/);
  assert.match(migration, /raise exception 'forbidden' using errcode = '42501'/);
  assert.match(
    migration,
    /revoke all on function public\.admin_list_students_filtered[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /revoke all on function public\.admin_student_filter_options\(\) from public, anon/,
  );
});

test("student counts exclude teacher and privileged staff identities", () => {
  assert.match(migration, /academy\.teacher_profiles/);
  assert.match(
    migration,
    /user_roles\.role in \('admin'[\s\S]*'content_manager'[\s\S]*'moderator'/,
  );
});

test("filters and counts are evaluated on the server before pagination", () => {
  assert.match(migration, /p_governorate_id/);
  assert.match(migration, /p_grade_id/);
  assert.match(migration, /p_school_name/);
  assert.match(migration, /'count', \(select count\(\*\) from filtered\)/);
  assert.match(migration, /limit v_page_size offset \(v_page \* v_page_size\)/);
});

test("admin page exposes cumulative governorate, grade, and school filters", () => {
  assert.match(page, />جميع المحافظات</);
  assert.match(page, />جميع الصفوف</);
  assert.match(page, />جميع المدارس</);
  assert.match(page, /عدد الطلاب المطابقين/);
  assert.match(page, /مسح الفلاتر/);
});
