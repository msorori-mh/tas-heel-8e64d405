-- TAMKEEN CONTENT V3 / 21H
-- Hardened source-only apply candidate. NOT applied by this worktree.
--
-- This file intentionally does not backfill lifecycle rows. A missing row is
-- the existing legacy-visibility grandfather rule; creating a DRAFT/READY row
-- without an auditable prior visibility proof could change the student surface.
-- The operator must run the read-only baseline and visibility diff first.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lessons') IS NULL
     OR to_regclass('public.question_revisions') IS NULL
     OR to_regclass('public.question_options') IS NULL
     OR to_regclass('public.practice_attempts') IS NULL
     OR to_regclass('public.practice_attempt_questions') IS NULL
     OR to_regclass('public.practice_attempt_responses') IS NULL
  THEN
    RAISE EXCEPTION 'V3_PREREQUISITE_SCHEMA_MISSING';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.question_option_rationales') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'question_option_rationales'
          AND column_name = 'question_revision_id'
     ) THEN
    RAISE EXCEPTION 'V3_EXISTING_UNSAFE_ANSWER_SCHEMA: question_option_rationales';
  END IF;
  IF to_regclass('public.official_question_answers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'official_question_answers'
          AND column_name = 'revision_id'
     ) THEN
    RAISE EXCEPTION 'V3_EXISTING_UNSAFE_ANSWER_SCHEMA: official_question_answers';
  END IF;
END $$;

/* 1. Lifecycle contract: create the table if absent, but never backfill rows. */
CREATE TABLE IF NOT EXISTS public.lesson_capability_lifecycle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability = ANY (ARRAY[
    'officialBookContent','tamkeenExplanation','mindMap','simulation',
    'supportingResources','quickReview','checkUnderstanding',
    'lessonAssessment','originalBookPdf'
  ])),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','READY')),
  ready_snapshot jsonb,
  ready_hash text,
  draft_hash text,
  draft_updated_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  ready_by uuid REFERENCES auth.users(id),
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_capability_lifecycle_ready_chk
    CHECK (status <> 'READY' OR (ready_at IS NOT NULL AND ready_by IS NOT NULL)),
  CONSTRAINT lesson_capability_lifecycle_uniq UNIQUE (lesson_id, capability)
);

CREATE INDEX IF NOT EXISTS lesson_capability_lifecycle_lesson_idx
  ON public.lesson_capability_lifecycle (lesson_id);
CREATE INDEX IF NOT EXISTS lesson_capability_lifecycle_status_idx
  ON public.lesson_capability_lifecycle (status, capability);

GRANT SELECT ON TABLE public.lesson_capability_lifecycle TO authenticated;
GRANT ALL ON TABLE public.lesson_capability_lifecycle TO service_role;
REVOKE ALL ON TABLE public.lesson_capability_lifecycle FROM PUBLIC, anon;
ALTER TABLE public.lesson_capability_lifecycle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "students read ready lifecycle rows" ON public.lesson_capability_lifecycle;
CREATE POLICY "students read ready lifecycle rows"
  ON public.lesson_capability_lifecycle FOR SELECT TO authenticated
  USING (status = 'READY');
DROP POLICY IF EXISTS "content staff read all lifecycle rows" ON public.lesson_capability_lifecycle;
CREATE POLICY "content staff read all lifecycle rows"
  ON public.lesson_capability_lifecycle FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_lesson_capability_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.touch_lesson_capability_lifecycle() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_touch_lesson_capability_lifecycle ON public.lesson_capability_lifecycle;
CREATE TRIGGER trg_touch_lesson_capability_lifecycle
  BEFORE UPDATE ON public.lesson_capability_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.touch_lesson_capability_lifecycle();

CREATE OR REPLACE FUNCTION public.lesson_capability_transition(
  _lesson_id uuid, _capability text, _to_status text,
  _snapshot jsonb DEFAULT NULL, _hash text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cur public.lesson_capability_lifecycle;
  frm text;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_content_staff(uid) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _to_status NOT IN ('DRAFT','REVIEW','READY') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cur FROM public.lesson_capability_lifecycle
   WHERE lesson_id = _lesson_id AND capability = _capability FOR UPDATE;
  frm := COALESCE(cur.status, 'ABSENT');
  IF _to_status = 'READY' OR (frm = 'REVIEW' AND _to_status = 'DRAFT') THEN
    IF NOT public.is_full_admin(uid) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF _to_status = 'READY' AND frm <> 'REVIEW' THEN
    RAISE EXCEPTION 'READY_REQUIRES_REVIEW' USING ERRCODE = '22023';
  END IF;
  IF _to_status = 'READY' AND (_snapshot IS NULL OR _hash IS NULL) THEN
    RAISE EXCEPTION 'READY_REQUIRES_SNAPSHOT' USING ERRCODE = '22023';
  END IF;
  IF _to_status = 'REVIEW' AND frm <> 'DRAFT' THEN
    RAISE EXCEPTION 'REVIEW_REQUIRES_DRAFT' USING ERRCODE = '22023';
  END IF;
  IF cur.id IS NULL THEN
    IF _to_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'LIFECYCLE_ROW_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.lesson_capability_lifecycle
      (lesson_id, capability, status, draft_hash, draft_updated_at)
    VALUES (_lesson_id, _capability, 'DRAFT', _hash, now()) RETURNING * INTO cur;
  ELSE
    UPDATE public.lesson_capability_lifecycle
       SET status = _to_status,
           draft_hash = CASE WHEN _to_status = 'DRAFT' THEN COALESCE(_hash, draft_hash) ELSE draft_hash END,
           draft_updated_at = CASE WHEN _to_status = 'DRAFT' THEN now() ELSE draft_updated_at END,
           reviewed_by = CASE WHEN _to_status IN ('REVIEW','READY') THEN uid ELSE reviewed_by END,
           reviewed_at = CASE WHEN _to_status IN ('REVIEW','READY') THEN now() ELSE reviewed_at END,
           ready_snapshot = CASE WHEN _to_status = 'READY' THEN _snapshot ELSE ready_snapshot END,
           ready_hash = CASE WHEN _to_status = 'READY' THEN _hash ELSE ready_hash END,
           ready_by = CASE WHEN _to_status = 'READY' THEN uid ELSE ready_by END,
           ready_at = CASE WHEN _to_status = 'READY' THEN now() ELSE ready_at END
     WHERE id = cur.id RETURNING * INTO cur;
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'lesson_capability_lifecycle_transition', 'lesson_capability', _lesson_id,
          jsonb_build_object('lesson_id', _lesson_id, 'capability', _capability,
                             'from_status', frm, 'to_status', cur.status));
  RETURN jsonb_build_object('lesson_id', _lesson_id, 'capability', _capability,
                            'from_status', frm, 'to_status', cur.status,
                            'ready_at', cur.ready_at);
END;
$$;
REVOKE ALL ON FUNCTION public.lesson_capability_transition(uuid,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_capability_transition(uuid,text,text,jsonb,text) TO authenticated;

/* 2. Applicability: additive, and no new lifecycle rows. */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'capability_applicability') THEN
    CREATE TYPE public.capability_applicability AS ENUM ('REQUIRED', 'OPTIONAL', 'NA');
  END IF;
END $$;

ALTER TABLE public.lesson_capability_lifecycle
  ADD COLUMN IF NOT EXISTS applicability public.capability_applicability
  NOT NULL DEFAULT 'REQUIRED';

-- These are deterministic contract mappings, not content authoring:
-- simulation is optional; legacy reference-only capabilities are N/A.
UPDATE public.lesson_capability_lifecycle
   SET applicability = 'OPTIONAL'
 WHERE capability = 'simulation'
   AND applicability <> 'OPTIONAL';

UPDATE public.lesson_capability_lifecycle
   SET applicability = 'NA'
 WHERE capability IN ('supportingResources', 'originalBookPdf')
   AND applicability <> 'NA';

/* 2. Revision-pinned companion answer layer. */
CREATE TABLE IF NOT EXISTS public.question_option_rationales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  question_revision_id uuid NOT NULL,
  option_id text NOT NULL,
  why_correct text,
  why_wrong text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_id),
  CHECK (why_correct IS NOT NULL OR why_wrong IS NOT NULL),
  CONSTRAINT question_option_rationales_revision_fk
    FOREIGN KEY (question_revision_id, question_id)
    REFERENCES public.question_revisions(id, question_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS question_option_rationales_question_revision_idx
  ON public.question_option_rationales (question_id, question_revision_id);

CREATE TABLE IF NOT EXISTS public.official_question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  model_answer text,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, revision_id),
  CONSTRAINT official_question_answers_revision_fk
    FOREIGN KEY (revision_id, question_id)
    REFERENCES public.question_revisions(id, question_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS official_question_answers_revision_idx
  ON public.official_question_answers (revision_id, question_id);

/* 3. Answer-layer access: table grants are necessary for admin RLS to work;
      RLS remains the actual student deny boundary. */
REVOKE ALL ON TABLE public.question_option_rationales FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_option_rationales TO authenticated;
GRANT ALL ON TABLE public.question_option_rationales TO service_role;
ALTER TABLE public.question_option_rationales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage option rationales" ON public.question_option_rationales;
CREATE POLICY "admins manage option rationales"
  ON public.question_option_rationales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON TABLE public.official_question_answers FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.official_question_answers TO authenticated;
GRANT ALL ON TABLE public.official_question_answers TO service_role;
ALTER TABLE public.official_question_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage official answers" ON public.official_question_answers;
CREATE POLICY "admins manage official answers"
  ON public.official_question_answers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

/* Published revisions are immutable history. A correction is a new revision. */
CREATE OR REPLACE FUNCTION public.reject_v3_answer_layer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'V3_ANSWER_LAYER_IMMUTABLE';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_v3_answer_layer_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_v3_rationales_immutable ON public.question_option_rationales;
CREATE TRIGGER trg_v3_rationales_immutable
  BEFORE UPDATE OR DELETE ON public.question_option_rationales
  FOR EACH ROW EXECUTE FUNCTION public.reject_v3_answer_layer_mutation();
DROP TRIGGER IF EXISTS trg_v3_official_answers_immutable ON public.official_question_answers;
CREATE TRIGGER trg_v3_official_answers_immutable
  BEFORE UPDATE OR DELETE ON public.official_question_answers
  FOR EACH ROW EXECUTE FUNCTION public.reject_v3_answer_layer_mutation();

/* 4. Initial official-question payload: published revision only, no answer
      columns, no legacy correct_index, and no rationale/model-answer fields. */
CREATE OR REPLACE FUNCTION public.get_lesson_official_questions(_lesson_id uuid)
RETURNS TABLE (
  id uuid,
  question_text text,
  options jsonb,
  question_type text,
  sort_order int,
  revision_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_lesson(_lesson_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id,
         r.question_text,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', o.option_code,
               'text', o.body,
               'sortOrder', o.sort_order
             ) ORDER BY o.sort_order
           )
           FROM public.question_options o
           WHERE o.question_revision_id = r.id
         ), '[]'::jsonb),
         q.question_type,
         COALESCE(q.sort_order, 0),
         r.id
    FROM public.questions q
    JOIN public.question_revisions r
      ON r.id = q.current_published_revision_id
     AND r.question_id = q.id
     AND r.status = 'PUBLISHED'
   WHERE q.lesson_id = _lesson_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.lesson_capability_lifecycle lcl
        WHERE lcl.lesson_id = _lesson_id
          AND lcl.capability = 'checkUnderstanding'
          AND (lcl.status <> 'READY' OR lcl.applicability = 'NA')
     )
   ORDER BY q.sort_order, q.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lesson_official_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_official_questions(uuid) TO authenticated;

/* 5. Reveal: explicit submitted response + exact revision pin + READY gate. */
CREATE OR REPLACE FUNCTION public.reveal_official_question_answer(
  _question_id uuid,
  _attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_revision uuid;
  v_lesson uuid;
  v_answer public.official_question_answers%ROWTYPE;
  v_correct jsonb;
  v_rationales jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT pa.lesson_id, paq.question_revision_id
    INTO v_lesson, v_revision
    FROM public.practice_attempts pa
    JOIN public.practice_attempt_questions paq ON paq.practice_attempt_id = pa.id
    JOIN public.practice_attempt_responses par ON par.practice_attempt_question_id = paq.id
   WHERE pa.id = _attempt_id
     AND pa.user_id = v_user
     AND pa.submitted_at IS NOT NULL
     AND par.submitted_at IS NOT NULL
     AND paq.logical_question_id = _question_id
   LIMIT 1;

  IF v_revision IS NULL OR v_lesson IS NULL THEN
    RETURN jsonb_build_object('error', 'REVEAL_NOT_AUTHORIZED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle lcl
     WHERE lcl.lesson_id = v_lesson
       AND lcl.capability = 'checkUnderstanding'
       AND (lcl.status <> 'READY' OR lcl.applicability = 'NA')
  ) THEN
    RETURN jsonb_build_object('error', 'LESSON_NOT_READY');
  END IF;

  SELECT * INTO v_answer
    FROM public.official_question_answers a
   WHERE a.question_id = _question_id
     AND a.revision_id = v_revision;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ANSWER_NOT_AVAILABLE');
  END IF;

  SELECT COALESCE(jsonb_agg(o.option_code ORDER BY o.sort_order), '[]'::jsonb)
    INTO v_correct
    FROM public.question_options o
   WHERE o.question_revision_id = v_revision
     AND o.is_correct;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'optionId', r.option_id,
             'whyCorrect', r.why_correct,
             'whyWrong', r.why_wrong
           ) ORDER BY r.option_id
         ), '[]'::jsonb)
    INTO v_rationales
    FROM public.question_option_rationales r
   WHERE r.question_id = _question_id
     AND r.question_revision_id = v_revision;

  RETURN jsonb_build_object(
    'questionId', _question_id,
    'revisionId', v_revision,
    'correctOptionIds', v_correct,
    'modelAnswer', v_answer.model_answer,
    'explanation', v_answer.explanation,
    'rationales', v_rationales
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_official_question_answer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_official_question_answer(uuid, uuid) TO authenticated;

COMMIT;

-- No rollback is executed by this worktree. Operator guidance:
--  * roll forward with a new revision for content corrections;
--  * do not drop answer history or lifecycle rows;
--  * if this transaction fails, PostgreSQL rolls back the whole file.
