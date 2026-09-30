import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
test("teacher directory is read-only, full-admin-only, paginated and identity-safe", async () => {
  const db = new PGlite();
  let checks = 0;
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const eq = (actual, expected) => {
    assert.deepEqual(actual, expected);
    checks++;
  };
  const actor = async (n) => {
    await db.exec("reset role");
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
    await db.exec("set role authenticated");
  };
  const denied = async (sql, args = [], code = "permission denied") => {
    await assert.rejects(() => rows(sql, args), new RegExp(code));
    checks++;
  };
  try {
    await db.exec(
      (await read("scripts/teacher-academy/pg17-fixture.sql"))
        .replace(/^\\set.*$/gm, "")
        .replace("create extension if not exists pgcrypto;", ""),
    );
    for (const name of [
      "20260830020000_teacher_academy_mvp_foundation.sql",
      "20260830030000_teacher_academy_mvp_learning.sql",
      "20260830040000_teacher_academy_mvp_assessment_certificates.sql",
    ])
      await db.exec(await read(`supabase/migrations/${name}`));
    await db.exec(`
      alter table auth.users add column last_sign_in_at timestamptz;
      alter table academy.teacher_profiles add column school_id uuid,add column school_district text,add column school_locality text;
      create type public.app_role as enum ('admin','student','content_manager');
      create function public.has_role(p_user_id uuid,p_role public.app_role) returns boolean language sql stable security definer as $$select p_user_id='${id(1)}'::uuid and p_role='admin'$$;
      insert into academy.teacher_profiles(user_id,full_name,primary_subject_id,governorate_id,school_name,phone)
        select u.id,'TEST_ONLY same name',s.id,'${id(100)}','TEST_ONLY school','777123456' from auth.users u cross join academy.subjects s where u.id in ('${id(2)}','${id(3)}') and s.code='MATHEMATICS';
      update academy.teacher_profiles set status='SUSPENDED' where user_id='${id(3)}';
      insert into academy.capability_grants(user_id,capability,granted_by) values ('${id(2)}','ACADEMY_TEACHERS_VIEW','${id(1)}');
      insert into academy.programs(id,slug,created_by) values ('${id(200)}','test-only-directory','${id(1)}');
      insert into academy.program_versions(id,program_id,version_number,title,summary,audience_type,created_by) values
        ('${id(201)}','${id(200)}',1,'TEST_ONLY one','TEST_ONLY local fixture','ALL_TEACHERS','${id(1)}'),
        ('${id(202)}','${id(200)}',2,'TEST_ONLY two','TEST_ONLY local fixture','ALL_TEACHERS','${id(1)}');
      insert into academy.courses(id,program_version_id,title) values ('${id(203)}','${id(201)}','Course');
      insert into academy.modules(id,course_id,title) values ('${id(204)}','${id(203)}','Module');
      insert into academy.lessons(id,module_id,title,lesson_type,content,display_order) values
        ('${id(205)}','${id(204)}','First lesson','TEXT','TEST_ONLY content',0),
        ('${id(206)}','${id(204)}','Second lesson','TEXT','TEST_ONLY content',1);
      insert into academy.assessments(id,program_version_id,title,pass_percentage) values ('${id(207)}','${id(201)}','Final test',75);
      insert into academy.enrollments(id,user_id,program_version_id,status,completed_at) values
        ('${id(220)}','${id(2)}','${id(201)}','COMPLETED',now()),
        ('${id(221)}','${id(2)}','${id(202)}','ACTIVE',null);
      insert into academy.lesson_progress(enrollment_id,lesson_id) values ('${id(220)}','${id(205)}'),('${id(220)}','${id(206)}');
      insert into academy.assessment_attempts(enrollment_id,assessment_id,attempt_number,answers,score,total,passed) values
        ('${id(220)}','${id(207)}',1,'{}',1,4,false),('${id(220)}','${id(207)}',2,'{}',4,4,true);
      insert into academy.certificates(enrollment_id,certificate_code) values ('${id(220)}','TAM-1234567890ABCDEF1234');
    `);
    const before = (
      await rows(
        "select (select count(*) from academy.teacher_profiles) as teachers,(select count(*) from academy.enrollments) as enrollments,(select count(*) from academy.assessment_attempts) as attempts",
      )
    )[0];
    await db.exec(await read("supabase/migrations/20260930020000_admin_teacher_directory.sql"));
    await db.exec("set role anon");
    await denied("select public.admin_teacher_directory()");
    await denied("select public.admin_teacher_detail($1)", [id(2)]);
    await denied("select * from academy.admin_teacher_directory_rows");
    await actor(2);
    await denied("select public.admin_teacher_directory()", [], "ADMIN_REQUIRED");
    await denied("select public.admin_teacher_detail($1)", [id(2)], "ADMIN_REQUIRED");
    await denied("select * from academy.admin_teacher_directory_rows");
    await actor(1);
    const list = async (args = {}) =>
      (
        await rows("select public.admin_teacher_directory($1,$2,$3,$4,$5,$6,$7) as data", [
          args.query ?? "",
          args.status ?? "",
          null,
          null,
          args.activity ?? "",
          args.page ?? 0,
          args.size ?? 20,
        ])
      )[0].data;
    let result = await list();
    eq(result.total, 2);
    eq(result.rows.length, 2);
    eq(result.summary, {
      teachers: 2,
      active: 1,
      suspended: 1,
      unenrolled: 1,
      enrollments: 2,
      active_programs: 1,
      completed_programs: 1,
      cancelled_programs: 0,
      completed_lessons: 2,
      attempts: 2,
      passed_attempts: 1,
      valid_certificates: 1,
      revoked_certificates: 0,
    });
    eq(result.subjects[0].count, 2);
    eq(result.governorates[0].count, 2);
    eq(result.rows.find((t) => t.user_id === id(3)).enrollment_count, 0);
    eq(result.rows.find((t) => t.user_id === id(3)).best_score_percent, null);
    eq((await list({ status: "SUSPENDED" })).summary.enrollments, 0);
    eq((await list({ activity: "CERTIFIED" })).total, 1);
    eq((await list({ activity: "UNENROLLED" })).rows[0].user_id, id(3));
    eq((await list({ query: "MATH-TEACHER@EXAMPLE.TEST" })).total, 1);
    eq((await list({ query: "%" })).total, 0);
    eq((await list({ query: "' OR true --" })).total, 0);
    eq((await list({ size: 1 })).summary.teachers, 2);
    eq((await list({ size: 1, page: 1 })).rows.length, 1);
    eq((await list({ page: 5 })).rows, []);
    eq((await list({ query: "missing" })).summary.attempts, 0);
    const detail = (await rows("select public.admin_teacher_detail($1) as data", [id(2)]))[0].data;
    eq(detail.teacher.user_id, id(2));
    eq(detail.programs.length, 2);
    const complete = detail.programs.find((p) => p.enrollment_id === id(220));
    eq(complete.completed_lessons, 2);
    eq(complete.total_lessons, 2);
    eq(complete.attempts.length, 2);
    eq(complete.attempts[0].score, 4);
    eq("answers" in complete.attempts[0], false);
    eq(complete.certificate.code, "TAM-1234567890ABCDEF1234");
    eq(
      (await rows("select public.admin_teacher_detail($1) as data", [id(3)]))[0].data.programs,
      [],
    );
    await denied("select public.admin_teacher_detail($1)", [id(4)], "TEACHER_NOT_FOUND");
    await denied("select public.admin_teacher_directory(p_page => -1)", [], "INVALID_FILTERS");
    await denied(
      "select public.admin_teacher_directory(p_page_size => 101)",
      [],
      "INVALID_FILTERS",
    );
    await db.exec("reset role");
    await db.exec(`update academy.certificates set revoked_at=now(),revoked_by='${id(1)}',revocation_reason='TEST_ONLY revoke';
      update academy.enrollments set status='CANCELLED' where id='${id(221)}';`);
    await actor(1);
    result = await list();
    eq(result.summary.valid_certificates, 0);
    eq(result.summary.revoked_certificates, 1);
    eq(result.summary.cancelled_programs, 1);
    eq((await list({ activity: "CERTIFIED" })).total, 0);
    eq((await list({ activity: "LEARNING" })).total, 0);
    const revoked = (
      await rows("select public.admin_teacher_detail($1) as data", [id(2)])
    )[0].data.programs.find((p) => p.enrollment_id === id(220)).certificate;
    eq(revoked.revocation_reason, "TEST_ONLY revoke");
    await db.exec("reset role");
    eq(
      (
        await rows(
          "select (select count(*) from academy.teacher_profiles) as teachers,(select count(*) from academy.enrollments) as enrollments,(select count(*) from academy.assessment_attempts) as attempts",
        )
      )[0],
      before,
    );
    console.log(`Teacher directory: ${checks} assertions passed`);
  } finally {
    await db.close();
  }
});
