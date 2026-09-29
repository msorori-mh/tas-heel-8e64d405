import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("teacher assessment RPCs enforce access, sequence, throttling, score privacy and immutable success", async () => {
  const localUrl = process.env.TEACHER_AUDIT_TEST_DATABASE_URL;
  let db;
  if (localUrl) {
    const target = new URL(localUrl);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(target.hostname) &&
        target.pathname === "/teacher_audit_test",
      "Only the isolated local teacher_audit_test database is allowed",
    );
    const { default: postgres } = await import("postgres");
    const client = postgres(localUrl, { max: 1 });
    db = {
      exec: (sql) => client.unsafe(sql),
      query: async (sql, args = []) => ({ rows: await client.unsafe(sql, args) }),
      close: () => client.end(),
    };
  } else db = new PGlite();
  let checks = 0;
  const eq = (actual, expected) => {
    assert.deepEqual(actual, expected);
    checks++;
  };
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const actor = async (n) => {
    await db.exec("reset role");
    await query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
    await db.exec("set role authenticated");
  };
  const denied = async (sql, args, code) => {
    await assert.rejects(() => query(sql, args), new RegExp(code));
    checks++;
  };
  try {
    const fixture = (await read("scripts/teacher-academy/pg17-fixture.sql"))
      .replace(/^\\set.*$/gm, "")
      .replace("create extension if not exists pgcrypto;", "");
    await db.exec(fixture);
    for (const path of [
      "20260830020000_teacher_academy_mvp_foundation.sql",
      "20260830030000_teacher_academy_mvp_learning.sql",
      "20260830040000_teacher_academy_mvp_assessment_certificates.sql",
      "20260930010000_academy_teacher_assessment_guards.sql",
    ])
      await db.exec(await read(`supabase/migrations/${path}`));
    await db.exec(`
      insert into academy.programs(id,slug,created_by) values ('${id(200)}','test-only-teacher-audit','${id(1)}');
      insert into academy.program_versions(id,program_id,version_number,title,summary,audience_type,created_by)
        values ('${id(201)}','${id(200)}',1,'TEST_ONLY audit','TEST_ONLY local fixture','ALL_TEACHERS','${id(1)}');
      insert into academy.courses(id,program_version_id,title) values ('${id(202)}','${id(201)}','Course');
      insert into academy.modules(id,course_id,title) values ('${id(203)}','${id(202)}','Module');
      insert into academy.lessons(id,module_id,title,lesson_type,content,display_order) values
        ('${id(204)}','${id(203)}','First lesson','TEXT','Test content',0),
        ('${id(205)}','${id(203)}','Second lesson','TEXT','Test content',1);
      insert into academy.assessments(id,program_version_id,title,pass_percentage) values ('${id(206)}','${id(201)}','Final test',75);
      insert into academy.assessment_questions(id,assessment_id,question_text,option_a,option_b,option_c,option_d,correct_option,display_order)
        select ('00000000-0000-0000-0000-'||lpad((210+n)::text,12,'0'))::uuid, '${id(206)}','Question '||n,'Correct','Other','Other 2','Other 3','a',n from generate_series(1,4) n;
      update academy.program_versions set status='PUBLISHED',published_by='${id(1)}',published_at=now() where id='${id(201)}';
      update academy.programs set current_published_version_id='${id(201)}' where id='${id(200)}';
      insert into academy.teacher_profiles(user_id,full_name,primary_subject_id,governorate_id,school_name,phone)
        select u.id,'TEST_ONLY teacher',s.id,'${id(100)}','TEST_ONLY school','777123456' from auth.users u cross join academy.subjects s where u.id in ('${id(2)}','${id(3)}') and s.code='MATHEMATICS';
      insert into academy.enrollments(id,user_id,program_version_id) values ('${id(220)}','${id(2)}','${id(201)}');
    `);
    await actor(3);
    await denied(
      "select * from academy.get_assessment($1)",
      [id(201)],
      "ACTIVE_ENROLLMENT_REQUIRED",
    );
    await denied("select academy.complete_lesson($1)", [id(204)], "ACTIVE_ENROLLMENT_REQUIRED");
    await actor(2);
    await denied(
      "select * from academy.get_assessment($1)",
      [id(201)],
      "COMPLETE_LESSONS_BEFORE_ASSESSMENT",
    );
    await denied("select academy.complete_lesson($1)", [id(205)], "PREVIOUS_LESSONS_REQUIRED");
    await query("select academy.complete_lesson($1)", [id(204)]);
    await query("select academy.complete_lesson($1)", [id(204)]);
    await query("select academy.complete_lesson($1)", [id(205)]);
    const questions = await query("select * from academy.get_assessment($1)", [id(201)]);
    eq(questions.length, 4);
    eq(
      questions.some((q) => "correct_option" in q),
      false,
    );
    await denied("select * from academy.assessment_questions", [], "permission denied");
    await denied("select academy.require_assessment_access($1)", [id(201)], "permission denied");
    const answers = Object.fromEntries(questions.map((q) => [q.question_id, "b"]));
    await denied(
      "select * from academy.submit_assessment($1,$2)",
      [id(201), null],
      "INVALID_ASSESSMENT_SUBMISSION",
    );
    await denied(
      "select * from academy.submit_assessment($1,$2)",
      [id(201), { ...answers, [id(211)]: null }],
      "ALL_VALID_ANSWERS_REQUIRED",
    );
    let result = (
      await query("select * from academy.submit_assessment($1,$2)", [id(201), answers])
    )[0];
    eq(result.passed, false);
    eq(result.score, null);
    eq(result.certificate_code, null);
    await denied(
      "select * from academy.submit_assessment($1,$2)",
      [id(201), answers],
      "ASSESSMENT_COOLDOWN",
    );
    for (let i = 0; i < 2; i++) {
      await db.exec(
        "reset role; update academy.assessment_attempts set completed_at=now()-interval '20 minutes'; set role authenticated;",
      );
      await query("select * from academy.submit_assessment($1,$2)", [id(201), answers]);
    }
    await db.exec(
      "reset role; update academy.assessment_attempts set completed_at=now()-interval '20 minutes'; set role authenticated;",
    );
    await denied("select * from academy.get_assessment($1)", [id(201)], "ASSESSMENT_ATTEMPT_LIMIT");
    await denied(
      "select * from academy.submit_assessment($1,$2)",
      [id(201), answers],
      "ASSESSMENT_ATTEMPT_LIMIT",
    );
    await db.exec(
      "reset role; update academy.assessment_attempts set completed_at=now()-interval '25 hours'; set role authenticated;",
    );
    const passing = { ...answers, [id(211)]: "a", [id(212)]: "a", [id(213)]: "a" };
    result = (await query("select * from academy.submit_assessment($1,$2)", [id(201), passing]))[0];
    eq(result.passed, true);
    eq(result.score, 3);
    eq(result.total, 4);
    assert.match(result.certificate_code, /^TAM-/);
    checks++;
    await denied(
      "select * from academy.submit_assessment($1,$2)",
      [id(201), answers],
      "ASSESSMENT_ALREADY_PASSED",
    );
    await denied(
      "select * from academy.get_assessment($1)",
      [id(201)],
      "ASSESSMENT_ALREADY_PASSED",
    );
    eq((await query("select * from academy.list_my_certificates()")).length, 1);
    await db.exec("reset role");
    eq((await query("select count(*)::int count from academy.assessment_attempts"))[0].count, 4);
    if (localUrl) {
      // Two independent PG connections compete for the same remaining attempt.
      await db.exec(
        `insert into academy.enrollments(id,user_id,program_version_id) values ('${id(221)}','${id(3)}','${id(201)}')`,
      );
      await actor(3);
      await query("select academy.complete_lesson($1)", [id(204)]);
      await query("select academy.complete_lesson($1)", [id(205)]);
      const { default: postgres } = await import("postgres");
      const clients = [postgres(localUrl, { max: 1 }), postgres(localUrl, { max: 1 })];
      try {
        await Promise.all(
          clients.map(async (client) => {
            await client.unsafe(
              `set role authenticated; select set_config('request.jwt.claim.sub','${id(3)}',false)`,
            );
          }),
        );
        const outcomes = await Promise.allSettled(
          clients.map((client) =>
            client.unsafe("select * from academy.submit_assessment($1,$2::jsonb)", [
              id(201),
              // postgres serializes a jsonb parameter; pre-stringifying makes it a JSON string.
              answers,
            ]),
          ),
        );
        eq(outcomes.filter((item) => item.status === "fulfilled").length, 1);
        const rejected = outcomes.find((item) => item.status === "rejected");
        assert.match(rejected.reason.message, /ASSESSMENT_COOLDOWN/);
        checks++;
      } finally {
        await Promise.all(clients.map((client) => client.end()));
      }
      await db.exec("reset role");
      eq(
        (
          await query(
            "select count(*)::int count from academy.assessment_attempts where enrollment_id=$1",
            [id(221)],
          )
        )[0].count,
        1,
      );
    }
    await db.exec("set role anon");
    await denied("select * from academy.get_assessment($1)", [id(201)], "permission denied");
    console.log(
      `Teacher SQL runtime: ${checks} assertions passed (${localUrl ? "local PostgreSQL" : "PGlite"}, isolated fixture).`,
    );
  } finally {
    await db.close();
  }
});
