-- CONTENT_FACTORY_10_DOMAIN_MATERIALIZATION
-- Status: SOURCE-READY / NOT APPLIED TO PRODUCTION.
-- Scope: atomic, idempotent, fail-closed materialization of one verified CF08 batch
--        (optionally CF09-bound) into the natural domain tables, DRAFT lifecycle only.
-- Explicitly absent: subject creation, curriculum deletes, storage/textbook mutation,
--                    REVIEW/READY transitions, publication, answer exposure in student payload.

CREATE TABLE public.golden_lesson_domain_materializations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE
    REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  binding_id uuid REFERENCES public.golden_lesson_identity_bindings(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  lesson_created boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  write_plan jsonb NOT NULL,
  write_plan_sha256 text NOT NULL CHECK (write_plan_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL,
  materialized_by uuid NOT NULL REFERENCES auth.users(id),
  materialized_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.golden_lesson_domain_materializations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golden_lesson_domain_materializations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golden_lesson_domain_materializations TO authenticated;
GRANT ALL ON public.golden_lesson_domain_materializations TO service_role;

CREATE POLICY "golden materialization staff read"
  ON public.golden_lesson_domain_materializations FOR SELECT TO authenticated
  USING (public.is_golden_lesson_content_staff(auth.uid()));

CREATE TRIGGER golden_materialization_immutable
  BEFORE UPDATE OR DELETE ON public.golden_lesson_domain_materializations
  FOR EACH ROW EXECUTE FUNCTION public.reject_golden_domain_stage_mutation();

-- Deterministic content hash helper (bytes-in, hex-out).
CREATE OR REPLACE FUNCTION public.cf10_text_sha256(_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(digest(convert_to(coalesce(_value,''),'UTF8'),'sha256'),'hex');
$$;

-- Fail-closed answer-leak detector for any payload that will reach the student.
CREATE OR REPLACE FUNCTION public.cf10_assert_no_answer_leak(_capability text, _payload text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _payload IS NULL THEN RETURN; END IF;
  IF _payload ~* '"(correct_option|correct_answer|correct_index|is_correct|answer_key|model_answer|rationale|rationales|why_correct|why_wrong)"' THEN
    RAISE EXCEPTION 'CF10_ANSWER_LEAK_IN_STUDENT_PAYLOAD: %', _capability USING ERRCODE = '23514';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.golden_lesson_materialize_domain_batch(
  _batch_id uuid,
  _actor_id uuid,
  _mode text DEFAULT 'DRY_RUN',
  _expected_plan_sha256 text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  batch public.golden_lesson_domain_stage_batches;
  ver public.golden_lesson_package_versions;
  binding public.golden_lesson_identity_bindings;
  replay public.golden_lesson_domain_materializations;
  ident jsonb;
  subject_row public.subjects;
  lesson_row public.lessons;
  lesson_created boolean := false;
  entry public.golden_lesson_domain_stage_entries;
  payload_text text;
  companion jsonb;
  plan jsonb := '[]'::jsonb;
  plan_sha text;
  cap text;
  lifecycle_cap text;
  question_json jsonb;
  item jsonb;
  opt jsonb;
  question_row public.questions;
  revision_id uuid;
  assessment_id uuid;
  question_code text;
  option_code text;
  answer jsonb;
  writes integer := 0;
  questions_written integer := 0;
  options_written integer := 0;
  answers_written integer := 0;
  rationales_written integer := 0;
  lifecycle_written integer := 0;
  payloads jsonb := '{}'::jsonb;
  existing_hash text;
  new_hash text;
  external_lesson_code text;
BEGIN
  IF _mode NOT IN ('DRY_RUN','EXECUTE') THEN
    RAISE EXCEPTION 'CF10_MODE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT public.golden_lesson_has_role(_actor_id,'admin') THEN
    RAISE EXCEPTION 'CF10_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cf10:' || _batch_id::text, 0));

  SELECT * INTO batch FROM public.golden_lesson_domain_stage_batches WHERE id = _batch_id;
  IF batch.id IS NULL THEN
    RAISE EXCEPTION 'CF10_BATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO ver FROM public.golden_lesson_package_versions
   WHERE package_id = batch.package_id AND version = batch.package_version;
  IF ver.id IS NULL OR ver.bundle_verified_at IS NULL
     OR ver.verified_bundle_sha256 IS DISTINCT FROM batch.verified_bundle_sha256 THEN
    RAISE EXCEPTION 'CF10_VERIFIED_BUNDLE_IDENTITY_MISMATCH' USING ERRCODE = '23514';
  END IF;

  ident := ver.manifest->'identity';
  IF jsonb_typeof(ident) <> 'object' THEN
    RAISE EXCEPTION 'CF10_IDENTITY_MANIFEST_MISSING' USING ERRCODE = '22023';
  END IF;
  external_lesson_code := ident->>'lessonCode';

  -- Subject: authoritative existing row only. CF10 never creates or renames a subject.
  IF (SELECT count(*) FROM public.subjects
       WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'))) <> 1 THEN
    RAISE EXCEPTION 'CF10_SUBJECT_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO subject_row FROM public.subjects
   WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'));

  SELECT * INTO binding FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
  IF binding.id IS NOT NULL AND binding.subject_id IS DISTINCT FROM subject_row.id THEN
    RAISE EXCEPTION 'CF10_IDENTITY_BINDING_SUBJECT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO lesson_row FROM public.lessons
   WHERE subject_id = subject_row.id AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'));
  IF binding.id IS NOT NULL AND lesson_row.id IS NOT NULL
     AND binding.lesson_id IS DISTINCT FROM lesson_row.id THEN
    RAISE EXCEPTION 'CF10_IDENTITY_BINDING_LESSON_MISMATCH' USING ERRCODE = '23514';
  END IF;

  -- Answer-leak gate on every student-visible staged payload, before any write.
  FOR entry IN SELECT * FROM public.golden_lesson_domain_stage_entries
                WHERE batch_id = _batch_id ORDER BY capability LOOP
    payload_text := CASE WHEN entry.source_payload IS NULL THEN NULL
                         ELSE convert_from(entry.source_payload,'UTF8') END;
    IF entry.applicability = 'REQUIRED' AND payload_text IS NULL THEN
      RAISE EXCEPTION 'CF10_EMPTY_PAYLOAD: %', entry.capability USING ERRCODE = '22023';
    END IF;
    IF payload_text IS NOT NULL
       AND encode(digest(entry.source_payload,'sha256'),'hex') IS DISTINCT FROM entry.source_sha256 THEN
      RAISE EXCEPTION 'CF10_PAYLOAD_HASH_MISMATCH: %', entry.capability USING ERRCODE = '23514';
    END IF;
    PERFORM public.cf10_assert_no_answer_leak(entry.capability, payload_text);
    payloads := payloads || jsonb_build_object(entry.capability,
      jsonb_build_object('sha256', entry.source_sha256, 'text', payload_text,
                         'applicability', entry.applicability));
    plan := plan || jsonb_build_array(jsonb_build_object(
      'capability', entry.capability, 'targetPlan', entry.target_plan,
      'lifecycleCapability', entry.lifecycle_capability,
      'applicability', entry.applicability, 'sha256', entry.source_sha256));
  END LOOP;
  IF jsonb_array_length(plan) <> 7 THEN
    RAISE EXCEPTION 'CF10_STAGED_CAPABILITY_SET_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(a) INTO companion FROM (
    SELECT convert_from(companion_payload,'UTF8') AS body, companion_sha256
      FROM public.golden_lesson_domain_stage_answers WHERE batch_id = _batch_id) a;
  IF companion IS NULL THEN
    RAISE EXCEPTION 'CF10_ANSWER_COMPANION_MISSING' USING ERRCODE = '22023';
  END IF;

  plan := jsonb_build_object(
    'schema','tamkeen.content-factory-10.write-plan.v1',
    'batchId', _batch_id,
    'subjectId', subject_row.id,
    'subjectCode', subject_row.code,
    'lessonSlug', ident->>'lessonSlug',
    'externalLessonCode', external_lesson_code,
    'lessonExists', lesson_row.id IS NOT NULL,
    'bindingId', binding.id,
    'verifiedBundleSha256', batch.verified_bundle_sha256,
    'answerCompanionSha256', companion->>'companion_sha256',
    'entries', plan,
    'lifecycleTarget', jsonb_build_object('status','DRAFT','applicability','REQUIRED','capabilities',7),
    'forbidden', jsonb_build_object('subjectCreate',false,'delete',false,'storage',false,
                                    'publish',false,'ready',false));
  plan_sha := public.cf10_text_sha256(plan::text);

  IF _mode = 'DRY_RUN' THEN
    RETURN jsonb_build_object('mode','DRY_RUN','write_plan',plan,'write_plan_sha256',plan_sha,
      'writes_performed',0,'domain_writes_performed',0,'answer_leak',0,
      'lesson_will_be_created', lesson_row.id IS NULL);
  END IF;

  IF _idempotency_key IS NULL OR length(btrim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'CF10_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF10_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO replay FROM public.golden_lesson_domain_materializations WHERE batch_id = _batch_id;
  IF replay.id IS NOT NULL THEN
    IF replay.write_plan_sha256 IS DISTINCT FROM plan_sha
       OR replay.idempotency_key IS DISTINCT FROM btrim(_idempotency_key) THEN
      RAISE EXCEPTION 'CF10_REPLAY_CONFLICT' USING ERRCODE = '23514';
    END IF;
    RETURN replay.result || jsonb_build_object('idempotent',true,'writes_performed',0,
      'domain_writes_performed',0);
  END IF;

  -- Lesson: created only when absent under the authoritative existing subject.
  IF lesson_row.id IS NULL THEN
    INSERT INTO public.lessons(subject_id, slug, title, unit_id, is_free, semester, sort_order)
    VALUES (subject_row.id, btrim(ident->>'lessonSlug'),
            coalesce(nullif(btrim(coalesce(ident->>'lessonTitle','')),''), btrim(ident->>'lessonSlug')),
            NULL, true, (ident->>'semester')::integer, coalesce((ident->>'sortOrder')::integer,0))
    RETURNING * INTO lesson_row;
    lesson_created := true;
    writes := writes + 1;
  END IF;

  -- 1) officialBookContent -> lesson_book_contents (natural key: lesson_id)
  payload_text := payloads->'officialBookContent'->>'text';
  new_hash := public.cf10_text_sha256(payload_text);
  SELECT public.cf10_text_sha256(content) INTO existing_hash
    FROM public.lesson_book_contents WHERE lesson_id = lesson_row.id;
  IF existing_hash IS NULL THEN
    INSERT INTO public.lesson_book_contents(lesson_id, content) VALUES (lesson_row.id, payload_text);
    writes := writes + 1;
  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_book_contents' USING ERRCODE = '23514';
  END IF;

  -- 2) tamkeenExplanationHtml -> lesson_explanations (natural key: lesson_id, explanation_code)
  payload_text := payloads->'tamkeenExplanationHtml'->>'text';
  new_hash := public.cf10_text_sha256(payload_text);
  SELECT public.cf10_text_sha256(content) INTO existing_hash
    FROM public.lesson_explanations
   WHERE lesson_id = lesson_row.id AND explanation_code = external_lesson_code || '-EXP';
  IF existing_hash IS NULL THEN
    INSERT INTO public.lesson_explanations(lesson_id, title, content, sort_order, explanation_code)
    VALUES (lesson_row.id, 'شرح تمكين', payload_text, 0, external_lesson_code || '-EXP');
    writes := writes + 1;
  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_explanations' USING ERRCODE = '23514';
  END IF;

  -- 3) lessonSummaryHtml -> lesson_summaries (natural key: lesson_id)
  payload_text := payloads->'lessonSummaryHtml'->>'text';
  new_hash := public.cf10_text_sha256(payload_text);
  SELECT public.cf10_text_sha256(summary) INTO existing_hash
    FROM public.lesson_summaries WHERE lesson_id = lesson_row.id;
  IF existing_hash IS NULL THEN
    INSERT INTO public.lesson_summaries(lesson_id, summary) VALUES (lesson_row.id, payload_text);
    writes := writes + 1;
  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_summaries' USING ERRCODE = '23514';
  END IF;

  -- 4/5) mindMapHtml + labExperimentHtml -> lesson_resources (natural key: lesson_id, resource_code)
  FOREACH cap IN ARRAY ARRAY['mindMapHtml','labExperimentHtml'] LOOP
    payload_text := payloads->cap->>'text';
    CONTINUE WHEN payload_text IS NULL;
    option_code := CASE cap WHEN 'mindMapHtml' THEN external_lesson_code || '-MINDMAP'
                            ELSE external_lesson_code || '-EXPERIMENT' END;
    new_hash := public.cf10_text_sha256(payload_text);
    SELECT public.cf10_text_sha256(description) INTO existing_hash
      FROM public.lesson_resources WHERE lesson_id = lesson_row.id AND resource_code = option_code;
    IF existing_hash IS NULL THEN
      INSERT INTO public.lesson_resources(lesson_id, resource_type, title, url, description,
                                          sort_order, resource_code, html_resource_type, metadata, is_primary)
      VALUES (lesson_row.id,
              (CASE cap WHEN 'mindMapHtml' THEN 'mindmap' ELSE 'experiment' END)::public.lesson_resource_type,
              CASE cap WHEN 'mindMapHtml' THEN 'الخريطة الذهنية' ELSE 'التجربة العملية' END,
              '', payload_text, CASE cap WHEN 'mindMapHtml' THEN 1 ELSE 2 END, option_code,
              CASE cap WHEN 'mindMapHtml' THEN 'STATIC' ELSE 'INTERACTIVE' END,
              jsonb_build_object('contentFactory','CF10','sha256', payloads->cap->>'sha256'), false);
      writes := writes + 1;
    ELSIF existing_hash IS DISTINCT FROM new_hash THEN
      RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_resources %', cap USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- 6) officialBookQuestions -> questions + question_revisions + question_options,
  --    answers strictly revision-pinned into the confidential tables.
  question_json := CASE WHEN payloads->'officialBookQuestions'->>'text' IS NULL THEN '{}'::jsonb
                        ELSE (payloads->'officialBookQuestions'->>'text')::jsonb END;
  IF jsonb_typeof(question_json) <> 'object' THEN question_json := jsonb_build_object('questions', question_json); END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(question_json->'questions','[]'::jsonb)) LOOP
    question_code := external_lesson_code || '-OFFQ-' || coalesce(item->>'question_number', item->>'id');
    SELECT * INTO question_row FROM public.questions WHERE code = question_code;
    IF question_row.id IS NULL THEN
      INSERT INTO public.questions(lesson_id, subject_id, question_text, options, correct_index,
                                   question_type, sort_order, code, created_by)
      VALUES (lesson_row.id, subject_row.id, item->>'official_text',
              coalesce(item->'options','[]'::jsonb), -1,
              coalesce(item->>'question_type','SHORT_ANSWER'), questions_written, question_code, _actor_id)
      RETURNING * INTO question_row;
      questions_written := questions_written + 1;
      writes := writes + 1;

      INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                            question_text, max_score, allow_partial, requires_media,
                                            manual_grading_required, payload_hash_version, created_by,
                                            published_at, published_by)
      VALUES (question_row.id, 1, 'published', coalesce(item->>'question_type','SHORT_ANSWER'),
              item->>'official_text', 1, false, false, true, 'v1', _actor_id, now(), _actor_id)
      RETURNING id INTO revision_id;
      writes := writes + 1;

      UPDATE public.questions SET current_published_revision_id = revision_id WHERE id = question_row.id;

      FOR opt IN SELECT value FROM jsonb_array_elements(coalesce(item->'options','[]'::jsonb)) LOOP
        INSERT INTO public.question_options(question_revision_id, option_code, body, sort_order, is_correct)
        VALUES (revision_id, coalesce(opt->>'code', 'opt-' || options_written::text),
                coalesce(opt->>'body', opt#>>'{}'), options_written, false);
        options_written := options_written + 1;
        writes := writes + 1;
      END LOOP;
    ELSE
      IF question_row.question_text IS DISTINCT FROM item->>'official_text' THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: questions %', question_code USING ERRCODE = '23514';
      END IF;
      revision_id := question_row.current_published_revision_id;
    END IF;

    SELECT value INTO answer FROM jsonb_array_elements(coalesce((companion->>'body')::jsonb->'answers','[]'::jsonb))
      WHERE value->>'question_id' = coalesce(item->>'id', question_code);
    IF answer IS NOT NULL AND revision_id IS NOT NULL THEN
      INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)
      VALUES (question_row.id, revision_id, answer->>'correct_option', answer->>'rationale')
      ON CONFLICT (question_id, revision_id) DO NOTHING;
      answers_written := answers_written + 1;
      writes := writes + 1;
    END IF;
  END LOOP;

  -- 7) selfTest -> lesson_assessments + assessment_questions (+ revision-pinned rationales)
  question_json := CASE WHEN payloads->'selfTest'->>'text' IS NULL THEN NULL
                        ELSE (payloads->'selfTest'->>'text')::jsonb END;
  IF question_json IS NOT NULL THEN
  SELECT id INTO assessment_id FROM public.lesson_assessments
   WHERE assessment_code = external_lesson_code || '-SELFTEST';
  IF assessment_id IS NULL THEN
    INSERT INTO public.lesson_assessments(lesson_id, title, instructions, sort_order, assessment_code)
    VALUES (lesson_row.id, 'اختبر نفسك', NULL, 0, external_lesson_code || '-SELFTEST')
    RETURNING id INTO assessment_id;
    writes := writes + 1;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(question_json->'questions','[]'::jsonb)) LOOP
    question_code := external_lesson_code || '-SELF-' || (item->>'id');
    SELECT * INTO question_row FROM public.questions WHERE code = question_code;
    IF question_row.id IS NULL THEN
      INSERT INTO public.questions(lesson_id, subject_id, question_text, options, correct_index,
                                   question_type, sort_order, code, created_by)
      VALUES (lesson_row.id, subject_row.id, item->>'question',
              coalesce(item->'options','[]'::jsonb), -1,
              coalesce(item->>'type','multiple_choice'), questions_written, question_code, _actor_id)
      RETURNING * INTO question_row;
      questions_written := questions_written + 1;
      writes := writes + 1;

      INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                            question_text, max_score, allow_partial, requires_media,
                                            manual_grading_required, payload_hash_version, created_by,
                                            published_at, published_by)
      VALUES (question_row.id, 1, 'published', coalesce(item->>'type','multiple_choice'),
              item->>'question', 1, false, false, false, 'v1', _actor_id, now(), _actor_id)
      RETURNING id INTO revision_id;
      writes := writes + 1;
      UPDATE public.questions SET current_published_revision_id = revision_id WHERE id = question_row.id;

      options_written := 0;
      FOR opt IN SELECT value FROM jsonb_array_elements(coalesce(item->'options','[]'::jsonb)) LOOP
        option_code := chr(97 + options_written);
        INSERT INTO public.question_options(question_revision_id, option_code, body, sort_order, is_correct)
        VALUES (revision_id, option_code, coalesce(opt->>'body', opt#>>'{}'), options_written, false);
        options_written := options_written + 1;
        writes := writes + 1;
      END LOOP;
    ELSE
      revision_id := question_row.current_published_revision_id;
    END IF;

    INSERT INTO public.assessment_questions(assessment_id, question_id, sort_order, points)
    VALUES (assessment_id, question_row.id, coalesce((item->>'source_row')::integer, 0), 1)
    ON CONFLICT (assessment_id, question_id) DO NOTHING;
    writes := writes + 1;

    SELECT value INTO answer FROM jsonb_array_elements(coalesce((companion->>'body')::jsonb->'answers','[]'::jsonb))
      WHERE value->>'question_id' = (item->>'id');
    IF answer IS NOT NULL AND revision_id IS NOT NULL THEN
      INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)
      VALUES (question_row.id, revision_id, answer->>'correct_option', answer->>'rationale')
      ON CONFLICT (question_id, revision_id) DO NOTHING;
      answers_written := answers_written + 1;
      INSERT INTO public.question_option_rationales(question_id, question_revision_id, option_id,
                                                    why_correct, why_wrong)
      VALUES (question_row.id, revision_id,
              regexp_replace(coalesce(answer->>'correct_option','?'),'[^a-z]','','g'),
              answer->>'rationale', NULL)
      ON CONFLICT (question_revision_id, option_id) DO NOTHING;
      rationales_written := rationales_written + 1;
      writes := writes + 2;
    END IF;
  END LOOP;
  END IF;

  -- Lifecycle: seven capabilities, DRAFT + REQUIRED only. No REVIEW / READY / publish.
  FOR cap, lifecycle_cap IN
    SELECT capability, lifecycle_capability FROM public.golden_lesson_domain_stage_entries
     WHERE batch_id = _batch_id ORDER BY capability LOOP
    INSERT INTO public.lesson_capability_lifecycle(lesson_id, capability, status, applicability,
                                                   draft_hash, draft_updated_at)
    VALUES (lesson_row.id, lifecycle_cap, 'DRAFT', 'REQUIRED',
            payloads->cap->>'sha256', now())
    ON CONFLICT (lesson_id, capability) DO NOTHING;
    lifecycle_written := lifecycle_written + 1;
    writes := writes + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.question_options o
      JOIN public.question_revisions r ON r.id = o.question_revision_id
      JOIN public.questions q ON q.id = r.question_id
     WHERE q.lesson_id = lesson_row.id AND o.is_correct) THEN
    RAISE EXCEPTION 'CF10_ANSWER_LEAK_IN_OPTIONS' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.questions WHERE lesson_id = lesson_row.id AND correct_index >= 0) THEN
    RAISE EXCEPTION 'CF10_ANSWER_LEAK_IN_QUESTION_ROW' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle
              WHERE lesson_id = lesson_row.id AND status <> 'DRAFT') THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_MUST_STAY_DRAFT' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.golden_lesson_domain_materializations(
    batch_id, binding_id, subject_id, lesson_id, lesson_created, idempotency_key,
    write_plan, write_plan_sha256, result, materialized_by)
  VALUES (_batch_id, binding.id, subject_row.id, lesson_row.id, lesson_created,
          btrim(_idempotency_key), plan, plan_sha,
          jsonb_build_object('mode','EXECUTE','lesson_id',lesson_row.id,'subject_id',subject_row.id,
            'lesson_created',lesson_created,'questions',questions_written,'answers',answers_written,
            'rationales',rationales_written,'lifecycle_rows',lifecycle_written,
            'write_plan_sha256',plan_sha,'answer_leak',0,'published',false,'ready',false),
          _actor_id)
  RETURNING * INTO replay;

  RETURN replay.result || jsonb_build_object('idempotent',false,'writes_performed',writes,
    'domain_writes_performed',writes);
END;
$$;

REVOKE ALL ON FUNCTION public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.cf10_assert_no_answer_leak(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_assert_no_answer_leak(text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cf10_text_sha256(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_text_sha256(text) TO authenticated, service_role;

COMMENT ON TABLE public.golden_lesson_domain_materializations IS
  'Immutable CF10 ledger: one atomic DRAFT-only materialization per verified staged batch; never publishes, never deletes, never creates subjects.';
