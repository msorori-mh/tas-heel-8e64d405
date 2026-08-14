-- Migration: PAST_MINISTERIAL_EXAMS_FOUNDATION_14B
-- Phase: DB Foundation + RPC guards + isolated rehearsal only.
-- NO UI, NO demo content, NO shared-DB apply in this file.
--
-- Design reference: docs/ministerial-exams/PAST-MINISTERIAL-EXAMS-ARCHITECTURE-14A.md (TCS-2 aligned)

-- 1. New enum for ministerial exam rounds
DO $$ BEGIN
  CREATE TYPE public.ministerial_exam_round_code AS ENUM (
    'r1',       -- first round / الدور الأول
    'r2',       -- second round / الدور الثاني
    'r3',       -- third round / الدور الثالث
    'makeup'    -- supplementary / دورة استدراكية
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Ministerial exam model identity table (1:1 with exam_templates where mode = 'ministry')
CREATE TABLE IF NOT EXISTS public.ministerial_exam_models (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL UNIQUE REFERENCES public.exam_templates(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  curriculum_track_id uuid NOT NULL REFERENCES public.curriculum_tracks(id) ON DELETE RESTRICT,
  academic_year integer NOT NULL,
  round_code public.ministerial_exam_round_code NOT NULL,
  variant_code text NOT NULL,
  model_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Natural identity of a model: subject + track + year + round + variant
  CONSTRAINT ministerial_exam_models_natural_uk UNIQUE (subject_id, curriculum_track_id, academic_year, round_code, variant_code),
  CONSTRAINT ministerial_exam_models_year_positive CHECK (academic_year >= 2000 AND academic_year <= 2100),
  CONSTRAINT ministerial_exam_models_variant_not_empty CHECK (trim(variant_code) <> ''),
  CONSTRAINT ministerial_exam_models_published_requires_meta CHECK (
    status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministerial_exam_models TO authenticated;
GRANT ALL ON public.ministerial_exam_models TO service_role;

ALTER TABLE public.ministerial_exam_models ENABLE ROW LEVEL SECURITY;

-- Staff manage; authenticated read only (students need read to choose models).
DROP POLICY IF EXISTS "Content staff manage ministerial models" ON public.ministerial_exam_models;
CREATE POLICY "Content staff manage ministerial models" ON public.ministerial_exam_models
  FOR ALL
  TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read published ministerial models" ON public.ministerial_exam_models;
CREATE POLICY "Authenticated read published ministerial models" ON public.ministerial_exam_models
  FOR SELECT
  TO authenticated
  USING (status = 'published');

-- 3. Pin questions to published revisions inside a model
CREATE TABLE IF NOT EXISTS public.ministerial_exam_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id uuid NOT NULL REFERENCES public.ministerial_exam_models(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  published_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE RESTRICT,
  source_question_code text,              -- optional human reference (e.g. TCS-2 question code)
  sort_order integer NOT NULL DEFAULT 0,
  marks numeric NOT NULL DEFAULT 1 CHECK (marks > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ministerial_exam_questions_model_question_uk UNIQUE (model_id, question_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministerial_exam_questions TO authenticated;
GRANT ALL ON public.ministerial_exam_questions TO service_role;

ALTER TABLE public.ministerial_exam_questions ENABLE ROW LEVEL SECURITY;

-- Staff only for membership DML; students never SELECT directly from this table.
DROP POLICY IF EXISTS "Content staff manage ministerial question membership" ON public.ministerial_exam_questions;
CREATE POLICY "Content staff manage ministerial question membership" ON public.ministerial_exam_questions
  FOR ALL
  TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (public.is_content_staff(auth.uid()));

-- 4. Link exam sessions back to the ministerial model (nullable for legacy/training sessions)
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS ministerial_model_id uuid REFERENCES public.ministerial_exam_models(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_exam_sessions_ministerial_model ON public.exam_sessions(ministerial_model_id);

-- 5. MODEL_VALIDITY_GATE: ensure the model's subject is actually mapped to the model's track.
CREATE OR REPLACE FUNCTION public.assert_ministerial_model_track_valid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.subject_curriculum_tracks sct
    WHERE sct.subject_id = NEW.subject_id
      AND sct.curriculum_track_id = NEW.curriculum_track_id
      AND sct.is_active = true
  ) THEN
    RAISE EXCEPTION 'MODEL_VALIDITY_GATE: subject % is not mapped to track %', NEW.subject_id, NEW.curriculum_track_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ministerial_model_track_valid() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_ministerial_model_validity_gate ON public.ministerial_exam_models;
CREATE TRIGGER trg_ministerial_model_validity_gate
BEFORE INSERT OR UPDATE ON public.ministerial_exam_models
FOR EACH ROW
EXECUTE FUNCTION public.assert_ministerial_model_track_valid();

-- 6. Enforce the model's linked template is mode = 'ministry' and points to the same subject.
CREATE OR REPLACE FUNCTION public.assert_ministerial_model_template_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tpl public.exam_templates;
BEGIN
  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = NEW.template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tpl.mode <> 'ministry' THEN
    RAISE EXCEPTION 'MODEL_TEMPLATE_MODE_MISMATCH: exam_template % mode is %, expected ministry',
      NEW.template_id, v_tpl.mode
      USING ERRCODE = '23503';
  END IF;

  IF v_tpl.subject_id IS DISTINCT FROM NEW.subject_id THEN
    RAISE EXCEPTION 'MODEL_TEMPLATE_SUBJECT_MISMATCH: template subject %, model subject %',
      v_tpl.subject_id, NEW.subject_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ministerial_model_template_match() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_ministerial_model_template_match ON public.ministerial_exam_models;
CREATE TRIGGER trg_ministerial_model_template_match
BEFORE INSERT OR UPDATE ON public.ministerial_exam_models
FOR EACH ROW
EXECUTE FUNCTION public.assert_ministerial_model_template_match();

-- 7. Guard: a question revision must be PUBLISHED and belong to the membership question,
--    and the question must belong to the model's subject.
CREATE OR REPLACE FUNCTION public.assert_ministerial_question_publishable(
  _model_id uuid,
  _question_id uuid,
  _revision_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_model public.ministerial_exam_models;
  v_rev public.question_revisions;
  v_question public.questions;
BEGIN
  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_rev
  FROM public.question_revisions
  WHERE id = _revision_id
    AND question_id = _question_id
    AND status = 'PUBLISHED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MINISTERIAL_QUESTION_NOT_PUBLISHED: question % revision % is not PUBLISHED', _question_id, _revision_id
      USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_question FROM public.questions WHERE id = _question_id;
  IF NOT FOUND OR v_question.subject_id IS DISTINCT FROM v_model.subject_id THEN
    RAISE EXCEPTION 'MINISTERIAL_QUESTION_SUBJECT_MISMATCH: question % must belong to model subject %',
      _question_id, v_model.subject_id
      USING ERRCODE = '23503';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ministerial_question_publishable(uuid, uuid, uuid) FROM PUBLIC, anon;

-- 8. Pre-insert validation trigger for membership rows
CREATE OR REPLACE FUNCTION public.assert_ministerial_membership_valid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_ministerial_question_publishable(NEW.model_id, NEW.question_id, NEW.published_revision_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ministerial_membership_valid() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_ministerial_membership_valid ON public.ministerial_exam_questions;
CREATE TRIGGER trg_ministerial_membership_valid
BEFORE INSERT OR UPDATE ON public.ministerial_exam_questions
FOR EACH ROW
EXECUTE FUNCTION public.assert_ministerial_membership_valid();

-- 9. Publish gate: exact set equality between exam_template_questions and ministerial_exam_questions.
CREATE OR REPLACE FUNCTION public.can_publish_ministerial_model(_model_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_model public.ministerial_exam_models;
  v_template_count integer;
  v_membership_count integer;
  v_mismatch_count integer;
BEGIN
  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_model.status <> 'draft' THEN
    RETURN false;
  END IF;

  SELECT COUNT(*) INTO v_template_count
  FROM public.exam_template_questions
  WHERE template_id = v_model.template_id;

  SELECT COUNT(*) INTO v_membership_count
  FROM public.ministerial_exam_questions
  WHERE model_id = _model_id;

  IF v_template_count = 0 OR v_membership_count = 0 THEN
    RETURN false;
  END IF;

  IF v_template_count <> v_membership_count THEN
    RETURN false;
  END IF;

  -- Any template question missing from membership, or membership question missing from template?
  SELECT COUNT(*) INTO v_mismatch_count
  FROM (
    SELECT question_id FROM public.exam_template_questions WHERE template_id = v_model.template_id
    EXCEPT
    SELECT question_id FROM public.ministerial_exam_questions WHERE model_id = _model_id
  ) missing
  UNION ALL
  SELECT COUNT(*) FROM (
    SELECT question_id FROM public.ministerial_exam_questions WHERE model_id = _model_id
    EXCEPT
    SELECT question_id FROM public.exam_template_questions WHERE template_id = v_model.template_id
  ) extra;

  RETURN v_mismatch_count = 0;
END;
$$;

REVOKE ALL ON FUNCTION public.can_publish_ministerial_model(uuid) FROM PUBLIC, anon;

-- 10. Publish action (idempotent): only content staff may publish, and only when gate passes.
CREATE OR REPLACE FUNCTION public.publish_ministerial_model(_model_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_publish_ministerial_model(_model_id) THEN
    RAISE EXCEPTION 'MINISTERIAL_PUBLISH_GATE_FAILED: model % cannot be published', _model_id
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.ministerial_exam_models
  SET status = 'published',
      published_at = now(),
      published_by = v_actor,
      updated_at = now()
  WHERE id = _model_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'model_already_published_or_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_ministerial_model(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_ministerial_model(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_ministerial_model(uuid) TO service_role;

-- 11. Guard legacy RPCs so ministry templates cannot be started via the general path.
CREATE OR REPLACE FUNCTION public.assert_exam_template_not_ministry_bypassed(_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode public.exam_mode;
BEGIN
  SELECT mode INTO v_mode FROM public.exam_templates WHERE id = _template_id;
  IF v_mode = 'ministry' THEN
    RAISE EXCEPTION 'MINISTRY_TEMPLATE_BYPASS_BLOCKED: template % must be started via create_ministerial_exam_session()',
      _template_id
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_exam_template_not_ministry_bypassed(uuid) FROM PUBLIC, anon;

-- 12. Patch legacy start_exam_session to reject ministry templates.
CREATE OR REPLACE FUNCTION public.start_exam_session(_template_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tpl public.exam_templates;
  v_subject_id uuid;
  v_subject record;
  v_profile record;
  v_session_id uuid;
  v_total_q integer := 0;
  v_total_pts numeric := 0;
  v_expires timestamptz;
  v_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = _template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_tpl.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'template_inactive' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_exam_template_not_ministry_bypassed(_template_id);

  v_subject_id := v_tpl.subject_id;
  IF v_subject_id IS NULL AND v_tpl.unit_id IS NOT NULL THEN
    SELECT u.subject_id INTO v_subject_id FROM public.units u WHERE u.id = v_tpl.unit_id;
  END IF;
  IF v_subject_id IS NULL AND v_tpl.lesson_id IS NOT NULL THEN
    SELECT l.subject_id INTO v_subject_id FROM public.lessons l WHERE l.id = v_tpl.lesson_id;
  END IF;
  IF v_subject_id IS NULL THEN
    RAISE EXCEPTION 'template_scope_missing' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.grade_id, s.curriculum_track_id
  INTO v_subject
  FROM public.subjects s
  WHERE s.id = v_subject_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template_scope_missing' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_user, 'admin'::app_role);

  IF NOT v_is_admin THEN
    SELECT p.grade_id, p.grade_uuid, p.curriculum_track_id
    INTO v_profile
    FROM public.profiles p
    WHERE p.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'grade_mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT public.user_can_access_subject_curriculum(v_subject_id) THEN
      RAISE EXCEPTION 'curriculum_mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT (
      (v_profile.grade_uuid IS NOT NULL AND v_profile.grade_uuid = v_subject.grade_id)
      OR (v_profile.grade_id IS NOT NULL AND v_profile.grade_id = v_subject.grade_id::text)
    ) THEN
      RAISE EXCEPTION 'grade_mismatch' USING ERRCODE = '42501';
    END IF;
    -- Subscription/is_free gate removed: student free access phase.
  END IF;

  SELECT COUNT(*), COALESCE(SUM(points), 0)
  INTO v_total_q, v_total_pts
  FROM public.exam_template_questions
  WHERE template_id = _template_id;

  IF v_total_q = 0 THEN
    RAISE EXCEPTION 'template_has_no_questions' USING ERRCODE = '22023';
  END IF;

  IF v_tpl.duration_seconds IS NOT NULL THEN
    v_expires := now() + make_interval(secs => v_tpl.duration_seconds);
  END IF;

  INSERT INTO public.exam_sessions (
    user_id, template_id, mode, status, expires_at, total_questions, total_points
  )
  VALUES (
    v_user, _template_id, v_tpl.mode, 'in_progress', v_expires, v_total_q, v_total_pts
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.exam_session_answers (session_id, question_id)
  SELECT v_session_id, tq.question_id
  FROM public.exam_template_questions tq
  WHERE tq.template_id = _template_id
  ORDER BY tq.sort_order;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_exam_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_exam_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_exam_session(uuid) TO service_role;

-- 13. Patch the snapshot stub to also reject ministry templates.
CREATE OR REPLACE FUNCTION public.create_exam_session_with_snapshot(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  PERFORM public.assert_exam_template_not_ministry_bypassed(p_template_id);

  SELECT attempt_pin_mode INTO v_mode
  FROM public.question_bank_runtime_config
  WHERE id = 1
  FOR SHARE;

  IF v_mode = 'REVISION_PINNED' THEN
    RAISE EXCEPTION 'REVISION_PINNED path not activated';
  END IF;

  RAISE EXCEPTION 'QB-01 snapshot create not activated; use legacy RPCs';
END;
$$;

REVOKE ALL ON FUNCTION public.create_exam_session_with_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_exam_session_with_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_exam_session_with_snapshot(uuid) TO service_role;

-- 14. Dedicated ministry session creator: creates a frozen REVISION_PINNED snapshot for the student.
CREATE OR REPLACE FUNCTION public.create_ministerial_exam_session(_model_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_model public.ministerial_exam_models;
  v_tpl public.exam_templates;
  v_session_id uuid;
  v_total_q integer := 0;
  v_total_pts numeric := 0;
  v_expires timestamptz;
  v_membership record;
  v_option record;
  v_rendered_options jsonb;
  v_option_mapping jsonb;
  v_display_index integer;
  v_question_order integer := 0;
  v_esq_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_model.status <> 'published' THEN
    RAISE EXCEPTION 'MINISTERIAL_MODEL_NOT_PUBLISHED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = v_model.template_id;
  IF NOT FOUND OR v_tpl.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'template_inactive' USING ERRCODE = '42501';
  END IF;

  -- Student must belong to the same grade and track as the model.
  IF NOT public.can_access_subject(v_model.subject_id) THEN
    RAISE EXCEPTION 'curriculum_or_grade_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(marks), 0)
  INTO v_total_q, v_total_pts
  FROM public.ministerial_exam_questions
  WHERE model_id = _model_id;

  IF v_total_q = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_MODEL_HAS_NO_QUESTIONS' USING ERRCODE = '22023';
  END IF;

  IF v_tpl.duration_seconds IS NOT NULL THEN
    v_expires := now() + make_interval(secs => v_tpl.duration_seconds);
  END IF;

  INSERT INTO public.exam_sessions (
    user_id, template_id, mode, status, expires_at, total_questions, total_points,
    attempt_pin_mode, grading_status, ministerial_model_id
  )
  VALUES (
    v_user, v_model.template_id, 'ministry', 'in_progress', v_expires, v_total_q, v_total_pts,
    'REVISION_PINNED', 'IN_PROGRESS', _model_id
  )
  RETURNING id INTO v_session_id;

  FOR v_membership IN
    SELECT meq.*, qr.question_text, qr.stimulus_text, qr.payload_hash, qr.interaction_type, q.id AS logical_question_id
    FROM public.ministerial_exam_questions meq
    JOIN public.question_revisions qr ON qr.id = meq.published_revision_id
    JOIN public.questions q ON q.id = meq.question_id
    WHERE meq.model_id = _model_id
    ORDER BY meq.sort_order
  LOOP
    v_question_order := v_question_order + 1;
    v_rendered_options := '[]'::jsonb;
    v_option_mapping := '[]'::jsonb;
    v_display_index := 0;

    FOR v_option IN
      SELECT id, option_code, body, sort_order
      FROM public.question_options
      WHERE question_revision_id = v_membership.published_revision_id
      ORDER BY sort_order
    LOOP
      v_rendered_options := v_rendered_options || jsonb_build_object(
        'option_code', v_option.option_code,
        'body', v_option.body
      );
      v_option_mapping := v_option_mapping || jsonb_build_object(
        'display_index', v_display_index,
        'original_index', v_option.sort_order
      );
      v_display_index := v_display_index + 1;
    END LOOP;

    INSERT INTO public.exam_session_questions (
      exam_session_id,
      question_revision_id,
      logical_question_id,
      question_order,
      rendered_question_text,
      rendered_stimulus_text,
      rendered_options,
      option_order_mapping,
      max_score,
      payload_hash,
      payload_hash_version,
      pin_mode
    )
    VALUES (
      v_session_id,
      v_membership.published_revision_id,
      v_membership.logical_question_id,
      v_question_order,
      v_membership.question_text,
      v_membership.stimulus_text,
      v_rendered_options,
      v_option_mapping,
      v_membership.marks,
      v_membership.payload_hash,
      'canonical_payload_v1',
      'REVISION_PINNED'
    )
    RETURNING id INTO v_esq_id;

    INSERT INTO public.exam_session_answers (
      session_id, question_id, exam_session_question_id, question_revision_id,
      max_score, pin_mode
    )
    VALUES (
      v_session_id, v_membership.logical_question_id, v_esq_id, v_membership.published_revision_id,
      v_membership.marks, 'REVISION_PINNED'
    );
  END LOOP;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ministerial_exam_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ministerial_exam_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ministerial_exam_session(uuid) TO service_role;

-- 15. updated_at trigger for ministerial_exam_models
CREATE OR REPLACE FUNCTION public.update_ministerial_model_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_ministerial_model_updated_at() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_update_ministerial_model_updated_at ON public.ministerial_exam_models;
CREATE TRIGGER trg_update_ministerial_model_updated_at
BEFORE UPDATE ON public.ministerial_exam_models
FOR EACH ROW
EXECUTE FUNCTION public.update_ministerial_model_updated_at();

-- 16. Hardening: prevent direct deletion of published models (staff must archive via status or admin RPC)
CREATE OR REPLACE FUNCTION public.guard_ministerial_model_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'MINISTERIAL_PUBLISHED_MODEL_IMMUTABLE: cannot delete published model %', OLD.id
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ministerial_model_delete() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_ministerial_model_delete ON public.ministerial_exam_models;
CREATE TRIGGER trg_guard_ministerial_model_delete
BEFORE DELETE ON public.ministerial_exam_models
FOR EACH ROW
EXECUTE FUNCTION public.guard_ministerial_model_delete();

-- 17. Hardening: prevent mutation of published model membership (revision pinning contract)
CREATE OR REPLACE FUNCTION public.guard_ministerial_membership_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_model_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_model_status FROM public.ministerial_exam_models WHERE id = OLD.model_id;
  ELSE
    SELECT status INTO v_model_status FROM public.ministerial_exam_models WHERE id = NEW.model_id;
  END IF;

  IF v_model_status = 'published' THEN
    RAISE EXCEPTION 'MINISTERIAL_PUBLISHED_MEMBERSHIP_IMMUTABLE: cannot change membership of published model'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ministerial_membership_immutable() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_ministerial_membership_immutable ON public.ministerial_exam_questions;
CREATE TRIGGER trg_guard_ministerial_membership_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.ministerial_exam_questions
FOR EACH ROW
EXECUTE FUNCTION public.guard_ministerial_membership_immutable();
