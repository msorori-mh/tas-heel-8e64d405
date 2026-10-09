import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

describe("exam schedule real RLS", () => {
  it("denies student/content-manager writes, hides drafts, and permits scoped admin CRUD", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role authenticated; create role anon; create schema auth;
        create type app_role as enum ('admin','content_manager','student');
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
        create function public.has_role(uuid,app_role) returns boolean language sql stable as $$select $2::text = current_setting('test.role',true)$$;
        create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;
        create table public.curriculum_tracks(id uuid primary key);create table public.grades(id uuid primary key);
        insert into public.curriculum_tracks values ('00000000-0000-0000-0000-000000000001');
        grant usage on schema public,auth to authenticated,anon;`);
      await db.exec(
        readFileSync("supabase/migrations/20261009190000_exam_schedule_countdown.sql", "utf8"),
      );
      await db.exec(`insert into public.exam_schedule(id,curriculum_track_id,exam_kind,title,starts_on,is_published) values
        ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','midterm','موعد منشور','2027-01-01',true),
        ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','midterm','موعد مسودة','2027-02-01',false);
        set role authenticated; set test.uid='00000000-0000-0000-0000-000000000020';`);
      for (const role of ["student", "content_manager"]) {
        await db.exec(`set test.role='${role}'`);
        expect((await db.query("select title from public.exam_schedule")).rows).toEqual([
          { title: "موعد منشور" },
        ]);
        await expect(
          db.exec(
            `insert into public.exam_schedule(curriculum_track_id,exam_kind,title,starts_on) values ('00000000-0000-0000-0000-000000000001','midterm','موعد جديد','2027-03-01')`,
          ),
        ).rejects.toThrow(/row-level security/i);
        expect(
          (await db.query("update public.exam_schedule set title='تعديل مرفوض' returning id")).rows,
        ).toHaveLength(0);
        expect((await db.query("delete from public.exam_schedule returning id")).rows).toHaveLength(
          0,
        );
      }
      await db.exec("set test.role='admin'");
      expect((await db.query("select id from public.exam_schedule")).rows).toHaveLength(2);
      await db.exec(
        "update public.exam_schedule set is_published=true where id='00000000-0000-0000-0000-000000000012'",
      );
      expect(
        (
          await db.query(
            "delete from public.exam_schedule where id='00000000-0000-0000-0000-000000000012' returning id",
          )
        ).rows,
      ).toHaveLength(1);
      expect((await db.query("select id from public.exam_schedule")).rows).toHaveLength(1);
      await db.exec("reset role;set role anon");
      await expect(db.query("select * from public.exam_schedule")).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await db.close();
    }
  }, 30000);
});
