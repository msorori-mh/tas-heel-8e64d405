import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

test("retired purge fails even after re-enable; coverage is complete, authorized and RLS-bound", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create type public.app_role as enum ('admin','student');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid',true),'')::uuid
      $$;
      create function public.has_role(uuid,public.app_role) returns boolean language sql stable as $$
        select current_setting('test.role',true) = $2::text
      $$;
      grant usage on schema auth to authenticated,anon;
      create table public.curriculum_prelaunch_purge_control(
        singleton boolean primary key, enabled boolean, locked_at timestamptz,
        lock_reason text, updated_at timestamptz);
      insert into public.curriculum_prelaunch_purge_control values(true,true,null,null,now());
      create table public.grades(id text primary key,name text);
      create table public.subjects(id text primary key,name text,grade_id text);
      create table public.units(id text primary key,title text);
      create table public.curriculum_tracks(id text primary key,track_name text);
      create table public.subject_curriculum_tracks(subject_id text,curriculum_track_id text,is_active boolean);
      create table public.lessons(id text primary key,title text,subject_id text,unit_id text,sort_order int,delivery_mode text);
      create table public.lesson_summaries(lesson_id text primary key,summary text);
      insert into public.grades values('g3','الثالث الثانوي');
      insert into public.subjects values('math','الرياضيات','g3');
      insert into public.curriculum_tracks values('a','مسار أ'),('b','مسار ب'),('old','غير نشط');
      insert into public.subject_curriculum_tracks values('math','a',true),('math','b',true),('math','old',false);
      insert into public.lessons select 'lesson-'||i,'درس '||i,'math',null,i,'standard' from generate_series(1,1481) i;
      insert into public.lesson_summaries select 'lesson-'||i,case when i<=787 then 'ملخص' else E' \\t\\r\\n' end from generate_series(1,1481) i;
      update public.lesson_summaries set summary=chr(160)||chr(65279) where lesson_id='lesson-1481';
      grant select on public.grades,public.subjects,public.units,public.curriculum_tracks,public.subject_curriculum_tracks,public.lessons,public.lesson_summaries to authenticated;
      alter table public.lessons enable row level security;
      create policy lesson_scope on public.lessons for select to authenticated
        using(current_setting('test.scope',true) is distinct from 'restricted' or sort_order<=1000);
    `);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261015000325_admin_audit_retire_purge_and_review_coverage.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261015010000_disable_prelaunch_curriculum_purge.sql",
        "utf8",
      ),
    );
    const [{ rows: locked }] = await db.exec(
      "select enabled,locked_at is not null as locked from public.curriculum_prelaunch_purge_control",
    );
    assert.deepEqual(locked, [{ enabled: false, locked: true }]);
    await db.exec(
      "set role authenticated; select set_config('test.uid','00000000-0000-0000-0000-000000000001',false); select set_config('test.role','student',false)",
    );
    await assert.rejects(
      db.query("select public.admin_review_coverage_facts()"),
      /FORBIDDEN_ADMIN_REQUIRED/,
    );
    await db.exec("select set_config('test.role','admin',false)");
    let { rows } = await db.query("select public.admin_review_coverage_facts() as facts");
    assert.equal(rows[0].facts.length, 1481);
    assert.equal(rows[0].facts.filter((r) => r.hasSummary).length, 787);
    assert.deepEqual(rows[0].facts[0].trackIds, ["a", "b"]);
    assert.equal("summary" in rows[0].facts[0], false);
    await db.exec("select set_config('test.scope','restricted',false)");
    ({ rows } = await db.query("select public.admin_review_coverage_facts() as facts"));
    assert.equal(rows[0].facts.length, 1000, "invoker must preserve underlying RLS");
    await assert.rejects(
      db.query("select public.admin_curriculum_prelaunch_purge('x','x','x','x')"),
      /permission denied/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query("select public.admin_review_coverage_facts()"),
      /permission denied/,
    );
    await db.exec(
      "reset role; update public.curriculum_prelaunch_purge_control set enabled=true,locked_at=null",
    );
    await assert.rejects(
      db.query("select public.admin_curriculum_prelaunch_purge('x','x','x','x')"),
      /PRELAUNCH_PURGE_RETIRED/,
    );
    await assert.rejects(
      db.query("select public.admin_curriculum_force_delete('lesson',null,null)"),
      /PRELAUNCH_FORCE_DELETE_RETIRED/,
    );
    ({ rows } = await db.query("select count(*)::int as total from public.lessons"));
    assert.equal(rows[0].total, 1481, "no curriculum rows may be deleted");
  } finally {
    await db.close();
  }
});
