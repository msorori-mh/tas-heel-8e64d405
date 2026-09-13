-- Production columns omitted by the older CF10 fixture; required by the shipped
-- self-test management migration. No access policy or trigger is disabled.
ALTER TABLE public.question_media ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TEMP TABLE image_baseline_privileges AS SELECT has_table_privilege('authenticated','public.question_revisions','select') AS revision_select;
CREATE TABLE IF NOT EXISTS public.audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, action text,
  target_type text, target_id uuid, metadata jsonb, created_at timestamptz DEFAULT now()
);
