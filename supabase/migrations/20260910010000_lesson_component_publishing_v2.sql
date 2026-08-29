-- ==========================================================================
-- Lesson component publishing V2
-- ==========================================================================
-- One component owns one intake and one atomic publication. This path does not
-- use golden lesson packages, manifests, CF10 materialisation, CF11 publication,
-- review transitions, or the state of any sibling component.

BEGIN;

CREATE TABLE public.lesson_component_intakes_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  lesson_code text NOT NULL,
  capability text NOT NULL CHECK (capability IN (
    'officialBookContent',
    'tamkeenExplanationHtml',
    'lessonSummaryHtml',
    'mindMapHtml',
    'labExperimentHtml',
    'officialBookQuestions',
    'selfTest'
  )),
  lifecycle_capability text NOT NULL CHECK (lifecycle_capability IN (
    'officialBookContent',
    'tamkeenExplanation',
    'quickReview',
    'mindMap',
    'simulation',
    'checkUnderstanding',
    'lessonAssessment'
  )),
  original_file_name text NOT NULL CHECK (
    length(btrim(original_file_name)) BETWEEN 1 AND 255
    AND position('/' in original_file_name) = 0
    AND position(E'\\' in original_file_name) = 0
    AND original_file_name !~ '[[:cntrl:]]'
  ),
  storage_path text NOT NULL UNIQUE,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_bytes bigint NOT NULL CHECK (source_bytes BETWEEN 1 AND 5242880),
  mime_type text NOT NULL,
  answer_file_name text,
  answer_storage_path text UNIQUE,
  answer_sha256 text CHECK (answer_sha256 IS NULL OR answer_sha256 ~ '^[0-9a-f]{64}$'),
  answer_bytes bigint CHECK (answer_bytes IS NULL OR answer_bytes BETWEEN 1 AND 5242880),
  status text NOT NULL DEFAULT 'UPLOADING'
    CHECK (status IN ('UPLOADING','VERIFIED','PUBLISHED','REJECTED')),
  payload_text text,
  answers_payload jsonb,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  published_at timestamptz,
  rejected_at timestamptz,
  rejection_code text,
  CONSTRAINT lesson_component_intakes_v2_answer_shape CHECK (
    (capability IN ('officialBookQuestions','selfTest'))
      = (answer_file_name IS NOT NULL AND answer_storage_path IS NOT NULL
         AND answer_sha256 IS NOT NULL AND answer_bytes IS NOT NULL)
  ),
  CONSTRAINT lesson_component_intakes_v2_verified_shape CHECK (
    status = 'UPLOADING'
    OR status = 'REJECTED'
    OR (payload_text IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

CREATE INDEX lesson_component_intakes_v2_lesson_capability_idx
  ON public.lesson_component_intakes_v2(lesson_id, capability, created_at DESC);

ALTER TABLE public.lesson_component_intakes_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_component_intakes_v2 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lesson_component_intakes_v2 FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lesson_component_intakes_v2 TO service_role;

CREATE TABLE public.lesson_component_publications_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL UNIQUE
    REFERENCES public.lesson_component_intakes_v2(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  capability text NOT NULL,
  lifecycle_capability text NOT NULL,
  publication_version integer NOT NULL CHECK (publication_version > 0),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  result jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, capability, publication_version)
);

CREATE INDEX lesson_component_publications_v2_current_idx
  ON public.lesson_component_publications_v2(lesson_id, capability, publication_version DESC);

ALTER TABLE public.lesson_component_publications_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_component_publications_v2 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lesson_component_publications_v2 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.lesson_component_publications_v2 TO service_role;

CREATE OR REPLACE FUNCTION public.lesson_component_publications_v2_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'LCPV2_PUBLICATION_IMMUTABLE' USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION public.lesson_component_publications_v2_immutable()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_lesson_component_publications_v2_immutable
BEFORE UPDATE OR DELETE ON public.lesson_component_publications_v2
FOR EACH ROW EXECUTE FUNCTION public.lesson_component_publications_v2_immutable();

CREATE OR REPLACE FUNCTION public.lesson_component_v2_lifecycle(_capability text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $function$
  SELECT CASE _capability
    WHEN 'officialBookContent' THEN 'officialBookContent'
    WHEN 'tamkeenExplanationHtml' THEN 'tamkeenExplanation'
    WHEN 'lessonSummaryHtml' THEN 'quickReview'
    WHEN 'mindMapHtml' THEN 'mindMap'
    WHEN 'labExperimentHtml' THEN 'simulation'
    WHEN 'officialBookQuestions' THEN 'checkUnderstanding'
    WHEN 'selfTest' THEN 'lessonAssessment'
    ELSE NULL
  END
$function$;

REVOKE ALL ON FUNCTION public.lesson_component_v2_lifecycle(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lesson_component_v2_lifecycle(text) TO service_role;

-- Service-only allocation: the browser receives signed upload URLs, never table access.
CREATE OR REPLACE FUNCTION public.lesson_component_create_intake_v2(
  _lesson_code text,
  _capability text,
  _original_file_name text,
  _storage_path text,
  _source_sha256 text,
  _source_bytes bigint,
  _mime_type text,
  _answer_file_name text DEFAULT NULL,
  _answer_storage_path text DEFAULT NULL,
  _answer_sha256 text DEFAULT NULL,
  _answer_bytes bigint DEFAULT NULL,
  _actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lesson public.lessons;
  v_lifecycle text;
  v_id uuid;
BEGIN
  IF _actor_id IS NULL OR NOT public.is_full_admin(_actor_id) THEN
    RAISE EXCEPTION 'LCPV2_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  v_lifecycle := public.lesson_component_v2_lifecycle(_capability);
  IF v_lifecycle IS NULL THEN
    RAISE EXCEPTION 'LCPV2_CAPABILITY_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lesson FROM public.lessons WHERE lower(slug) = lower(btrim(_lesson_code));
  IF v_lesson.id IS NULL THEN
    RAISE EXCEPTION 'LCPV2_LESSON_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF _source_sha256 !~ '^[0-9a-f]{64}$' OR _source_bytes NOT BETWEEN 1 AND 5242880 THEN
    RAISE EXCEPTION 'LCPV2_SOURCE_DECLARATION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF (_capability IN ('officialBookQuestions','selfTest')) IS DISTINCT FROM
     (_answer_file_name IS NOT NULL AND _answer_storage_path IS NOT NULL
      AND _answer_sha256 IS NOT NULL AND _answer_bytes IS NOT NULL) THEN
    RAISE EXCEPTION 'LCPV2_ANSWER_DECLARATION_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lesson_component_intakes_v2(
    lesson_id, lesson_code, capability, lifecycle_capability,
    original_file_name, storage_path, source_sha256, source_bytes, mime_type,
    answer_file_name, answer_storage_path, answer_sha256, answer_bytes, created_by)
  VALUES (
    v_lesson.id, upper(v_lesson.slug), _capability, v_lifecycle,
    _original_file_name, _storage_path, _source_sha256, _source_bytes, _mime_type,
    _answer_file_name, _answer_storage_path, _answer_sha256, _answer_bytes, _actor_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('intake_id',v_id,'lesson_id',v_lesson.id,
    'capability',_capability,'status','UPLOADING');
END;
$function$;

REVOKE ALL ON FUNCTION public.lesson_component_create_intake_v2(
  text,text,text,text,text,bigint,text,text,text,text,bigint,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lesson_component_create_intake_v2(
  text,text,text,text,text,bigint,text,text,text,text,bigint,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.lesson_component_verify_intake_v2(
  _intake_id uuid,
  _payload_text text,
  _answers_payload jsonb,
  _validation_summary jsonb,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_intake public.lesson_component_intakes_v2;
  v_hash text;
BEGIN
  SELECT * INTO v_intake FROM public.lesson_component_intakes_v2
   WHERE id=_intake_id FOR UPDATE;
  IF v_intake.id IS NULL THEN
    RAISE EXCEPTION 'LCPV2_INTAKE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF _actor_id IS NULL OR v_intake.created_by IS DISTINCT FROM _actor_id
     OR NOT public.is_full_admin(_actor_id) THEN
    RAISE EXCEPTION 'LCPV2_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_intake.status = 'VERIFIED' THEN
    RETURN jsonb_build_object('intake_id',v_intake.id,'status','VERIFIED',
      'idempotent',true,'source_sha256',v_intake.source_sha256);
  END IF;
  IF v_intake.status <> 'UPLOADING' THEN
    RAISE EXCEPTION 'LCPV2_INTAKE_STATE_CONFLICT: %', v_intake.status USING ERRCODE = '23514';
  END IF;
  IF _payload_text IS NULL OR length(_payload_text)=0 THEN
    RAISE EXCEPTION 'LCPV2_PAYLOAD_EMPTY' USING ERRCODE = '22023';
  END IF;
  v_hash := public.cf11_text_sha256(_payload_text);
  IF v_hash IS DISTINCT FROM v_intake.source_sha256 THEN
    RAISE EXCEPTION 'LCPV2_VERIFIED_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_intake.capability IN ('officialBookQuestions','selfTest') THEN
    IF jsonb_typeof(_answers_payload) <> 'object'
       OR jsonb_array_length(coalesce(_answers_payload->'answers','[]'::jsonb))=0 THEN
      RAISE EXCEPTION 'LCPV2_ANSWERS_REQUIRED' USING ERRCODE = '23514';
    END IF;
  ELSIF _answers_payload IS NOT NULL THEN
    RAISE EXCEPTION 'LCPV2_ANSWERS_FORBIDDEN' USING ERRCODE = '23514';
  END IF;

  UPDATE public.lesson_component_intakes_v2
     SET status='VERIFIED', payload_text=_payload_text, answers_payload=_answers_payload,
         validation_summary=coalesce(_validation_summary,'{}'::jsonb),
         verified_by=_actor_id, verified_at=now()
   WHERE id=v_intake.id;

  RETURN jsonb_build_object('intake_id',v_intake.id,'lesson_id',v_intake.lesson_id,
    'capability',v_intake.capability,'status','VERIFIED','idempotent',false,
    'source_sha256',v_intake.source_sha256);
END;
$function$;

REVOKE ALL ON FUNCTION public.lesson_component_verify_intake_v2(uuid,text,jsonb,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lesson_component_verify_intake_v2(uuid,text,jsonb,jsonb,uuid)
  TO service_role;

-- The old direct-edit guards remain active for every other writer. V2 performs the
-- content replacement and READY pointer swap in one transaction and marks only its
-- own writes so those guards do not manufacture a conflicting REQUIRED draft row.
CREATE OR REPLACE FUNCTION public.mark_lesson_component_draft(_lesson_id uuid, _capability text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF current_setting('tamkeen.lesson_component_v2_write', true) = 'on' THEN RETURN; END IF;
  IF _lesson_id IS NULL OR _capability IS NULL THEN RETURN; END IF;
  IF _capability NOT IN (
    'officialBookContent','tamkeenExplanation','quickReview','mindMap','simulation',
    'checkUnderstanding','lessonAssessment') THEN
    RAISE EXCEPTION 'INVALID_LESSON_COMPONENT: %', _capability USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.lesson_capability_lifecycle(
    lesson_id,capability,status,applicability,draft_updated_at)
  VALUES (_lesson_id,_capability,'DRAFT','OPTIONAL',now())
  ON CONFLICT (lesson_id,capability) DO UPDATE
    SET status='DRAFT',draft_updated_at=now(),reviewed_by=NULL,reviewed_at=NULL,updated_at=now();
  IF _actor IS NOT NULL THEN
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata)
    VALUES (_actor,'lesson_component_content_mutated','lesson_component',_lesson_id,
      jsonb_build_object('lesson_id',_lesson_id,'capability',_capability,'resulting_status','DRAFT'));
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_lesson_component_draft(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_lesson_component_draft(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.lesson_component_publish_questions_v2(
  _lesson_id uuid,
  _lesson_code text,
  _subject_id uuid,
  _capability text,
  _payload jsonb,
  _answers jsonb,
  _source_sha256 text,
  _actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_items jsonb;
  v_answers jsonb := coalesce(_answers->'answers','[]'::jsonb);
  v_item jsonb;
  v_answer jsonb;
  v_option jsonb;
  v_expected_codes text[] := ARRAY[]::text[];
  v_question_code text;
  v_item_id text;
  v_text text;
  v_options jsonb;
  v_interaction text;
  v_grading text;
  v_label text;
  v_prefix text;
  v_question public.questions;
  v_revision_id uuid;
  v_revision_number integer;
  v_assessment_id uuid;
  v_option_index integer;
  v_question_order integer := 0;
  v_option_code text;
  v_model_answer text;
  v_explanation text;
  v_correct_index integer;
  v_writes integer := 0;
  v_rc integer;
BEGIN
  IF _capability NOT IN ('officialBookQuestions','selfTest') THEN
    RAISE EXCEPTION 'LCPV2_QUESTION_CAPABILITY_INVALID' USING ERRCODE = '22023';
  END IF;
  v_label := CASE _capability WHEN 'officialBookQuestions'
    THEN 'OFFICIAL_BOOK_QUESTION' ELSE 'SELF_TEST' END;
  v_prefix := upper(_lesson_code) || CASE _capability WHEN 'officialBookQuestions'
    THEN '-OFFQ-' ELSE '-SELF-' END;
  v_items := CASE jsonb_typeof(_payload)
    WHEN 'array' THEN _payload ELSE coalesce(_payload->'questions','[]'::jsonb) END;
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items)=0 THEN
    RAISE EXCEPTION 'LCPV2_QUESTION_SET_EMPTY' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_item_id := btrim(coalesce(v_item->>'question_code',v_item->>'id',v_item->>'question_number',''));
    IF v_item_id='' OR v_item_id ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'LCPV2_QUESTION_ID_INVALID' USING ERRCODE = '23514';
    END IF;
    v_question_code := v_prefix || v_item_id;
    IF v_question_code = ANY(v_expected_codes) THEN
      RAISE EXCEPTION 'LCPV2_QUESTION_ID_DUPLICATE: %',v_item_id USING ERRCODE = '23514';
    END IF;
    v_expected_codes := array_append(v_expected_codes,v_question_code);
  END LOOP;

  -- Retire questions removed by this replacement without deleting history or attempts.
  IF _capability='selfTest' THEN
    SELECT id INTO v_assessment_id FROM public.lesson_assessments
     WHERE lesson_id=_lesson_id AND assessment_code=upper(_lesson_code)||'-SELFTEST';
    IF v_assessment_id IS NULL THEN
      INSERT INTO public.lesson_assessments(lesson_id,title,instructions,sort_order,assessment_code)
      VALUES (_lesson_id,'اختبر فهمك',NULL,0,upper(_lesson_code)||'-SELFTEST')
      RETURNING id INTO v_assessment_id;
      GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    END IF;
    DELETE FROM public.assessment_questions aq USING public.questions q
     WHERE aq.assessment_id=v_assessment_id AND aq.question_id=q.id
       AND q.lesson_id=_lesson_id AND q.code LIKE v_prefix||'%'
       AND NOT (q.code=ANY(v_expected_codes));
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
  END IF;

  FOR v_question IN SELECT * FROM public.questions
    WHERE lesson_id=_lesson_id AND code LIKE v_prefix||'%'
      AND NOT (code=ANY(v_expected_codes)) FOR UPDATE LOOP
    UPDATE public.questions SET current_published_revision_id=NULL WHERE id=v_question.id;
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    UPDATE public.question_revisions SET status='SUPERSEDED',superseded_at=now()
     WHERE question_id=v_question.id AND status='PUBLISHED';
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_item_id:=btrim(coalesce(v_item->>'question_code',v_item->>'id',v_item->>'question_number'));
    v_question_code:=v_prefix||v_item_id;
    v_text:=btrim(coalesce(v_item->>'official_text',v_item->>'question',v_item->>'question_text',''));
    v_options:=coalesce(v_item->'options','[]'::jsonb);
    SELECT value INTO v_answer FROM jsonb_array_elements(v_answers)
     WHERE value->>'capability'=_capability
       AND btrim(coalesce(value->>'question_id',value->>'question_code',''))=v_item_id
     LIMIT 1;
    IF v_text='' OR v_answer IS NULL THEN
      RAISE EXCEPTION 'LCPV2_QUESTION_OR_ANSWER_MISSING: %',v_item_id USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(v_options) <> 'array' THEN
      RAISE EXCEPTION 'LCPV2_QUESTION_OPTIONS_INVALID: %',v_item_id USING ERRCODE='23514';
    END IF;
    IF _capability='selfTest' THEN
      v_interaction:='SINGLE_CHOICE'; v_grading:='AUTO_SINGLE';
    ELSE
      v_interaction:=upper(coalesce(v_item->>'interaction_type',
        CASE WHEN jsonb_array_length(v_options)>0 THEN 'SINGLE_CHOICE' ELSE 'LONG_TEXT' END));
      v_grading:=upper(coalesce(v_answer->>'grading_mode',
        CASE v_interaction WHEN 'SINGLE_CHOICE' THEN 'AUTO_SINGLE'
          WHEN 'SHORT_TEXT' THEN 'AUTO_TEXT' ELSE 'MANUAL' END));
    END IF;

    SELECT * INTO v_question FROM public.questions WHERE code=v_question_code FOR UPDATE;
    IF v_question.id IS NULL THEN
      INSERT INTO public.questions(lesson_id,subject_id,question_text,options,correct_index,
        question_type,sort_order,code,created_by)
      VALUES (_lesson_id,_subject_id,v_text,v_options,-1,
        coalesce(v_item->>'question_type',v_item->>'type',v_interaction),v_question_order,
        v_question_code,_actor_id) RETURNING * INTO v_question;
      GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    ELSE
      IF v_question.lesson_id IS DISTINCT FROM _lesson_id
         OR v_question.subject_id IS DISTINCT FROM _subject_id THEN
        RAISE EXCEPTION 'LCPV2_QUESTION_IDENTITY_CONFLICT: %',v_question_code USING ERRCODE='23514';
      END IF;
      UPDATE public.questions SET question_text=v_text,options=v_options,correct_index=-1,
        question_type=coalesce(v_item->>'question_type',v_item->>'type',v_interaction),
        sort_order=v_question_order,archived_at=NULL,archived_by=NULL
       WHERE id=v_question.id;
      GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
      UPDATE public.questions SET current_published_revision_id=NULL
       WHERE id=v_question.id AND current_published_revision_id IS NOT NULL;
      GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
      UPDATE public.question_revisions SET status='SUPERSEDED',superseded_at=now()
       WHERE question_id=v_question.id AND status='PUBLISHED';
      GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    END IF;

    SELECT coalesce(max(revision_number),0)+1 INTO v_revision_number
      FROM public.question_revisions WHERE question_id=v_question.id;
    INSERT INTO public.question_revisions(question_id,revision_number,status,interaction_type,
      grading_mode,educational_label,question_text,max_score,allow_partial,requires_media,
      manual_grading_required,payload_hash_version,source_payload_hash,created_by)
    VALUES (v_question.id,v_revision_number,'DRAFT',v_interaction,v_grading,v_label,v_text,
      1,false,false,v_grading='MANUAL','canonical_payload_v1',_source_sha256,_actor_id)
    RETURNING id INTO v_revision_id;
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;

    v_option_index:=0;
    FOR v_option IN SELECT value FROM jsonb_array_elements(v_options) LOOP
      v_option_code:=coalesce(v_option->>'code',chr(97+v_option_index));
      INSERT INTO public.question_options(question_revision_id,option_code,body,sort_order,is_correct)
      VALUES (v_revision_id,v_option_code,coalesce(v_option->>'body',v_option#>>'{}'),v_option_index,false);
      GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
      v_option_index:=v_option_index+1;
    END LOOP;
    INSERT INTO public.question_targets(question_id,revision_id,target_type,subject_id,lesson_id,is_primary,created_by)
    VALUES (v_question.id,v_revision_id,'LESSON',_subject_id,_lesson_id,true,_actor_id);
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;

    v_model_answer:=coalesce(v_answer->>'model_answer',v_answer->>'correct_option');
    v_explanation:=coalesce(v_answer->>'explanation',v_answer->>'rationale');
    INSERT INTO public.official_question_answers(question_id,revision_id,model_answer,explanation)
    VALUES (v_question.id,v_revision_id,v_model_answer,v_explanation);
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;

    IF _capability='selfTest' THEN
      v_correct_index:=(v_answer->>'correct_index')::integer;
      IF v_correct_index<1 OR v_correct_index>jsonb_array_length(v_options) OR v_explanation IS NULL THEN
        RAISE EXCEPTION 'LCPV2_SELF_TEST_ANSWER_INVALID: %',v_item_id USING ERRCODE='23514';
      END IF;
      INSERT INTO public.question_option_rationales(
        question_id,question_revision_id,option_id,why_correct,why_wrong)
      VALUES (v_question.id,v_revision_id,chr(96+v_correct_index),v_explanation,NULL);
      GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    END IF;

    UPDATE public.question_revisions
       SET payload_hash=public._qb_compute_revision_payload_hash(v_revision_id)
     WHERE id=v_revision_id;
    UPDATE public.question_revisions SET status='APPROVED',reviewed_at=now(),reviewed_by=_actor_id
     WHERE id=v_revision_id;
    UPDATE public.question_revisions SET status='PUBLISHED',published_at=now(),published_by=_actor_id
     WHERE id=v_revision_id;
    UPDATE public.questions SET current_published_revision_id=v_revision_id WHERE id=v_question.id;
    v_writes:=v_writes+4;

    IF _capability='selfTest' THEN
      INSERT INTO public.assessment_questions(assessment_id,question_id,sort_order,points)
      VALUES (v_assessment_id,v_question.id,v_question_order,1)
      ON CONFLICT (assessment_id,question_id) DO UPDATE
        SET sort_order=excluded.sort_order,points=excluded.points;
      GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    END IF;
    v_question_order:=v_question_order+1;
  END LOOP;
  RETURN v_writes;
END;
$function$;

REVOKE ALL ON FUNCTION public.lesson_component_publish_questions_v2(
  uuid,text,uuid,text,jsonb,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lesson_component_publish_v2(
  _intake_id uuid,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_intake public.lesson_component_intakes_v2;
  v_lesson public.lessons;
  v_existing public.lesson_component_publications_v2;
  v_publication_id uuid:=gen_random_uuid();
  v_version integer;
  v_code text;
  v_resource_type text;
  v_result jsonb;
  v_snapshot jsonb;
  v_writes integer:=0;
  v_rc integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_full_admin(v_uid) THEN
    RAISE EXCEPTION 'LCPV2_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(_idempotency_key,''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'LCPV2_IDEMPOTENCY_KEY_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_intake FROM public.lesson_component_intakes_v2
   WHERE id=_intake_id FOR UPDATE;
  IF v_intake.id IS NULL THEN RAISE EXCEPTION 'LCPV2_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_intake.created_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'LCPV2_INTAKE_OWNER_MISMATCH' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_intake.lesson_id::text||':'||v_intake.capability,0));
  SELECT * INTO v_existing FROM public.lesson_component_publications_v2
   WHERE intake_id=v_intake.id OR idempotency_key=btrim(_idempotency_key) LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.intake_id IS DISTINCT FROM v_intake.id
       OR v_existing.source_sha256 IS DISTINCT FROM v_intake.source_sha256 THEN
      RAISE EXCEPTION 'LCPV2_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.result||jsonb_build_object('idempotent',true,'writes_performed',0);
  END IF;
  IF v_intake.status<>'VERIFIED' THEN
    RAISE EXCEPTION 'LCPV2_INTAKE_NOT_VERIFIED: %',v_intake.status USING ERRCODE='23514';
  END IF;
  IF public.cf11_text_sha256(v_intake.payload_text) IS DISTINCT FROM v_intake.source_sha256 THEN
    RAISE EXCEPTION 'LCPV2_LIVE_HASH_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_lesson FROM public.lessons WHERE id=v_intake.lesson_id FOR UPDATE;
  IF v_lesson.id IS NULL OR upper(v_lesson.slug) IS DISTINCT FROM v_intake.lesson_code THEN
    RAISE EXCEPTION 'LCPV2_LESSON_IDENTITY_DRIFT' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('tamkeen.lesson_component_v2_write','on',true);
  PERFORM public.cf10_assert_no_answer_leak(v_intake.capability,v_intake.payload_text);

  IF v_intake.capability='officialBookContent' THEN
    INSERT INTO public.lesson_book_contents(lesson_id,content)
    VALUES (v_lesson.id,v_intake.payload_text)
    ON CONFLICT (lesson_id) DO UPDATE SET content=excluded.content,updated_at=now();
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
  ELSIF v_intake.capability='tamkeenExplanationHtml' THEN
    v_code:=upper(v_lesson.slug)||'-EXP';
    UPDATE public.lesson_explanations SET title='شرح تمكين',content=v_intake.payload_text,
      sort_order=0,updated_at=now() WHERE lesson_id=v_lesson.id AND explanation_code=v_code;
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    IF v_rc=0 THEN
      INSERT INTO public.lesson_explanations(lesson_id,title,content,sort_order,explanation_code)
      VALUES (v_lesson.id,'شرح تمكين',v_intake.payload_text,0,v_code);
      v_writes:=v_writes+1;
    END IF;
  ELSIF v_intake.capability='lessonSummaryHtml' THEN
    INSERT INTO public.lesson_summaries(lesson_id,summary)
    VALUES (v_lesson.id,v_intake.payload_text)
    ON CONFLICT (lesson_id) DO UPDATE SET summary=excluded.summary,updated_at=now();
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
  ELSIF v_intake.capability IN ('mindMapHtml','labExperimentHtml') THEN
    PERFORM public.cf11_assert_interactive_contract(v_intake.capability,v_intake.payload_text);
    v_code:=upper(v_lesson.slug)||CASE v_intake.capability
      WHEN 'mindMapHtml' THEN '-MINDMAP' ELSE '-EXPERIMENT' END;
    v_resource_type:=CASE v_intake.capability WHEN 'mindMapHtml' THEN 'mindmap' ELSE 'experiment' END;
    UPDATE public.lesson_resources SET resource_type=v_resource_type::public.lesson_resource_type,
      title=CASE v_intake.capability WHEN 'mindMapHtml' THEN 'الخريطة الذهنية' ELSE 'التجربة المعملية' END,
      url=public.cf10_inline_html_url(v_code),description=v_intake.payload_text,
      sort_order=CASE v_intake.capability WHEN 'mindMapHtml' THEN 4 ELSE 5 END,
      html_resource_type='INTERACTIVE',metadata=jsonb_build_object(
        'publisher','LCPV2','publicationId',v_publication_id,'sourceSha256',v_intake.source_sha256,
        'publishedAt',now(),'publishedBy',v_uid),is_primary=false
     WHERE lesson_id=v_lesson.id AND resource_code=v_code;
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    IF v_rc=0 THEN
      INSERT INTO public.lesson_resources(lesson_id,resource_type,title,url,description,sort_order,
        resource_code,html_resource_type,metadata,is_primary)
      VALUES (v_lesson.id,v_resource_type::public.lesson_resource_type,
        CASE v_intake.capability WHEN 'mindMapHtml' THEN 'الخريطة الذهنية' ELSE 'التجربة المعملية' END,
        public.cf10_inline_html_url(v_code),v_intake.payload_text,
        CASE v_intake.capability WHEN 'mindMapHtml' THEN 4 ELSE 5 END,
        v_code,'INTERACTIVE',jsonb_build_object('publisher','LCPV2','publicationId',v_publication_id,
        'sourceSha256',v_intake.source_sha256,'publishedAt',now(),'publishedBy',v_uid),false);
      v_writes:=v_writes+1;
    END IF;
  ELSE
    v_writes:=v_writes+public.lesson_component_publish_questions_v2(v_lesson.id,v_lesson.slug,
      v_lesson.subject_id,v_intake.capability,v_intake.payload_text::jsonb,
      v_intake.answers_payload,v_intake.source_sha256,v_uid);
  END IF;

  SELECT coalesce(max(publication_version),0)+1 INTO v_version
    FROM public.lesson_component_publications_v2
   WHERE lesson_id=v_lesson.id AND capability=v_intake.capability;
  v_snapshot:=jsonb_build_object('publisher','LCPV2','intakeId',v_intake.id,
    'capability',v_intake.lifecycle_capability,'packageCapability',v_intake.capability,
    'sourcePath',v_intake.original_file_name,'sourceSha256',v_intake.source_sha256,
    'publicationVersion',v_version,'publishedAt',now(),'publishedBy',v_uid);
  INSERT INTO public.lesson_capability_lifecycle(lesson_id,capability,status,applicability,
    draft_hash,draft_updated_at,reviewed_by,reviewed_at,ready_snapshot,ready_hash,ready_by,ready_at,
    evidence_origin,retirement_origin)
  VALUES (v_lesson.id,v_intake.lifecycle_capability,'READY','OPTIONAL',NULL,NULL,v_uid,now(),
    v_snapshot,v_intake.source_sha256,v_uid,now(),NULL,NULL)
  ON CONFLICT (lesson_id,capability) DO UPDATE SET status='READY',applicability='OPTIONAL',
    draft_hash=NULL,draft_updated_at=NULL,reviewed_by=excluded.reviewed_by,
    reviewed_at=excluded.reviewed_at,ready_snapshot=excluded.ready_snapshot,
    ready_hash=excluded.ready_hash,ready_by=excluded.ready_by,ready_at=excluded.ready_at,
    evidence_origin=NULL,retirement_origin=NULL,updated_at=now();
  GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;

  IF NOT public.lesson_capability_ready(v_lesson.id,v_intake.lifecycle_capability) THEN
    RAISE EXCEPTION 'LCPV2_COMPONENT_NOT_VISIBLE' USING ERRCODE='23514';
  END IF;
  v_result:=jsonb_build_object('intake_id',v_intake.id,'lesson_id',v_lesson.id,
    'capability',v_intake.capability,'lifecycle_capability',v_intake.lifecycle_capability,
    'publication_version',v_version,'status','READY','source_sha256',v_intake.source_sha256,
    'student_can_see_this_component',true,'idempotent',false,'writes_performed',v_writes);
  INSERT INTO public.lesson_component_publications_v2(id,intake_id,lesson_id,capability,
    lifecycle_capability,publication_version,source_sha256,idempotency_key,result,published_by)
  VALUES (v_publication_id,v_intake.id,v_lesson.id,v_intake.capability,v_intake.lifecycle_capability,
    v_version,v_intake.source_sha256,btrim(_idempotency_key),v_result,v_uid);
  UPDATE public.lesson_component_intakes_v2 SET status='PUBLISHED',published_at=now()
   WHERE id=v_intake.id;
  INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata)
  VALUES (v_uid,'lesson_component_publish_v2','lesson_capability',v_lesson.id,v_result);
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.lesson_component_publish_v2(uuid,text) IS
'Atomic publication of exactly one verified lesson component. Independent of packages, manifests, CF10, CF11, and sibling components.';
REVOKE ALL ON FUNCTION public.lesson_component_publish_v2(uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_component_publish_v2(uuid,text) TO authenticated;

-- Retire the package-era component entry point. Its tables remain for rollback/history.
REVOKE EXECUTE ON FUNCTION public.golden_lesson_publish_component(uuid,text,text)
  FROM authenticated;

-- Structural proof: V2 must stay independent and the confidential tables stay private.
DO $proof$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.lesson_component_publish_v2(uuid,text)'::regprocedure) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'LCPV2_FUNCTION_MISSING'; END IF;
  IF position('golden_lesson_packages' in d)>0 OR position('golden_lesson_domain_stage' in d)>0
     OR position('golden_lesson_materialize' in d)>0 OR position('golden_lesson_publish_cf11' in d)>0
     OR position('REVIEW' in d)>0 THEN
    RAISE EXCEPTION 'LCPV2_OLD_PIPELINE_DEPENDENCY';
  END IF;
  IF has_function_privilege('anon','public.lesson_component_publish_v2(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'LCPV2_ANON_EXECUTE';
  END IF;
  IF has_table_privilege('authenticated','public.lesson_component_intakes_v2','SELECT')
     OR has_table_privilege('authenticated','public.lesson_component_intakes_v2','INSERT') THEN
    RAISE EXCEPTION 'LCPV2_INTAKE_TABLE_EXPOSED';
  END IF;
  IF has_function_privilege('authenticated',
       'public.golden_lesson_publish_component(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'LCPV2_OLD_PUBLISH_STILL_CALLABLE';
  END IF;
END
$proof$;

COMMIT;
