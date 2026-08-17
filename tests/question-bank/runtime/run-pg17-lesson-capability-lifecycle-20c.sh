#!/usr/bin/env bash
# PG local validation for supabase/migrations-pending/20260822010000_lesson_capability_lifecycle_20c.sql
# Creates a throwaway cluster, stubs the minimum production objects the
# migration depends on, applies the migration, checks schema + backfill,
# then simulates rollback. No shared production database is touched.
set -euo pipefail

DIR=$(mktemp -d)
export PGDATA="$DIR/data" PGPORT=55433 PGHOST="$DIR" PGUSER=postgres
unset PGPASSWORD PGDATABASE || true
initdb -U postgres -A trust >/dev/null
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $PGHOST -c listen_addresses=''" -l "$DIR/log" start >/dev/null
trap 'pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

psql -q -d postgres <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid primary key);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.is_content_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.is_full_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.lessons(id uuid primary key default gen_random_uuid());
CREATE TABLE public.lesson_book_contents(lesson_id uuid references public.lessons, content text, pdf_url text);
CREATE TABLE public.lesson_explanations(lesson_id uuid references public.lessons);
CREATE TABLE public.lesson_resources(lesson_id uuid references public.lessons, resource_type text,
  html_resource_type text, lifecycle_status text, is_primary boolean);
CREATE TABLE public.lesson_simulations(lesson_id uuid references public.lessons);
CREATE TABLE public.lesson_summaries(lesson_id uuid references public.lessons, summary text);
CREATE TABLE public.questions(lesson_id uuid references public.lessons);
CREATE TABLE public.lesson_assessments(lesson_id uuid references public.lessons);
CREATE TABLE public.exam_templates(lesson_id uuid references public.lessons);
CREATE TABLE public.audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid,
  action text not null, target_type text not null, target_id uuid, metadata jsonb not null default '{}',
  created_at timestamptz not null default now());
CREATE ROLE authenticated; CREATE ROLE service_role;

-- fixtures: one fully populated lesson, one draft-only mind map lesson
INSERT INTO public.lessons(id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.lesson_book_contents VALUES ('11111111-1111-1111-1111-111111111111','نص الكتاب','x.pdf');
INSERT INTO public.lesson_explanations VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO public.lesson_summaries VALUES ('11111111-1111-1111-1111-111111111111','ملخص');
INSERT INTO public.questions VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO public.lesson_resources VALUES
  ('11111111-1111-1111-1111-111111111111','mindmap','mindmap','published',false),
  ('22222222-2222-2222-2222-222222222222','mindmap','mindmap','draft',false);
SQL

psql -q -v ON_ERROR_STOP=1 -d postgres -f supabase/migrations-pending/20260822010000_lesson_capability_lifecycle_20c.sql
echo "APPLY=OK"

psql -q -d postgres <<'SQL'
\pset pager off
SELECT capability, status, count(*) FROM public.lesson_capability_lifecycle GROUP BY 1,2 ORDER BY 1,2;
-- fail-closed expectations
DO $$
BEGIN
  ASSERT (SELECT status FROM public.lesson_capability_lifecycle
          WHERE lesson_id='11111111-1111-1111-1111-111111111111' AND capability='mindMap') = 'READY',
    'published mind map must backfill READY';
  ASSERT (SELECT status FROM public.lesson_capability_lifecycle
          WHERE lesson_id='22222222-2222-2222-2222-222222222222' AND capability='mindMap') = 'DRAFT',
    'draft mind map must stay DRAFT';
  ASSERT (SELECT count(*) FROM public.lesson_capability_lifecycle
          WHERE lesson_id='11111111-1111-1111-1111-111111111111') = 7,
    'fully populated lesson must backfill 7 capabilities';
  ASSERT NOT EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle WHERE capability='studentPerformance'),
    'derived performance must have no lifecycle row';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.lesson_capability_lifecycle'::regclass),
    'RLS must be enabled';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='lesson_capability_lifecycle'
            AND cmd <> 'SELECT') = 0, 'no direct write policy allowed';
END $$;
SQL
echo "SCHEMA_AND_BACKFILL=OK"

# transition simulation: READY -> DRAFT keeps the frozen snapshot
psql -q -d postgres <<'SQL'
UPDATE public.lesson_capability_lifecycle
   SET ready_snapshot = '{"v":1}'::jsonb, ready_hash='h1'
 WHERE capability='quickReview';
DO $$
DECLARE r jsonb; BEGIN
  UPDATE public.lesson_capability_lifecycle SET status='DRAFT' WHERE capability='quickReview';
  ASSERT (SELECT ready_snapshot FROM public.lesson_capability_lifecycle WHERE capability='quickReview')
         = '{"v":1}'::jsonb, 'ready snapshot must survive a new draft';
END $$;
SQL
echo "READY_SNAPSHOT_PRESERVED=OK"

# rollback simulation
psql -q -v ON_ERROR_STOP=1 -d postgres <<'SQL'
DROP FUNCTION IF EXISTS public.lesson_capability_transition(uuid,text,text,jsonb,text);
DROP TABLE IF EXISTS public.lesson_capability_lifecycle;
DROP FUNCTION IF EXISTS public.touch_lesson_capability_lifecycle();
SQL
echo "ROLLBACK=OK"
