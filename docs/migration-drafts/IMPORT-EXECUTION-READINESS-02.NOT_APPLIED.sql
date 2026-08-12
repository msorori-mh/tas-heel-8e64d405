-- IMPORT-EXECUTION-READINESS-02 — DRAFT ONLY. **NOT APPLIED.**
--
-- This file is a review artifact for phase 02 (design closure of the 7 execution
-- blockers). It lives under docs/migration-drafts/ on purpose and is NOT part of
-- supabase/migrations/. Do not run it. Applying schema requires a separate,
-- explicitly approved migration phase.
--
-- Covers: GAP-01, GAP-02, GAP-03, GAP-05.
-- GAP-04 (resource_url required) and GAP-06 (subject_code required) are template
-- contract changes with no DDL. GAP-07 (subjects.slug) is an application-side
-- derivation (deriveSubjectSlug) with no DDL.

-- ============================================================
-- GAP-01 — lesson_assessments.code (GLOBAL uniqueness)
-- Scope is global, not per lesson, because template 08 references an assessment
-- by assessment_code alone. Mirrors subjects_code_uniq / questions_code_uniq.
-- ============================================================
ALTER TABLE public.lesson_assessments ADD COLUMN IF NOT EXISTS code text;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_assessments_code_uniq
  ON public.lesson_assessments (code)
  WHERE code IS NOT NULL;

-- ============================================================
-- GAP-02 — stable child identity for explanations and resources
-- sort_order stays a mutable presentation attribute and is deliberately NOT
-- part of any identity: reordering must not look like an entity change.
-- ============================================================
ALTER TABLE public.lesson_explanations ADD COLUMN IF NOT EXISTS code text;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_explanations_code_lesson_uniq
  ON public.lesson_explanations (lesson_id, code)
  WHERE code IS NOT NULL;

ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS code text;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_resources_code_lesson_uniq
  ON public.lesson_resources (lesson_id, code)
  WHERE code IS NOT NULL;

-- ============================================================
-- GAP-05 — closed metadata allowlist for template 06 columns
-- ============================================================
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.validate_lesson_resource_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY[
    'resource_format','local_asset_path','thumbnail_url',
    'is_interactive','attribution','license_note','notes'
  ];
  k text;
BEGIN
  IF NEW.metadata IS NULL THEN
    NEW.metadata := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(NEW.metadata) <> 'object' THEN
    RAISE EXCEPTION 'lesson_resources.metadata must be a JSON object';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.metadata) LOOP
    IF NOT (k = ANY (allowed)) THEN
      RAISE EXCEPTION 'unsupported lesson_resources.metadata key: %', k;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- CREATE TRIGGER validate_lesson_resource_metadata_trg
--   BEFORE INSERT OR UPDATE ON public.lesson_resources
--   FOR EACH ROW EXECUTE FUNCTION public.validate_lesson_resource_metadata();

-- ============================================================
-- GAP-03 — content_review_state (review + publication, hash-bound)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.content_review_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  review_status text NOT NULL DEFAULT 'pending',
  publication_status text NOT NULL DEFAULT 'draft',
  content_hash text NOT NULL,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_review_state_entity_uniq UNIQUE (entity_type, entity_id),
  CONSTRAINT content_review_state_review_chk
    CHECK (review_status IN ('pending','approved','rejected')),
  CONSTRAINT content_review_state_publication_chk
    CHECK (publication_status IN ('draft','published','archived')),
  CONSTRAINT content_review_state_entity_type_chk
    CHECK (entity_type IN (
      'subjects','units','lessons','lesson_explanations','lesson_assessments','questions'
    ))
);

GRANT SELECT ON public.content_review_state TO authenticated;
GRANT ALL ON public.content_review_state TO service_role;

ALTER TABLE public.content_review_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content staff read review state"
  ON public.content_review_state FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "full admins manage review state"
  ON public.content_review_state FOR ALL TO authenticated
  USING (public.is_full_admin(auth.uid()))
  WITH CHECK (public.is_full_admin(auth.uid()));

-- Approval is bound to the exact content it was granted for.
CREATE OR REPLACE FUNCTION public.reset_review_state_on_hash_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content_hash IS DISTINCT FROM OLD.content_hash THEN
    NEW.review_status := 'pending';
    NEW.publication_status := 'draft';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- CREATE TRIGGER reset_review_state_on_hash_change_trg
--   BEFORE UPDATE ON public.content_review_state
--   FOR EACH ROW EXECUTE FUNCTION public.reset_review_state_on_hash_change();

-- ============================================================
-- Staging (design reference for the execute phase — not applied)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_staging_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  sheet_name text,
  row_number integer NOT NULL,
  natural_key text NOT NULL,
  row_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  planned_action text NOT NULL,
  target_id uuid,
  is_valid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_staging_rows_key_uniq UNIQUE (job_id, template_key, natural_key),
  CONSTRAINT import_staging_rows_action_chk CHECK (planned_action IN (
    'INSERT','UPDATE_DRAFT','NEW_REVISION','SKIP','BLOCKED_PUBLISHED'
  ))
);

GRANT SELECT ON public.import_staging_rows TO authenticated;
GRANT ALL ON public.import_staging_rows TO service_role;

ALTER TABLE public.import_staging_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content staff read own staging rows"
  ON public.import_staging_rows FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

-- END OF DRAFT — NOT APPLIED.
