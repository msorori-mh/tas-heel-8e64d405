-- ============================================================================
-- Migration: IMPORT_STAGING_AND_EXECUTION_IMPLEMENTATION_03
-- Created At: 2026-08-13
-- Status: REVIEW-READY, **NOT APPLIED**.
--
-- Location note: the platform reserves supabase/migrations/ for migrations that
-- are executed on apply. Phase 03 explicitly forbids applying anything, so the
-- real migration file lives in supabase/migrations-pending/ until the
-- NON_PROD_MIGRATION_APPLY_REVIEW gate is opened. Its content is final and is
-- meant to be applied byte-for-byte at that gate.
--
-- Scope: staging + execute foundation for content import templates 01-09.
--
-- Hard rules encoded here (phase 02B corrections are binding):
--   * dry-run / validate writes NOTHING. Staging is a separate `prepare` step
--     and only ever happens through import_stage_rows().
--   * No trigger in this file is commented out. A commented security trigger
--     is an unenforced trigger.
--   * No GRANT to anon anywhere.
--   * authenticated gets SELECT only (under RLS). Every mutation of the new
--     tables goes through a SECURITY DEFINER RPC with a fixed search_path.
--   * Atomicity lives in the database: one RPC call == one transaction ==
--     one template applied completely or not at all.
--   * Questions (template 09) never enter through the generic upsert path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0.A GUARD (04A / H-1) — resource identity must stay single-columned.
--     The one physical identity for a lesson resource is
--     lesson_resources.resource_code. A `code` column on that table would mean
--     two competing identities, so this migration FAILS CLOSED and reports the
--     drift instead of renaming, merging or silently picking one.
-- ----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'lesson_resources'
       AND column_name = 'code'
  ) THEN
    RAISE EXCEPTION
      'SCHEMA_DRIFT: public.lesson_resources.code exists. resource identity is lesson_resources.resource_code only; refusing to apply (no automatic rename/merge).'
      USING ERRCODE = '55000';
  END IF;
END
$guard$;

-- ----------------------------------------------------------------------------
-- 0.B Order-independent prerequisite (04A / H-1).
--     lesson_resources.resource_code is defined by the content_html chain
--     (20260808060000 + 20260809010000). Those migrations are idempotent and
--     may be applied before OR after this one, so the same objects are declared
--     here with identical semantics. Applying either order converges.
-- ----------------------------------------------------------------------------
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS resource_code text,
  ADD COLUMN IF NOT EXISTS html_resource_type text;

CREATE OR REPLACE FUNCTION public.normalize_resource_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NULLIF(lower(regexp_replace(p_code, '^\s+|\s+$', '', 'g')), '');
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_resource_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_resource_code(text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.normalize_lesson_resource_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.resource_code IS NOT NULL THEN
    IF public.normalize_resource_code(NEW.resource_code) IS NULL THEN
      RAISE EXCEPTION 'resource_code cannot be empty or whitespace only' USING ERRCODE = '23514';
    END IF;
    NEW.resource_code := public.normalize_resource_code(NEW.resource_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lesson_resource_code ON public.lesson_resources;
CREATE TRIGGER trg_normalize_lesson_resource_code
  BEFORE INSERT OR UPDATE ON public.lesson_resources
  FOR EACH ROW EXECUTE FUNCTION public.normalize_lesson_resource_code();

CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_resources_code_per_lesson
  ON public.lesson_resources (lesson_id, resource_code)
  WHERE resource_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 0. Canonical code normalization shared by the new identity columns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_content_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NULLIF(lower(regexp_replace(p_code, '^\s+|\s+$', '', 'g')), '');
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_content_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_content_code(text) TO authenticated, service_role;



-- ----------------------------------------------------------------------------
-- 1. GAP-01 — lesson_assessments.assessment_code (GLOBAL uniqueness)
--    Template 08 references an assessment by assessment_code alone.
-- ----------------------------------------------------------------------------
ALTER TABLE public.lesson_assessments
  ADD COLUMN IF NOT EXISTS assessment_code text;

CREATE OR REPLACE FUNCTION public.normalize_lesson_assessment_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.assessment_code IS NOT NULL THEN
    IF public.normalize_content_code(NEW.assessment_code) IS NULL THEN
      RAISE EXCEPTION 'assessment_code cannot be empty or whitespace only' USING ERRCODE = '23514';
    END IF;
    NEW.assessment_code := public.normalize_content_code(NEW.assessment_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lesson_assessment_code ON public.lesson_assessments;
CREATE TRIGGER trg_normalize_lesson_assessment_code
  BEFORE INSERT OR UPDATE ON public.lesson_assessments
  FOR EACH ROW EXECUTE FUNCTION public.normalize_lesson_assessment_code();

DROP INDEX IF EXISTS public.lesson_assessments_code_uniq;
CREATE UNIQUE INDEX lesson_assessments_code_uniq
  ON public.lesson_assessments (assessment_code)
  WHERE assessment_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. GAP-02 — stable child identity for explanations
--    lesson_resources.resource_code already exists (content HTML alignment).
--    sort_order is presentation only and is deliberately NOT part of identity.
-- ----------------------------------------------------------------------------
ALTER TABLE public.lesson_explanations
  ADD COLUMN IF NOT EXISTS explanation_code text;

CREATE OR REPLACE FUNCTION public.normalize_lesson_explanation_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.explanation_code IS NOT NULL THEN
    IF public.normalize_content_code(NEW.explanation_code) IS NULL THEN
      RAISE EXCEPTION 'explanation_code cannot be empty or whitespace only' USING ERRCODE = '23514';
    END IF;
    NEW.explanation_code := public.normalize_content_code(NEW.explanation_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lesson_explanation_code ON public.lesson_explanations;
CREATE TRIGGER trg_normalize_lesson_explanation_code
  BEFORE INSERT OR UPDATE ON public.lesson_explanations
  FOR EACH ROW EXECUTE FUNCTION public.normalize_lesson_explanation_code();

DROP INDEX IF EXISTS public.lesson_explanations_code_lesson_uniq;
CREATE UNIQUE INDEX lesson_explanations_code_lesson_uniq
  ON public.lesson_explanations (lesson_id, explanation_code)
  WHERE explanation_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. GAP-05 — closed metadata allowlist for template 06
-- ----------------------------------------------------------------------------
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.validate_lesson_resource_metadata()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
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
    RAISE EXCEPTION 'lesson_resources.metadata must be a JSON object' USING ERRCODE = '23514';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.metadata) LOOP
    IF NOT (k = ANY (allowed)) THEN
      RAISE EXCEPTION 'unsupported lesson_resources.metadata key: %', k USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_lesson_resource_metadata ON public.lesson_resources;
CREATE TRIGGER trg_validate_lesson_resource_metadata
  BEFORE INSERT OR UPDATE ON public.lesson_resources
  FOR EACH ROW EXECUTE FUNCTION public.validate_lesson_resource_metadata();

-- ----------------------------------------------------------------------------
-- 4. GAP-03 — content_review_state (review + publication, hash bound)
-- ----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS content_review_state_type_publication_idx
  ON public.content_review_state (entity_type, publication_status);

-- Read-only for authenticated; every write path is an RPC.
GRANT SELECT ON public.content_review_state TO authenticated;
GRANT ALL ON public.content_review_state TO service_role;

ALTER TABLE public.content_review_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content staff read review state" ON public.content_review_state;
CREATE POLICY "content staff read review state"
  ON public.content_review_state FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

-- 4a. Fail-closed polymorphic reference (02B S4).
CREATE OR REPLACE FUNCTION public.assert_content_review_entity_exists()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  found boolean := false;
BEGIN
  CASE NEW.entity_type
    WHEN 'subjects' THEN
      SELECT EXISTS (SELECT 1 FROM public.subjects t WHERE t.id = NEW.entity_id) INTO found;
    WHEN 'units' THEN
      SELECT EXISTS (SELECT 1 FROM public.units t WHERE t.id = NEW.entity_id) INTO found;
    WHEN 'lessons' THEN
      SELECT EXISTS (SELECT 1 FROM public.lessons t WHERE t.id = NEW.entity_id) INTO found;
    WHEN 'lesson_explanations' THEN
      SELECT EXISTS (SELECT 1 FROM public.lesson_explanations t WHERE t.id = NEW.entity_id) INTO found;
    WHEN 'lesson_assessments' THEN
      SELECT EXISTS (SELECT 1 FROM public.lesson_assessments t WHERE t.id = NEW.entity_id) INTO found;
    WHEN 'questions' THEN
      SELECT EXISTS (SELECT 1 FROM public.questions t WHERE t.id = NEW.entity_id) INTO found;
    ELSE
      -- Unknown type: fail closed, never allow an unverifiable reference.
      RAISE EXCEPTION 'unsupported content_review_state.entity_type: %', NEW.entity_type
        USING ERRCODE = '23514';
  END CASE;

  IF NOT found THEN
    RAISE EXCEPTION 'content_review_state references a missing % row: %', NEW.entity_type, NEW.entity_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_content_review_entity_exists ON public.content_review_state;
CREATE TRIGGER trg_assert_content_review_entity_exists
  BEFORE INSERT OR UPDATE OF entity_type, entity_id ON public.content_review_state
  FOR EACH ROW EXECUTE FUNCTION public.assert_content_review_entity_exists();

-- 4b. Approval is bound to the exact content it was granted for.
CREATE OR REPLACE FUNCTION public.reset_review_state_on_hash_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
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

DROP TRIGGER IF EXISTS trg_reset_review_state_on_hash_change ON public.content_review_state;
CREATE TRIGGER trg_reset_review_state_on_hash_change
  BEFORE UPDATE ON public.content_review_state
  FOR EACH ROW EXECUTE FUNCTION public.reset_review_state_on_hash_change();

-- 4c. No orphan review state: cleanup on entity delete.
CREATE OR REPLACE FUNCTION public.cleanup_content_review_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.content_review_state
  WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_review_state_subjects ON public.subjects;
CREATE TRIGGER trg_cleanup_review_state_subjects
  AFTER DELETE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_content_review_state('subjects');

DROP TRIGGER IF EXISTS trg_cleanup_review_state_units ON public.units;
CREATE TRIGGER trg_cleanup_review_state_units
  AFTER DELETE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_content_review_state('units');

DROP TRIGGER IF EXISTS trg_cleanup_review_state_lessons ON public.lessons;
CREATE TRIGGER trg_cleanup_review_state_lessons
  AFTER DELETE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_content_review_state('lessons');

DROP TRIGGER IF EXISTS trg_cleanup_review_state_explanations ON public.lesson_explanations;
CREATE TRIGGER trg_cleanup_review_state_explanations
  AFTER DELETE ON public.lesson_explanations
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_content_review_state('lesson_explanations');

DROP TRIGGER IF EXISTS trg_cleanup_review_state_assessments ON public.lesson_assessments;
CREATE TRIGGER trg_cleanup_review_state_assessments
  AFTER DELETE ON public.lesson_assessments
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_content_review_state('lesson_assessments');

DROP TRIGGER IF EXISTS trg_cleanup_review_state_questions ON public.questions;
CREATE TRIGGER trg_cleanup_review_state_questions
  AFTER DELETE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_content_review_state('questions');

-- ----------------------------------------------------------------------------
-- 5. Staging rows
-- ----------------------------------------------------------------------------
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
  applied_action text,
  applied_at timestamptz,
  target_id uuid,
  is_valid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_staging_rows_key_uniq UNIQUE (job_id, template_key, natural_key),
  CONSTRAINT import_staging_rows_action_chk CHECK (planned_action IN (
    'INSERT','UPDATE_DRAFT','NEW_REVISION','SKIP','BLOCKED_PUBLISHED'
  )),
  CONSTRAINT import_staging_rows_applied_action_chk CHECK (applied_action IS NULL OR applied_action IN (
    'INSERT','UPDATE_DRAFT','NEW_REVISION','SKIP','BLOCKED_PUBLISHED'
  ))
);

CREATE INDEX IF NOT EXISTS import_staging_rows_job_template_idx
  ON public.import_staging_rows (job_id, template_key, row_number);

GRANT SELECT ON public.import_staging_rows TO authenticated;
GRANT ALL ON public.import_staging_rows TO service_role;

ALTER TABLE public.import_staging_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read own job staging rows" ON public.import_staging_rows;
CREATE POLICY "staff read own job staging rows"
  ON public.import_staging_rows FOR SELECT TO authenticated
  USING (
    public.is_content_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.import_jobs j
      WHERE j.id = import_staging_rows.job_id
        AND j.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "full admins read all staging rows" ON public.import_staging_rows;
CREATE POLICY "full admins read all staging rows"
  ON public.import_staging_rows FOR SELECT TO authenticated
  USING (public.is_full_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 6. Execution state machine on import_jobs
--    validated → planned → applying → applied | failed
-- ----------------------------------------------------------------------------
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS execution_state text NOT NULL DEFAULT 'validated',
  ADD COLUMN IF NOT EXISTS staged_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

ALTER TABLE public.import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_execution_state_chk;
ALTER TABLE public.import_jobs
  ADD CONSTRAINT import_jobs_execution_state_chk
  CHECK (execution_state IN ('validated','planned','applying','applied','failed'));

-- ----------------------------------------------------------------------------
-- 7. Authorization helper (job ownership isolation + concurrency lock)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_import_job_operator(_job_id uuid)
RETURNS public.import_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  job public.import_jobs;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_staff(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  -- Concurrency guard: serialize every operation on this job.
  SELECT * INTO job FROM public.import_jobs WHERE id = _job_id FOR UPDATE;

  IF job.id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_JOB_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF job.created_by <> auth.uid() AND NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_JOB_OWNER' USING ERRCODE = '42501';
  END IF;

  RETURN job;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_import_job_operator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_import_job_operator(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 8. Idempotency planner — one place decides the action for a row
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_plan_row_action(
  _entity_type text,
  _entity_id uuid,
  _incoming_hash text
)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  st public.content_review_state;
BEGIN
  IF _entity_id IS NULL THEN
    RETURN 'INSERT';
  END IF;

  SELECT * INTO st FROM public.content_review_state
  WHERE entity_type = _entity_type AND entity_id = _entity_id;

  IF st.id IS NULL THEN
    -- Legacy row with no review state yet: treat as draft, never as published.
    RETURN 'UPDATE_DRAFT';
  END IF;

  IF st.content_hash = _incoming_hash THEN
    RETURN 'SKIP';
  END IF;

  IF st.publication_status = 'draft' THEN
    RETURN 'UPDATE_DRAFT';
  END IF;

  RETURN 'BLOCKED_PUBLISHED';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_plan_row_action(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_plan_row_action(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.import_touch_review_state(
  _entity_type text,
  _entity_id uuid,
  _content_hash text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.content_review_state (entity_type, entity_id, content_hash)
  VALUES (_entity_type, _entity_id, _content_hash)
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET content_hash = EXCLUDED.content_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_touch_review_state(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_touch_review_state(text, uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 9. Review / publication RPC — the ONLY write path for content_review_state
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.content_review_set_state(
  _entity_type text,
  _entity_id uuid,
  _review_status text,
  _publication_status text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  st public.content_review_state;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _review_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'INVALID_REVIEW_STATUS' USING ERRCODE = '22023';
  END IF;

  IF _publication_status NOT IN ('draft','published','archived') THEN
    RAISE EXCEPTION 'INVALID_PUBLICATION_STATUS' USING ERRCODE = '22023';
  END IF;

  IF _publication_status = 'published' AND _review_status <> 'approved' THEN
    RAISE EXCEPTION 'PUBLISH_REQUIRES_APPROVAL' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO st FROM public.content_review_state
  WHERE entity_type = _entity_type AND entity_id = _entity_id
  FOR UPDATE;

  IF st.id IS NULL THEN
    RAISE EXCEPTION 'REVIEW_STATE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.content_review_state
     SET review_status = _review_status,
         publication_status = _publication_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = st.id;

  RETURN jsonb_build_object(
    'entity_type', _entity_type,
    'entity_id', _entity_id,
    'review_status', _review_status,
    'publication_status', _publication_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.content_review_set_state(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_review_set_state(text, uuid, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. prepare / stage — the only write path into import_staging_rows
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_stage_rows(
  _job_id uuid,
  _template_key text,
  _rows jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  job public.import_jobs;
  r jsonb;
  staged integer := 0;
BEGIN
  job := public.assert_import_job_operator(_job_id);

  IF job.execution_state NOT IN ('validated','planned') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: % → planned', job.execution_state USING ERRCODE = '55000';
  END IF;

  IF jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_STAGING_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.import_staging_rows
  WHERE job_id = _job_id AND template_key = _template_key;

  FOR r IN SELECT jsonb_array_elements(_rows) LOOP
    BEGIN
      INSERT INTO public.import_staging_rows (
        job_id, template_key, sheet_name, row_number, natural_key, row_hash,
        payload, resolved_refs, planned_action, is_valid
      ) VALUES (
        _job_id,
        _template_key,
        r->>'sheet_name',
        (r->>'row_number')::integer,
        r->>'natural_key',
        r->>'row_hash',
        COALESCE(r->'payload', '{}'::jsonb),
        COALESCE(r->'resolved_refs', '{}'::jsonb),
        COALESCE(r->>'planned_action', 'INSERT'),
        COALESCE((r->>'is_valid')::boolean, false)
      );
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'DUPLICATE_NATURAL_KEY: % (row %)', r->>'natural_key', r->>'row_number'
        USING ERRCODE = '23505';
    END;
    staged := staged + 1;
  END LOOP;

  UPDATE public.import_jobs
     SET execution_state = 'planned',
         staged_at = now(),
         updated_at = now()
   WHERE id = _job_id;

  RETURN jsonb_build_object('job_id', _job_id, 'template_key', _template_key, 'staged_rows', staged);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_stage_rows(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_stage_rows(uuid, text, jsonb) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. execute — one RPC call == one transaction == one template
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_execute_template(
  _job_id uuid,
  _template_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  job public.import_jobs;
  row_rec public.import_staging_rows;
  p jsonb;
  action text;
  entity_type text;
  target uuid;
  subject uuid;
  lesson uuid;
  unit uuid;
  inserted integer := 0;
  updated integer := 0;
  skipped integer := 0;
  blocked integer := 0;
BEGIN
  -- Questions never enter through the generic upsert path.
  IF _template_key = 'questions' THEN
    RAISE EXCEPTION 'QUESTION_BANK_WORKFLOW_REQUIRED' USING ERRCODE = '0A000';
  END IF;

  job := public.assert_import_job_operator(_job_id);

  IF job.execution_state <> 'planned' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: % → applying', job.execution_state USING ERRCODE = '55000';
  END IF;

  UPDATE public.import_jobs
     SET execution_state = 'applying', updated_at = now()
   WHERE id = _job_id;

  FOR row_rec IN
    SELECT * FROM public.import_staging_rows
    WHERE job_id = _job_id AND template_key = _template_key
    ORDER BY row_number
  LOOP
    IF NOT row_rec.is_valid THEN
      RAISE EXCEPTION 'INVALID_STAGED_ROW: row %', row_rec.row_number USING ERRCODE = '22023';
    END IF;

    p := row_rec.payload;
    target := NULL;
    subject := NULL;
    lesson := NULL;
    unit := NULL;

    -- Reference resolution is recomputed here; dry-run output is never trusted.
    IF p ? 'subject_code' THEN
      SELECT s.id INTO subject FROM public.subjects s WHERE s.code = p->>'subject_code';
    END IF;

    IF p ? 'lesson_code' AND subject IS NOT NULL THEN
      SELECT l.id INTO lesson FROM public.lessons l
      WHERE l.subject_id = subject AND l.slug = p->>'lesson_code';
    END IF;

    IF p ? 'unit_code' AND subject IS NOT NULL THEN
      SELECT u.id INTO unit FROM public.units u
      WHERE u.subject_id = subject AND u.code = p->>'unit_code';
    END IF;

    CASE _template_key
      WHEN 'subjects' THEN
        entity_type := 'subjects';
        SELECT s.id INTO target FROM public.subjects s WHERE s.code = p->>'subject_code';
      WHEN 'units' THEN
        entity_type := 'units';
        IF subject IS NULL THEN
          RAISE EXCEPTION 'SUBJECT_NOT_FOUND: %', p->>'subject_code' USING ERRCODE = '23503';
        END IF;
        SELECT u.id INTO target FROM public.units u
        WHERE u.subject_id = subject AND u.code = p->>'unit_code';
      WHEN 'lessons' THEN
        entity_type := 'lessons';
        IF subject IS NULL THEN
          RAISE EXCEPTION 'SUBJECT_NOT_FOUND: %', p->>'subject_code' USING ERRCODE = '23503';
        END IF;
        SELECT l.id INTO target FROM public.lessons l
        WHERE l.subject_id = subject AND l.slug = p->>'lesson_code';
      WHEN 'explanations' THEN
        entity_type := 'lesson_explanations';
        IF lesson IS NULL THEN
          RAISE EXCEPTION 'LESSON_NOT_FOUND: %', p->>'lesson_code' USING ERRCODE = '23503';
        END IF;
        SELECT e.id INTO target FROM public.lesson_explanations e
        WHERE e.lesson_id = lesson
          AND e.explanation_code = public.normalize_content_code(p->>'explanation_code');
      WHEN 'assessments' THEN
        entity_type := 'lesson_assessments';
        IF lesson IS NULL THEN
          RAISE EXCEPTION 'LESSON_NOT_FOUND: %', p->>'lesson_code' USING ERRCODE = '23503';
        END IF;
        SELECT a.id INTO target FROM public.lesson_assessments a
        WHERE a.assessment_code = public.normalize_content_code(p->>'assessment_code');
      WHEN 'book_contents', 'resources', 'assessment_questions' THEN
        entity_type := NULL; -- child payloads with no review-state identity of their own
        IF lesson IS NULL AND _template_key <> 'assessment_questions' THEN
          RAISE EXCEPTION 'LESSON_NOT_FOUND: %', p->>'lesson_code' USING ERRCODE = '23503';
        END IF;
        -- Child targets resolve BEFORE the action decision so a replay is a no-op.
        IF _template_key = 'book_contents' THEN
          SELECT b.id INTO target FROM public.lesson_book_contents b
          WHERE b.lesson_id = lesson;
        ELSIF _template_key = 'resources' THEN
          SELECT r.id INTO target FROM public.lesson_resources r
          WHERE r.lesson_id = lesson
            AND r.resource_code = public.normalize_content_code(p->>'resource_code');
        ELSE
          SELECT aq.id INTO target
          FROM public.assessment_questions aq
          JOIN public.lesson_assessments a ON a.id = aq.assessment_id
          JOIN public.questions q ON q.id = aq.question_id
          WHERE a.assessment_code = public.normalize_content_code(p->>'assessment_code')
            AND q.code = p->>'question_code';
        END IF;
      ELSE
        RAISE EXCEPTION 'UNSUPPORTED_TEMPLATE: %', _template_key USING ERRCODE = '0A000';
    END CASE;

    -- BLOCKED_PUBLISHED is decided BEFORE any domain write happens.
    IF entity_type IS NOT NULL THEN
      action := public.import_plan_row_action(entity_type, target, row_rec.row_hash);
    ELSIF target IS NULL THEN
      action := 'INSERT';
    ELSIF EXISTS (
      SELECT 1 FROM public.import_staging_rows s
      WHERE s.template_key = _template_key
        AND s.natural_key = row_rec.natural_key
        AND s.row_hash = row_rec.row_hash
        AND s.id <> row_rec.id
        AND s.applied_action IN ('INSERT','UPDATE_DRAFT','SKIP')
    ) THEN
      -- identical child payload already applied → idempotent replay
      action := 'SKIP';
    ELSE
      action := 'UPDATE_DRAFT';

    END IF;

    IF action = 'BLOCKED_PUBLISHED' THEN
      blocked := blocked + 1;
      UPDATE public.import_staging_rows
         SET applied_action = 'BLOCKED_PUBLISHED', target_id = target
       WHERE id = row_rec.id;
      CONTINUE;
    END IF;

    IF action = 'SKIP' THEN
      skipped := skipped + 1;
      UPDATE public.import_staging_rows
         SET applied_action = 'SKIP', target_id = target, applied_at = now()
       WHERE id = row_rec.id;
      CONTINUE;
    END IF;

    CASE _template_key
      WHEN 'subjects' THEN
        IF target IS NULL THEN
          INSERT INTO public.subjects (code, slug, name, grade_id, curriculum_track_id, semester, icon, color, sort_order)
          VALUES (
            p->>'subject_code',
            p->>'slug',
            p->>'name',
            (SELECT g.id FROM public.grades g WHERE g.slug = p->>'grade_slug'),
            (SELECT t.id FROM public.curriculum_tracks t WHERE t.track_code = p->>'track_code'),
            NULLIF(p->>'semester','')::integer,
            NULLIF(p->>'icon',''),
            NULLIF(p->>'color',''),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.subjects SET
            name = p->>'name',
            semester = NULLIF(p->>'semester','')::integer,
            icon = NULLIF(p->>'icon',''),
            color = NULLIF(p->>'color',''),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order)
          WHERE id = target;
        END IF;

      WHEN 'units' THEN
        IF target IS NULL THEN
          INSERT INTO public.units (subject_id, code, title, description, semester, is_free, sort_order)
          VALUES (
            subject,
            p->>'unit_code',
            p->>'title',
            NULLIF(p->>'description',''),
            NULLIF(p->>'semester','')::integer,
            COALESCE((p->>'is_free')::boolean, false),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.units SET
            title = p->>'title',
            description = NULLIF(p->>'description',''),
            semester = NULLIF(p->>'semester','')::integer,
            is_free = COALESCE((p->>'is_free')::boolean, is_free),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order),
            updated_at = now()
          WHERE id = target;
        END IF;

      WHEN 'lessons' THEN
        IF target IS NULL THEN
          INSERT INTO public.lessons (subject_id, unit_id, slug, title, duration, semester, is_free, sort_order)
          VALUES (
            subject,
            unit,
            p->>'lesson_code',
            p->>'title',
            NULLIF(p->>'duration',''),
            NULLIF(p->>'semester','')::integer,
            COALESCE((p->>'is_free')::boolean, false),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.lessons SET
            unit_id = COALESCE(unit, unit_id),
            title = p->>'title',
            duration = NULLIF(p->>'duration',''),
            semester = NULLIF(p->>'semester','')::integer,
            is_free = COALESCE((p->>'is_free')::boolean, is_free),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order),
            updated_at = now()
          WHERE id = target;
        END IF;

      WHEN 'book_contents' THEN
        INSERT INTO public.lesson_book_contents (lesson_id, content, pdf_url)
        VALUES (lesson, NULLIF(p->>'content',''), NULLIF(p->>'pdf_url',''))
        ON CONFLICT (lesson_id) DO UPDATE
          SET content = EXCLUDED.content,
              pdf_url = EXCLUDED.pdf_url,
              updated_at = now()
        RETURNING id INTO target;

      WHEN 'explanations' THEN
        IF target IS NULL THEN
          INSERT INTO public.lesson_explanations (lesson_id, explanation_code, title, content, sort_order)
          VALUES (
            lesson,
            p->>'explanation_code',
            NULLIF(p->>'title',''),
            p->>'content',
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.lesson_explanations SET
            title = NULLIF(p->>'title',''),
            content = p->>'content',
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order),
            updated_at = now()
          WHERE id = target;
        END IF;

      WHEN 'resources' THEN
        SELECT r.id INTO target FROM public.lesson_resources r
        WHERE r.lesson_id = lesson
          AND r.resource_code = public.normalize_content_code(p->>'resource_code');

        IF p->>'resource_url' IS NULL OR length(trim(p->>'resource_url')) = 0 THEN
          RAISE EXCEPTION 'MISSING_RESOURCE_URL: row %', row_rec.row_number USING ERRCODE = '23514';
        END IF;

        IF target IS NULL THEN
          INSERT INTO public.lesson_resources
            (lesson_id, resource_code, resource_type, title, url, description, sort_order, metadata)
          VALUES (
            lesson,
            p->>'resource_code',
            (p->>'resource_type')::public.lesson_resource_type,
            p->>'title',
            p->>'resource_url',
            NULLIF(p->>'description',''),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0),
            COALESCE(p->'metadata', '{}'::jsonb)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.lesson_resources SET
            resource_type = (p->>'resource_type')::public.lesson_resource_type,
            title = p->>'title',
            url = p->>'resource_url',
            description = NULLIF(p->>'description',''),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order),
            metadata = COALESCE(p->'metadata', '{}'::jsonb)
          WHERE id = target;
        END IF;

      WHEN 'assessments' THEN
        IF target IS NULL THEN
          INSERT INTO public.lesson_assessments (lesson_id, assessment_code, title, instructions, sort_order)
          VALUES (
            lesson,
            p->>'assessment_code',
            p->>'title',
            NULLIF(p->>'instructions',''),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.lesson_assessments SET
            title = p->>'title',
            instructions = NULLIF(p->>'instructions',''),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order)
          WHERE id = target;
        END IF;

      WHEN 'assessment_questions' THEN
        -- Link rows only. Question content itself belongs to the question bank.
        INSERT INTO public.assessment_questions (assessment_id, question_id, sort_order, points)
        SELECT a.id, q.id,
               COALESCE(NULLIF(p->>'sort_order','')::integer, 0),
               COALESCE(NULLIF(p->>'points','')::numeric, 1)
        FROM public.lesson_assessments a, public.questions q
        WHERE a.assessment_code = public.normalize_content_code(p->>'assessment_code')
          AND q.code = p->>'question_code'
        ON CONFLICT (assessment_id, question_id) DO UPDATE
          SET sort_order = EXCLUDED.sort_order,
              points = EXCLUDED.points
        RETURNING id INTO target;

        IF target IS NULL THEN
          RAISE EXCEPTION 'ASSESSMENT_QUESTION_LINK_UNRESOLVED: row %', row_rec.row_number
            USING ERRCODE = '23503';
        END IF;
      ELSE
        RAISE EXCEPTION 'UNSUPPORTED_TEMPLATE: %', _template_key USING ERRCODE = '0A000';
    END CASE;

    IF entity_type IS NOT NULL AND target IS NOT NULL THEN
      PERFORM public.import_touch_review_state(entity_type, target, row_rec.row_hash);
    END IF;

    IF action = 'INSERT' THEN
      inserted := inserted + 1;
    ELSE
      updated := updated + 1;
    END IF;

    UPDATE public.import_staging_rows
       SET applied_action = action, target_id = target, applied_at = now()
     WHERE id = row_rec.id;
  END LOOP;

  -- Counters are only written on the committed path of this transaction.
  UPDATE public.import_jobs
     SET execution_state = 'planned',
         inserted_count = inserted_count + inserted,
         updated_count = updated_count + updated,
         skipped_count = skipped_count + skipped,
         updated_at = now()
   WHERE id = _job_id;

  RETURN jsonb_build_object(
    'job_id', _job_id,
    'template_key', _template_key,
    'inserted', inserted,
    'updated', updated,
    'skipped', skipped,
    'blocked_published', blocked
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_execute_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_execute_template(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12. finalize — planned → applied | failed
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_finalize_job(
  _job_id uuid,
  _succeeded boolean,
  _error_message text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  job public.import_jobs;
  next_state text;
BEGIN
  job := public.assert_import_job_operator(_job_id);

  IF job.execution_state NOT IN ('planned','applying') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: % → applied/failed', job.execution_state USING ERRCODE = '55000';
  END IF;

  next_state := CASE WHEN _succeeded THEN 'applied' ELSE 'failed' END;

  UPDATE public.import_jobs
     SET execution_state = next_state,
         status = CASE WHEN _succeeded THEN 'completed' ELSE 'failed' END,
         applied_at = CASE WHEN _succeeded THEN now() ELSE applied_at END,
         completed_at = now(),
         error_message = _error_message,
         updated_at = now()
   WHERE id = _job_id;

  RETURN jsonb_build_object('job_id', _job_id, 'execution_state', next_state);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_finalize_job(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_finalize_job(uuid, boolean, text) TO authenticated, service_role;

-- END OF MIGRATION — reviewed in-repo, NOT applied to any database in phase 03.
