-- CONTENT_FACTORY_10_DOMAIN_MATERIALIZATION (revision R4)
-- Status: SOURCE-READY / NOT APPLIED TO PRODUCTION.
-- Scope: atomic, idempotent, fail-closed materialization of one verified CF08 batch
--        (optionally CF09-bound) into the natural domain tables, DRAFT lifecycle only.
--
-- R2: revisions are DRAFT only; no publish pointers; canonical QB payload_hash;
--     assessment_questions membership deliberately deferred.
-- R3: first student visibility gate + first identity guards.
--     VERDICT R3 = BLOCKED_PARTIAL_READY_LESSON_SCOPE_LEAK — the gate opened the whole
--     lesson scope (can_access_lesson) as soon as ONE capability turned READY, so the
--     remaining DRAFT capabilities became readable through the Data API.
-- R4 (this revision):
--   * Visibility is all-or-nothing: a managed lesson is student-visible only when it has
--     at least one REQUIRED lifecycle row AND every REQUIRED row is READY. NA rows never
--     block. OPTIONAL rows never block. Legacy unmanaged lessons are untouched.
--     CF10 pins exactly seven REQUIRED capabilities per batch.
--   * Fail-closed replay/identity: every pre-existing row that CF10 would otherwise reuse
--     is compared field-by-field (lesson, resources, questions, revisions, options,
--     targets, answers, rationales, assessment, lifecycle). Any divergence aborts the whole
--     transaction with CF10_IDENTITY_CONFLICT / CF10_CONTENT_HASH_CONFLICT and no ledger row.
--   * Binding resolution is authoritative: zero or exactly one binding; ambiguity aborts.
--   * Counters come from real ROW_COUNT / RETURNING. payload_hash UPDATEs are reported in a
--     separate counter and never inflate domain_writes_performed. An exact replay or a fully
--     pre-existing identical state performs 0 domain writes.
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

-- The exact seven capabilities a CF10 batch must stage, and their lifecycle names.
CREATE OR REPLACE FUNCTION public.cf10_required_capabilities()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT ARRAY['labExperimentHtml','lessonSummaryHtml','mindMapHtml','officialBookContent',
               'officialBookQuestions','selfTest','tamkeenExplanationHtml']::text[];
$$;

-- CF10-R4b: the single safe inline-HTML delivery reference. `lesson-internal://` is the
-- existing, published in-app scheme (see lesson-capabilities.isValidResourceUrl); CF10 adds the
-- `html/<resource_code>` kind for HTML bodies that live in lesson_resources.description.
-- No storage bucket is invented and no data: URI is used.
CREATE OR REPLACE FUNCTION public.cf10_inline_html_url(_resource_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT 'lesson-internal://html/' || btrim(coalesce(_resource_code,''));
$$;

-- CF10-R4c: canonical attestation of the IMMUTABLE SEED that CF10 materialized for one lesson.
-- Scope (immutable seed): content identity (subject, slug, title, codes, urls, structural links)
-- and the sha256 of every body CF10 wrote, plus the seed (lowest-numbered) revision of every
-- seeded question and the exact staged capability/applicability set.
-- Deliberately EXCLUDED because downstream workflow may change them legitimately:
--   * lesson_capability_lifecycle.status (DRAFT -> REVIEW -> READY) and draft_hash bumps
--   * question_revisions.status, later revisions, questions.current_published_revision_id
--   * lesson_resources.is_primary / sort_order (publication + editorial ordering)
--   * lessons.unit_id / is_free / sort_order (curriculum placement + pricing)
--   * assessment membership counts (CF10 defers membership on purpose)
-- Any change outside that allow-list means the materialized seed drifted, was deleted or the
-- identity was re-bound; replay must abort instead of returning a cached success.
CREATE OR REPLACE FUNCTION public.cf10_seed_state_sha256(_lesson_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT encode(digest(convert_to(jsonb_build_object(
    'schema','tamkeen.content-factory-10.seed-attestation.v1',
    'lesson', (SELECT jsonb_build_object('id',l.id,'subjectId',l.subject_id,'slug',l.slug,
                        'title',l.title,'semester',l.semester)
                 FROM public.lessons l WHERE l.id = _lesson_id),
    'book', COALESCE((SELECT jsonb_agg(public.cf10_text_sha256(b.content) ORDER BY b.id)
                        FROM public.lesson_book_contents b WHERE b.lesson_id = _lesson_id),'[]'::jsonb),
    'explanations', COALESCE((SELECT jsonb_agg(jsonb_build_object('code',e.explanation_code,
                        'title',e.title,
                        'sha256',public.cf10_text_sha256(e.content)) ORDER BY e.explanation_code)
                        FROM public.lesson_explanations e WHERE e.lesson_id = _lesson_id),'[]'::jsonb),
    'summaries', COALESCE((SELECT jsonb_agg(public.cf10_text_sha256(s.summary) ORDER BY s.id)
                        FROM public.lesson_summaries s WHERE s.lesson_id = _lesson_id),'[]'::jsonb),
    'resources', COALESCE((SELECT jsonb_agg(jsonb_build_object('code',r.resource_code,
                        'type',r.resource_type::text,'title',r.title,'url',r.url,
                        'htmlType',r.html_resource_type,'metaSha',r.metadata->>'sha256',
                        'bodySha',public.cf10_text_sha256(r.description)) ORDER BY r.resource_code)
                        FROM public.lesson_resources r WHERE r.lesson_id = _lesson_id),'[]'::jsonb),
    'questions', COALESCE((SELECT jsonb_agg(jsonb_build_object('code',q.code,
                        'type',q.question_type,'correctIndex',q.correct_index,
                        'textSha',public.cf10_text_sha256(q.question_text),
                        -- seed revision only: a later DRAFT/REVIEW/PUBLISHED revision is legitimate
                        'seedRevision',(SELECT jsonb_build_object(
                              'number',rv.revision_number,
                              'interaction',rv.interaction_type,'grading',rv.grading_mode,
                              'sourceHash',rv.source_payload_hash,
                              'textSha',public.cf10_text_sha256(rv.question_text),
                              'options',(SELECT COALESCE(jsonb_agg(jsonb_build_object('code',o.option_code,
                                    'sortOrder',o.sort_order,'isCorrect',o.is_correct,
                                    'bodySha',public.cf10_text_sha256(o.body))
                                    ORDER BY o.sort_order,o.option_code),'[]'::jsonb)
                                 FROM public.question_options o WHERE o.question_revision_id = rv.id),
                              'targets',(SELECT COALESCE(jsonb_agg(jsonb_build_object('type',t.target_type,
                                    'subjectId',t.subject_id,'lessonId',t.lesson_id,'isPrimary',t.is_primary)
                                    ORDER BY t.target_type),'[]'::jsonb)
                                 FROM public.question_targets t WHERE t.revision_id = rv.id),
                              'answers',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                    'modelSha',public.cf10_text_sha256(a.model_answer),
                                    'explanationSha',public.cf10_text_sha256(a.explanation))
                                    ORDER BY a.id),'[]'::jsonb)
                                 FROM public.official_question_answers a WHERE a.revision_id = rv.id),
                              'rationales',(SELECT COALESCE(jsonb_agg(jsonb_build_object('optionId',ra.option_id,
                                    'whyCorrectSha',public.cf10_text_sha256(ra.why_correct),
                                    'whyWrongSha',public.cf10_text_sha256(ra.why_wrong))
                                    ORDER BY ra.option_id),'[]'::jsonb)
                                 FROM public.question_option_rationales ra
                                WHERE ra.question_revision_id = rv.id))
                           FROM public.question_revisions rv
                          WHERE rv.question_id = q.id
                          ORDER BY rv.revision_number LIMIT 1))
                        ORDER BY q.code)
                        FROM public.questions q WHERE q.lesson_id = _lesson_id),'[]'::jsonb),
    'assessments', COALESCE((SELECT jsonb_agg(jsonb_build_object('code',a.assessment_code,
                        'title',a.title) ORDER BY a.assessment_code)
                        FROM public.lesson_assessments a WHERE a.lesson_id = _lesson_id),'[]'::jsonb),
    'lifecycleSet', COALESCE((SELECT jsonb_agg(jsonb_build_object('capability',lc.capability,
                        'applicability',lc.applicability::text) ORDER BY lc.capability)
                        FROM public.lesson_capability_lifecycle lc WHERE lc.lesson_id = _lesson_id),'[]'::jsonb)
  )::text,'UTF8'),'sha256'),'hex');
$$;

-- CF10-R4c: mindMap / simulation HTML staged by CF10 is TEMPORARY. It stays an internal
-- lesson-internal:// payload until CF11 publishes the HTML asset and stamps
-- metadata->>'cf11_published_at'. Until then CF10 must not claim READY nor a valid snapshot.
CREATE OR REPLACE FUNCTION public.cf10_html_publication_pending(_lesson_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lesson_resources r
     WHERE r.lesson_id = _lesson_id
       AND ((_capability = 'mindMap' AND r.resource_type::text = 'mindmap')
         OR (_capability = 'simulation' AND r.resource_type::text = 'experiment'))
       AND r.url LIKE 'lesson-internal://html/%'
       AND coalesce(r.metadata->>'cf11_published_at','') = '');
$$;


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
  binding_count integer := 0;
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
  revision_row public.question_revisions;
  resource_row public.lesson_resources;
  answer_row public.official_question_answers;
  rationale_row public.question_option_rationales;
  target_row public.question_targets;
  assessment_row public.lesson_assessments;
  v_revision_id uuid;
  v_assessment_id uuid;
  question_code text;
  option_code text;
  answer jsonb;
  staged_caps text[];
  expected_title text;
  expected_semester integer;
  expected_sort integer;
  expected_type text;
  expected_options jsonb;
  expected_grading text;
  expected_interaction text;
  expected_resource_type text;
  expected_resource_title text;
  expected_resource_sort integer;
  expected_html_type text;
  expected_applicability text;
  opt_index integer := 0;
  domain_writes integer := 0;
  hash_updates integer := 0;
  ledger_writes integer := 0;
  questions_written integer := 0;
  options_written integer := 0;
  answers_written integer := 0;
  rationales_written integer := 0;
  targets_written integer := 0;
  lifecycle_written integer := 0;
  rc integer := 0;
  existing_status text;
  existing_applicability text;
  existing_draft_hash text;

  payloads jsonb := '{}'::jsonb;
  existing_hash text;
  new_hash text;
  dup_count integer := 0;
  seed_state_sha text;
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
  -- R4: identity is never invented. Every field CF10 would write must be present.
  IF coalesce(btrim(ident->>'subjectCode'),'') = ''
     OR coalesce(btrim(ident->>'lessonSlug'),'') = ''
     OR coalesce(btrim(ident->>'lessonCode'),'') = ''
     OR (ident->>'semester') IS NULL THEN
    RAISE EXCEPTION 'CF10_IDENTITY_MANIFEST_INCOMPLETE' USING ERRCODE = '22023';
  END IF;
  external_lesson_code := btrim(ident->>'lessonCode');
  expected_title := coalesce(nullif(btrim(coalesce(ident->>'lessonTitle','')),''), btrim(ident->>'lessonSlug'));
  expected_semester := (ident->>'semester')::integer;
  expected_sort := coalesce((ident->>'sortOrder')::integer, 0);

  -- Subject: authoritative existing row only. CF10 never creates or renames a subject.
  IF (SELECT count(*) FROM public.subjects
       WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'))) <> 1 THEN
    RAISE EXCEPTION 'CF10_SUBJECT_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO subject_row FROM public.subjects
   WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'));

  -- R4: binding resolution must be authoritative — zero bindings (explicit no-binding path)
  -- or exactly one. Ambiguity is never resolved heuristically.
  SELECT count(*) INTO binding_count
    FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
  IF binding_count > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_BINDING_AMBIGUOUS' USING ERRCODE = '23514';
  END IF;
  IF binding_count = 1 THEN
    SELECT * INTO binding FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
    IF binding.subject_id IS DISTINCT FROM subject_row.id THEN
      RAISE EXCEPTION 'CF10_IDENTITY_BINDING_SUBJECT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF btrim(binding.external_lesson_code) IS DISTINCT FROM external_lesson_code THEN
      RAISE EXCEPTION 'CF10_IDENTITY_BINDING_CODE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF (SELECT count(*) FROM public.lessons
       WHERE subject_id = subject_row.id
         AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'))) > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lessons for slug %', ident->>'lessonSlug'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO lesson_row FROM public.lessons
   WHERE subject_id = subject_row.id AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'));
  IF binding_count = 1 AND lesson_row.id IS NOT NULL
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
  -- R4: exactly the seven pinned capabilities, no more, no fewer, no substitutes.
  SELECT array_agg(k ORDER BY k) INTO staged_caps FROM jsonb_object_keys(payloads) AS k;
  IF coalesce(staged_caps, ARRAY[]::text[]) IS DISTINCT FROM public.cf10_required_capabilities() THEN
    RAISE EXCEPTION 'CF10_STAGED_CAPABILITY_SET_INVALID' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.golden_lesson_domain_stage_answers WHERE batch_id = _batch_id) > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate answer companion' USING ERRCODE = '23514';
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
    'lifecycleTarget', jsonb_build_object('status','DRAFT','applicability','AS_STAGED','capabilities',7),
    'revisionTarget', jsonb_build_object('status','DRAFT','payloadHashVersion','canonical_payload_v1',
                                         'publishedPointer',false,'assessmentMembership',false),
    'visibilityTarget', jsonb_build_object('studentVisible',false,'requiresAllRequiredReady',true),
    'forbidden', jsonb_build_object('subjectCreate',false,'delete',false,'storage',false,
                                    'publish',false,'ready',false));

  plan_sha := public.cf10_text_sha256(plan::text);

  IF _mode = 'DRY_RUN' THEN
    RETURN jsonb_build_object('mode','DRY_RUN','write_plan',plan,'write_plan_sha256',plan_sha,
      'writes_performed',0,'domain_writes_performed',0,'payload_hash_updates',0,
      'ledger_writes',0,'answer_leak',0,
      'lesson_will_be_created', lesson_row.id IS NULL);
  END IF;

  IF _idempotency_key IS NULL OR length(btrim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'CF10_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  -- Replay is resolved against the pinned ledger plan first: a completed batch changes the
  -- observed pre-state (lessonExists), so the freshly computed plan hash is not comparable.
  SELECT * INTO replay FROM public.golden_lesson_domain_materializations WHERE batch_id = _batch_id;
  IF replay.id IS NOT NULL THEN
    IF replay.idempotency_key IS DISTINCT FROM btrim(_idempotency_key)
       OR _expected_plan_sha256 IS DISTINCT FROM replay.write_plan_sha256 THEN
      RAISE EXCEPTION 'CF10_REPLAY_CONFLICT' USING ERRCODE = '23514';
    END IF;
    -- R4c: replay proves the LEDGER SEED, not the whole mutable live state.
    -- (1) Ledger + source identity: batch, plan hash, idempotency key, verified bundle,
    --     answer companion hash and the subject/lesson identity are re-verified now.
    IF replay.subject_id IS DISTINCT FROM subject_row.id
       OR (replay.write_plan->>'verifiedBundleSha256') IS DISTINCT FROM batch.verified_bundle_sha256
       OR (replay.write_plan->>'answerCompanionSha256') IS DISTINCT FROM (companion->>'companion_sha256')
       OR (replay.write_plan->>'externalLessonCode') IS DISTINCT FROM external_lesson_code
       OR lower(btrim(coalesce(replay.write_plan->>'lessonSlug',''))) IS DISTINCT FROM
          lower(btrim(ident->>'lessonSlug')) THEN
      RAISE EXCEPTION 'CF10_REPLAY_IDENTITY_REBOUND' USING ERRCODE = '23514';
    END IF;
    -- (2) A cached success is NEVER returned before the immutable seed is re-attested.
    IF coalesce(replay.result->>'seed_sha256', replay.result->>'state_sha256','') = '' THEN
      RAISE EXCEPTION 'CF10_REPLAY_ATTESTATION_MISSING' USING ERRCODE = '23514';
    END IF;
    IF replay.lesson_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.lessons WHERE id = replay.lesson_id) THEN
      RAISE EXCEPTION 'CF10_REPLAY_STATE_DRIFT: lesson missing' USING ERRCODE = '23514';
    END IF;
    -- The lesson the ledger points at must still be the lesson this identity resolves to.
    IF lesson_row.id IS NOT NULL AND lesson_row.id IS DISTINCT FROM replay.lesson_id THEN
      RAISE EXCEPTION 'CF10_REPLAY_IDENTITY_REBOUND' USING ERRCODE = '23514';
    END IF;
    -- (3) Seed attestation: deletions, payload edits and identity rewrites abort;
    --     legitimate downstream transitions (REVIEW/READY, new revisions, publishing a
    --     revision or a resource, curriculum placement) are outside the attested scope.
    seed_state_sha := public.cf10_seed_state_sha256(replay.lesson_id);
    IF seed_state_sha IS DISTINCT FROM
       coalesce(replay.result->>'seed_sha256', replay.result->>'state_sha256') THEN
      RAISE EXCEPTION 'CF10_REPLAY_STATE_DRIFT' USING ERRCODE = '23514';
    END IF;
    -- Visibility stays fail-closed on replay: the lesson may only be student-visible if every
    -- REQUIRED capability legitimately reached READY afterwards. Any other visibility is a leak.
    IF public.lesson_student_visible(replay.lesson_id)
       AND EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle lc
                    WHERE lc.lesson_id = replay.lesson_id
                      AND lc.applicability = 'REQUIRED' AND lc.status <> 'READY') THEN
      RAISE EXCEPTION 'CF10_STUDENT_VISIBILITY_LEAK' USING ERRCODE = '23514';
    END IF;

    RETURN replay.result || jsonb_build_object('idempotent',true,'writes_performed',0,
      'domain_writes_performed',0,'payload_hash_updates',0,'ledger_writes',0,
      'ledger_attested',true,
      'live_attested',true,
      'attested_scope','immutable_seed',
      'mutable_fields_allowed', jsonb_build_array(
        'lesson_capability_lifecycle.status','lesson_capability_lifecycle.draft_hash',
        'question_revisions.status','question_revisions(additional)',
        'questions.current_published_revision_id',
        'lesson_resources.is_primary','lesson_resources.sort_order',
        'lessons.unit_id','lessons.is_free','lessons.sort_order',
        'assessment_questions(membership)'),
      'html_publication_pending', jsonb_build_object(
        'mindMap', public.cf10_html_publication_pending(replay.lesson_id,'mindMap'),
        'simulation', public.cf10_html_publication_pending(replay.lesson_id,'simulation')));
  END IF;

  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF10_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  -- Lesson: created only when absent. An existing lesson must match the manifest exactly.
  IF lesson_row.id IS NULL THEN
    INSERT INTO public.lessons(subject_id, slug, title, unit_id, is_free, semester, sort_order)
    VALUES (subject_row.id, btrim(ident->>'lessonSlug'), expected_title,
            NULL, true, expected_semester, expected_sort)
    RETURNING * INTO lesson_row;
    GET DIAGNOSTICS rc = ROW_COUNT;
    lesson_created := true;
    domain_writes := domain_writes + rc;
  ELSE
    IF lesson_row.subject_id IS DISTINCT FROM subject_row.id
       OR lesson_row.title IS DISTINCT FROM expected_title
       OR lesson_row.unit_id IS NOT NULL
       OR lesson_row.is_free IS DISTINCT FROM true
       OR lesson_row.semester IS DISTINCT FROM expected_semester
       OR lesson_row.sort_order IS DISTINCT FROM expected_sort THEN
      RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: lessons %', lesson_row.slug USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 1) officialBookContent -> lesson_book_contents (natural key: lesson_id)
  payload_text := payloads->'officialBookContent'->>'text';
  new_hash := public.cf10_text_sha256(payload_text);
  IF (SELECT count(*) FROM public.lesson_book_contents WHERE lesson_id = lesson_row.id) > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lesson_book_contents' USING ERRCODE = '23514';
  END IF;
  SELECT public.cf10_text_sha256(content) INTO existing_hash
    FROM public.lesson_book_contents WHERE lesson_id = lesson_row.id;
  IF existing_hash IS NULL THEN
    INSERT INTO public.lesson_book_contents(lesson_id, content) VALUES (lesson_row.id, payload_text);
    GET DIAGNOSTICS rc = ROW_COUNT;
    domain_writes := domain_writes + rc;
  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_book_contents' USING ERRCODE = '23514';
  END IF;

  -- 2) tamkeenExplanationHtml -> lesson_explanations (natural key: lesson_id, explanation_code)
  payload_text := payloads->'tamkeenExplanationHtml'->>'text';
  new_hash := public.cf10_text_sha256(payload_text);
  IF (SELECT count(*) FROM public.lesson_explanations
       WHERE lesson_id = lesson_row.id AND explanation_code = external_lesson_code || '-EXP') > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lesson_explanations' USING ERRCODE = '23514';
  END IF;
  SELECT public.cf10_text_sha256(content) INTO existing_hash
    FROM public.lesson_explanations
   WHERE lesson_id = lesson_row.id AND explanation_code = external_lesson_code || '-EXP';
  IF existing_hash IS NULL THEN
    INSERT INTO public.lesson_explanations(lesson_id, title, content, sort_order, explanation_code)
    VALUES (lesson_row.id, 'شرح تمكين', payload_text, 0, external_lesson_code || '-EXP');
    GET DIAGNOSTICS rc = ROW_COUNT;
    domain_writes := domain_writes + rc;
  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_explanations' USING ERRCODE = '23514';
  END IF;

  -- 3) lessonSummaryHtml -> lesson_summaries (natural key: lesson_id)
  payload_text := payloads->'lessonSummaryHtml'->>'text';
  new_hash := public.cf10_text_sha256(payload_text);
  IF (SELECT count(*) FROM public.lesson_summaries WHERE lesson_id = lesson_row.id) > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lesson_summaries' USING ERRCODE = '23514';
  END IF;
  SELECT public.cf10_text_sha256(summary) INTO existing_hash
    FROM public.lesson_summaries WHERE lesson_id = lesson_row.id;
  IF existing_hash IS NULL THEN
    INSERT INTO public.lesson_summaries(lesson_id, summary) VALUES (lesson_row.id, payload_text);
    GET DIAGNOSTICS rc = ROW_COUNT;
    domain_writes := domain_writes + rc;
  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_summaries' USING ERRCODE = '23514';
  END IF;

  -- 4/5) mindMapHtml + labExperimentHtml -> lesson_resources (natural key: lesson_id, resource_code)
  --      R4: a reused resource row must match EVERY written column, not only the body.
  FOREACH cap IN ARRAY ARRAY['mindMapHtml','labExperimentHtml'] LOOP
    payload_text := payloads->cap->>'text';
    CONTINUE WHEN payload_text IS NULL;
    option_code := CASE cap WHEN 'mindMapHtml' THEN external_lesson_code || '-MINDMAP'
                            ELSE external_lesson_code || '-EXPERIMENT' END;
    expected_resource_type := CASE cap WHEN 'mindMapHtml' THEN 'mindmap' ELSE 'experiment' END;
    expected_resource_title := CASE cap WHEN 'mindMapHtml' THEN 'الخريطة الذهنية' ELSE 'التجربة العملية' END;
    expected_resource_sort := CASE cap WHEN 'mindMapHtml' THEN 1 ELSE 2 END;
    expected_html_type := CASE cap WHEN 'mindMapHtml' THEN 'STATIC' ELSE 'INTERACTIVE' END;
    IF (SELECT count(*) FROM public.lesson_resources
         WHERE lesson_id = lesson_row.id AND resource_code = option_code) > 1 THEN
      RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lesson_resources %', option_code
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO resource_row FROM public.lesson_resources
     WHERE lesson_id = lesson_row.id AND resource_code = option_code;
    IF resource_row.id IS NULL THEN
      INSERT INTO public.lesson_resources(lesson_id, resource_type, title, url, description,
                                          sort_order, resource_code, html_resource_type, metadata, is_primary)
      VALUES (lesson_row.id, expected_resource_type::public.lesson_resource_type,
              expected_resource_title, public.cf10_inline_html_url(option_code), payload_text,
              expected_resource_sort, option_code, expected_html_type,
              jsonb_build_object('contentFactory','CF10','sha256', payloads->cap->>'sha256',
                                 'htmlDelivery','INLINE_SANDBOXED',
                                 'renderMode', CASE WHEN expected_html_type = 'INTERACTIVE'
                                                    THEN 'SANDBOXED_NO_NETWORK' ELSE 'STATIC_NO_SCRIPT' END,
                                 'contentHash', public.cf10_text_sha256(payload_text)), false);
      GET DIAGNOSTICS rc = ROW_COUNT;
      domain_writes := domain_writes + rc;
    ELSE
      IF resource_row.lesson_id IS DISTINCT FROM lesson_row.id
         OR resource_row.resource_type::text IS DISTINCT FROM expected_resource_type
         OR resource_row.title IS DISTINCT FROM expected_resource_title
         OR coalesce(resource_row.url,'') IS DISTINCT FROM public.cf10_inline_html_url(option_code)
         OR resource_row.sort_order IS DISTINCT FROM expected_resource_sort
         OR resource_row.html_resource_type IS DISTINCT FROM expected_html_type
         OR coalesce(resource_row.metadata->>'sha256','') IS DISTINCT FROM (payloads->cap->>'sha256')
         OR coalesce(resource_row.metadata->>'contentFactory','') IS DISTINCT FROM 'CF10'
         OR coalesce(resource_row.metadata->>'htmlDelivery','') IS DISTINCT FROM 'INLINE_SANDBOXED'
         OR coalesce(resource_row.metadata->>'renderMode','') IS DISTINCT FROM
            (CASE WHEN expected_html_type = 'INTERACTIVE' THEN 'SANDBOXED_NO_NETWORK' ELSE 'STATIC_NO_SCRIPT' END)
         OR coalesce(resource_row.metadata->>'contentHash','')
            IS DISTINCT FROM public.cf10_text_sha256(payload_text)
         OR resource_row.is_primary IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: lesson_resources %', option_code USING ERRCODE = '23514';
      END IF;
      IF public.cf10_text_sha256(resource_row.description)
         IS DISTINCT FROM public.cf10_text_sha256(payload_text) THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_resources %', cap USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  -- 6) officialBookQuestions -> questions + question_revisions(DRAFT) + question_options + targets.
  --    Answers stay strictly revision-pinned inside the confidential tables.
  question_json := CASE WHEN payloads->'officialBookQuestions'->>'text' IS NULL THEN '{}'::jsonb
                        ELSE (payloads->'officialBookQuestions'->>'text')::jsonb END;
  IF jsonb_typeof(question_json) <> 'object' THEN question_json := jsonb_build_object('questions', question_json); END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(question_json->'questions','[]'::jsonb)) LOOP
    question_code := external_lesson_code || '-OFFQ-' || coalesce(item->>'question_number', item->>'id');
    expected_type := coalesce(item->>'question_type','SHORT_ANSWER');
    expected_options := coalesce(item->'options','[]'::jsonb);
    expected_grading := 'MANUAL';
    expected_interaction := expected_type;
    IF (SELECT count(*) FROM public.questions WHERE code = question_code) > 1 THEN
      RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate questions %', question_code
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO question_row FROM public.questions WHERE code = question_code;
    IF question_row.id IS NULL THEN
      INSERT INTO public.questions(lesson_id, subject_id, question_text, options, correct_index,
                                   question_type, sort_order, code, created_by)
      VALUES (lesson_row.id, subject_row.id, item->>'official_text',
              expected_options, -1, expected_type, questions_written, question_code, _actor_id)
      RETURNING * INTO question_row;
      GET DIAGNOSTICS rc = ROW_COUNT;
      questions_written := questions_written + rc;
      domain_writes := domain_writes + rc;

      INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                            grading_mode, question_text, max_score, allow_partial,
                                            requires_media, manual_grading_required,
                                            payload_hash_version, source_payload_hash, created_by)
      VALUES (question_row.id, 1, 'DRAFT', expected_interaction,
              expected_grading, item->>'official_text', 1, false, false, true,
              'canonical_payload_v1', payloads->'officialBookQuestions'->>'sha256', _actor_id)
      RETURNING id INTO v_revision_id;
      GET DIAGNOSTICS rc = ROW_COUNT;
      domain_writes := domain_writes + rc;

      opt_index := 0;
      FOR opt IN SELECT value FROM jsonb_array_elements(expected_options) LOOP
        INSERT INTO public.question_options(question_revision_id, option_code, body, sort_order, is_correct)
        VALUES (v_revision_id, coalesce(opt->>'code', 'opt-' || opt_index::text),
                coalesce(opt->>'body', opt#>>'{}'), opt_index, false);
        GET DIAGNOSTICS rc = ROW_COUNT;
        opt_index := opt_index + 1;
        options_written := options_written + rc;
        domain_writes := domain_writes + rc;
      END LOOP;

      INSERT INTO public.question_targets(question_id, revision_id, target_type, subject_id,
                                          lesson_id, is_primary, created_by)
      VALUES (question_row.id, v_revision_id, 'LESSON', subject_row.id, lesson_row.id, true, _actor_id);
      GET DIAGNOSTICS rc = ROW_COUNT;
      targets_written := targets_written + rc;
      domain_writes := domain_writes + rc;

      -- Canonical QB contract hash over the freshly written draft payload (no invented algorithm).
      UPDATE public.question_revisions
         SET payload_hash = public._qb_compute_revision_payload_hash(v_revision_id),
             payload_hash_version = 'canonical_payload_v1'
       WHERE id = v_revision_id;
      GET DIAGNOSTICS rc = ROW_COUNT;
      hash_updates := hash_updates + rc;
    ELSE
      -- R4: reuse only when the pre-existing graph is byte-for-byte what CF10 would write.
      IF question_row.lesson_id IS DISTINCT FROM lesson_row.id
         OR question_row.subject_id IS DISTINCT FROM subject_row.id
         OR question_row.code IS DISTINCT FROM question_code
         OR question_row.question_type IS DISTINCT FROM expected_type
         OR question_row.correct_index IS DISTINCT FROM -1 THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: questions %', question_code USING ERRCODE = '23514';
      END IF;
      IF coalesce(question_row.options,'[]'::jsonb) IS DISTINCT FROM expected_options
         OR question_row.question_text IS DISTINCT FROM item->>'official_text' THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: questions %', question_code USING ERRCODE = '23514';
      END IF;
      IF (SELECT count(*) FROM public.question_revisions
           WHERE question_id = question_row.id) <> 1 THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_revisions %', question_code
          USING ERRCODE = '23514';
      END IF;
      SELECT * INTO revision_row FROM public.question_revisions
       WHERE question_id = question_row.id AND status = 'DRAFT';
      IF revision_row.id IS NULL THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      IF revision_row.revision_number IS DISTINCT FROM 1
         OR revision_row.status IS DISTINCT FROM 'DRAFT'
         OR revision_row.interaction_type IS DISTINCT FROM expected_interaction
         OR revision_row.grading_mode IS DISTINCT FROM expected_grading
         OR revision_row.question_text IS DISTINCT FROM item->>'official_text'
         OR revision_row.source_payload_hash IS DISTINCT FROM (payloads->'officialBookQuestions'->>'sha256')
         OR revision_row.payload_hash_version IS DISTINCT FROM 'canonical_payload_v1'
         OR revision_row.payload_hash IS DISTINCT FROM public._qb_compute_revision_payload_hash(revision_row.id) THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      v_revision_id := revision_row.id;
      -- options: exact set, order, body, and no answer key.
      IF (SELECT count(*) FROM public.question_options WHERE question_revision_id = v_revision_id)
         IS DISTINCT FROM jsonb_array_length(expected_options) THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_options %', question_code USING ERRCODE = '23514';
      END IF;
      SELECT count(DISTINCT o.sort_order) INTO dup_count
        FROM public.question_options o WHERE o.question_revision_id = v_revision_id;
      IF dup_count IS DISTINCT FROM jsonb_array_length(expected_options) THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate question_options %', question_code
          USING ERRCODE = '23514';
      END IF;
      opt_index := 0;
      FOR opt IN SELECT value FROM jsonb_array_elements(expected_options) LOOP
        IF NOT EXISTS (SELECT 1 FROM public.question_options o
                        WHERE o.question_revision_id = v_revision_id
                          AND o.sort_order = opt_index
                          AND o.option_code = coalesce(opt->>'code','opt-' || opt_index::text)
                          AND o.body = coalesce(opt->>'body', opt#>>'{}')
                          AND o.is_correct = false) THEN
          RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_options %', question_code USING ERRCODE = '23514';
        END IF;
        opt_index := opt_index + 1;
      END LOOP;
      IF (SELECT count(*) FROM public.question_targets WHERE revision_id = v_revision_id) <> 1 THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_targets %', question_code
          USING ERRCODE = '23514';
      END IF;
      SELECT * INTO target_row FROM public.question_targets
       WHERE question_id = question_row.id AND revision_id = v_revision_id AND target_type = 'LESSON';
      IF target_row.id IS NULL
         OR target_row.subject_id IS DISTINCT FROM subject_row.id
         OR target_row.lesson_id IS DISTINCT FROM lesson_row.id
         OR target_row.is_primary IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_targets %', question_code USING ERRCODE = '23514';
      END IF;
    END IF;

    SELECT value INTO answer FROM jsonb_array_elements(coalesce((companion->>'body')::jsonb->'answers','[]'::jsonb))
      WHERE value->>'question_id' = coalesce(item->>'id', question_code);
    IF answer IS NOT NULL AND v_revision_id IS NOT NULL THEN
      IF (SELECT count(*) FROM public.official_question_answers
           WHERE question_id = question_row.id) > 1 THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate official_question_answers %', question_code
          USING ERRCODE = '23514';
      END IF;
      SELECT * INTO answer_row FROM public.official_question_answers
       WHERE question_id = question_row.id AND revision_id = v_revision_id;
      IF answer_row.id IS NULL THEN
        INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)
        VALUES (question_row.id, v_revision_id, answer->>'correct_option', answer->>'rationale');
        GET DIAGNOSTICS rc = ROW_COUNT;
        answers_written := answers_written + rc;
        domain_writes := domain_writes + rc;
      ELSIF answer_row.model_answer IS DISTINCT FROM (answer->>'correct_option')
         OR answer_row.explanation IS DISTINCT FROM (answer->>'rationale') THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: official_question_answers %', question_code USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  -- 7) selfTest -> lesson_assessments shell + DRAFT questions (+ revision-pinned rationales).
  --    Membership in assessment_questions requires a PUBLISHED revision, so it stays deferred.
  question_json := CASE WHEN payloads->'selfTest'->>'text' IS NULL THEN NULL
                        ELSE (payloads->'selfTest'->>'text')::jsonb END;
  IF question_json IS NOT NULL THEN

  -- R4: an existing assessment must match every written column, and belong to this lesson.
  IF (SELECT count(*) FROM public.lesson_assessments
       WHERE assessment_code = external_lesson_code || '-SELFTEST') > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lesson_assessments' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO assessment_row FROM public.lesson_assessments
   WHERE assessment_code = external_lesson_code || '-SELFTEST';
  IF assessment_row.id IS NOT NULL THEN
    IF assessment_row.lesson_id IS DISTINCT FROM lesson_row.id
       OR assessment_row.title IS DISTINCT FROM 'اختبر نفسك'
       OR assessment_row.instructions IS NOT NULL
       OR assessment_row.sort_order IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: lesson_assessments %',
        external_lesson_code || '-SELFTEST' USING ERRCODE = '23514';
    END IF;
    v_assessment_id := assessment_row.id;
  ELSE
    INSERT INTO public.lesson_assessments(lesson_id, title, instructions, sort_order, assessment_code)
    VALUES (lesson_row.id, 'اختبر نفسك', NULL, 0, external_lesson_code || '-SELFTEST')
    RETURNING id INTO v_assessment_id;
    GET DIAGNOSTICS rc = ROW_COUNT;
    domain_writes := domain_writes + rc;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(question_json->'questions','[]'::jsonb)) LOOP
    question_code := external_lesson_code || '-SELF-' || (item->>'id');
    expected_type := coalesce(item->>'type','multiple_choice');
    expected_options := coalesce(item->'options','[]'::jsonb);
    expected_interaction := expected_type;
    expected_grading := 'AUTO_SINGLE';
    IF (SELECT count(*) FROM public.questions WHERE code = question_code) > 1 THEN
      RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate questions %', question_code
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO question_row FROM public.questions WHERE code = question_code;
    IF question_row.id IS NULL THEN
      INSERT INTO public.questions(lesson_id, subject_id, question_text, options, correct_index,
                                   question_type, sort_order, code, created_by)
      VALUES (lesson_row.id, subject_row.id, item->>'question',
              expected_options, -1, expected_type, questions_written, question_code, _actor_id)
      RETURNING * INTO question_row;
      GET DIAGNOSTICS rc = ROW_COUNT;
      questions_written := questions_written + rc;
      domain_writes := domain_writes + rc;

      INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                            grading_mode, question_text, max_score, allow_partial,
                                            requires_media, manual_grading_required,
                                            payload_hash_version, source_payload_hash, created_by)
      VALUES (question_row.id, 1, 'DRAFT', expected_interaction, expected_grading,
              item->>'question', 1, false, false, false, 'canonical_payload_v1',
              payloads->'selfTest'->>'sha256', _actor_id)
      RETURNING id INTO v_revision_id;
      GET DIAGNOSTICS rc = ROW_COUNT;
      domain_writes := domain_writes + rc;

      opt_index := 0;
      FOR opt IN SELECT value FROM jsonb_array_elements(expected_options) LOOP
        INSERT INTO public.question_options(question_revision_id, option_code, body, sort_order, is_correct)
        VALUES (v_revision_id, chr(97 + opt_index), coalesce(opt->>'body', opt#>>'{}'), opt_index, false);
        GET DIAGNOSTICS rc = ROW_COUNT;
        opt_index := opt_index + 1;
        options_written := options_written + rc;
        domain_writes := domain_writes + rc;
      END LOOP;

      INSERT INTO public.question_targets(question_id, revision_id, target_type, subject_id,
                                          lesson_id, is_primary, created_by)
      VALUES (question_row.id, v_revision_id, 'LESSON', subject_row.id, lesson_row.id, true, _actor_id);
      GET DIAGNOSTICS rc = ROW_COUNT;
      targets_written := targets_written + rc;
      domain_writes := domain_writes + rc;

      UPDATE public.question_revisions
         SET payload_hash = public._qb_compute_revision_payload_hash(v_revision_id),
             payload_hash_version = 'canonical_payload_v1'
       WHERE id = v_revision_id;
      GET DIAGNOSTICS rc = ROW_COUNT;
      hash_updates := hash_updates + rc;
    ELSE
      IF question_row.lesson_id IS DISTINCT FROM lesson_row.id
         OR question_row.subject_id IS DISTINCT FROM subject_row.id
         OR question_row.code IS DISTINCT FROM question_code
         OR question_row.question_type IS DISTINCT FROM expected_type
         OR question_row.correct_index IS DISTINCT FROM -1 THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: questions %', question_code USING ERRCODE = '23514';
      END IF;
      IF coalesce(question_row.options,'[]'::jsonb) IS DISTINCT FROM expected_options
         OR public.cf10_text_sha256(question_row.question_text)
            IS DISTINCT FROM public.cf10_text_sha256(item->>'question') THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: questions %', question_code USING ERRCODE = '23514';
      END IF;
      IF (SELECT count(*) FROM public.question_revisions
           WHERE question_id = question_row.id) <> 1 THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_revisions %', question_code
          USING ERRCODE = '23514';
      END IF;
      SELECT * INTO revision_row FROM public.question_revisions
       WHERE question_id = question_row.id AND status = 'DRAFT';
      IF revision_row.id IS NULL THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      IF revision_row.revision_number IS DISTINCT FROM 1
         OR revision_row.status IS DISTINCT FROM 'DRAFT'
         OR revision_row.interaction_type IS DISTINCT FROM expected_interaction
         OR revision_row.grading_mode IS DISTINCT FROM expected_grading
         OR revision_row.question_text IS DISTINCT FROM item->>'question'
         OR revision_row.source_payload_hash IS DISTINCT FROM (payloads->'selfTest'->>'sha256')
         OR revision_row.payload_hash_version IS DISTINCT FROM 'canonical_payload_v1'
         OR revision_row.payload_hash IS DISTINCT FROM public._qb_compute_revision_payload_hash(revision_row.id) THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      v_revision_id := revision_row.id;
      IF (SELECT count(*) FROM public.question_options WHERE question_revision_id = v_revision_id)
         IS DISTINCT FROM jsonb_array_length(expected_options) THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_options %', question_code USING ERRCODE = '23514';
      END IF;
      SELECT count(DISTINCT o.sort_order) INTO dup_count
        FROM public.question_options o WHERE o.question_revision_id = v_revision_id;
      IF dup_count IS DISTINCT FROM jsonb_array_length(expected_options) THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate question_options %', question_code
          USING ERRCODE = '23514';
      END IF;
      opt_index := 0;
      FOR opt IN SELECT value FROM jsonb_array_elements(expected_options) LOOP
        IF NOT EXISTS (SELECT 1 FROM public.question_options o
                        WHERE o.question_revision_id = v_revision_id
                          AND o.sort_order = opt_index
                          AND o.option_code = chr(97 + opt_index)
                          AND o.body = coalesce(opt->>'body', opt#>>'{}')
                          AND o.is_correct = false) THEN
          RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_options %', question_code USING ERRCODE = '23514';
        END IF;
        opt_index := opt_index + 1;
      END LOOP;
      IF (SELECT count(*) FROM public.question_targets WHERE revision_id = v_revision_id) <> 1 THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_targets %', question_code
          USING ERRCODE = '23514';
      END IF;
      SELECT * INTO target_row FROM public.question_targets
       WHERE question_id = question_row.id AND revision_id = v_revision_id AND target_type = 'LESSON';
      IF target_row.id IS NULL
         OR target_row.subject_id IS DISTINCT FROM subject_row.id
         OR target_row.lesson_id IS DISTINCT FROM lesson_row.id
         OR target_row.is_primary IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_targets %', question_code USING ERRCODE = '23514';
      END IF;
    END IF;

    SELECT value INTO answer FROM jsonb_array_elements(coalesce((companion->>'body')::jsonb->'answers','[]'::jsonb))
      WHERE value->>'question_id' = (item->>'id');
    IF answer IS NOT NULL AND v_revision_id IS NOT NULL THEN
      IF (SELECT count(*) FROM public.official_question_answers
           WHERE question_id = question_row.id) > 1 THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate official_question_answers %', question_code
          USING ERRCODE = '23514';
      END IF;
      SELECT * INTO answer_row FROM public.official_question_answers
       WHERE question_id = question_row.id AND revision_id = v_revision_id;
      IF answer_row.id IS NULL THEN
        INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)
        VALUES (question_row.id, v_revision_id, answer->>'correct_option', answer->>'rationale');
        GET DIAGNOSTICS rc = ROW_COUNT;
        answers_written := answers_written + rc;
        domain_writes := domain_writes + rc;
      ELSIF answer_row.model_answer IS DISTINCT FROM (answer->>'correct_option')
         OR answer_row.explanation IS DISTINCT FROM (answer->>'rationale') THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: official_question_answers %', question_code USING ERRCODE = '23514';
      END IF;

      option_code := regexp_replace(lower(coalesce(answer->>'correct_option','')),'[^a-z]','','g');
      IF answer->>'rationale' IS NOT NULL AND option_code <> '' THEN
        IF (SELECT count(*) FROM public.question_option_rationales
             WHERE question_revision_id = v_revision_id
               AND option_id IS DISTINCT FROM option_code) > 0 THEN
          RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_option_rationales %', question_code
            USING ERRCODE = '23514';
        END IF;
        IF (SELECT count(*) FROM public.question_option_rationales
             WHERE question_revision_id = v_revision_id AND option_id = option_code) > 1 THEN
          RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate question_option_rationales %', question_code
            USING ERRCODE = '23514';
        END IF;
        SELECT * INTO rationale_row FROM public.question_option_rationales
         WHERE question_revision_id = v_revision_id AND option_id = option_code;
        IF rationale_row.id IS NULL THEN
          INSERT INTO public.question_option_rationales(question_id, question_revision_id, option_id,
                                                        why_correct, why_wrong)
          VALUES (question_row.id, v_revision_id, option_code, answer->>'rationale', NULL);
          GET DIAGNOSTICS rc = ROW_COUNT;
          rationales_written := rationales_written + rc;
          domain_writes := domain_writes + rc;
        ELSIF rationale_row.question_id IS DISTINCT FROM question_row.id
           OR rationale_row.why_correct IS DISTINCT FROM (answer->>'rationale')
           OR rationale_row.why_wrong IS NOT NULL THEN
          RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: question_option_rationales %', question_code USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
  END LOOP;
  END IF;


  -- Lifecycle: the exact staged capability set, DRAFT only. No REVIEW / READY / publish.
  --      Applicability is copied verbatim from the staged entry (REQUIRED / OPTIONAL / NA);
  --      CF10 never hard-codes REQUIRED, because profiles such as GOLDEN_CHEMISTRY_V1 legitimately
  --      declare capabilities like labExperimentHtml OPTIONAL.
  FOR cap, lifecycle_cap, expected_applicability IN
    SELECT capability, lifecycle_capability, applicability
      FROM public.golden_lesson_domain_stage_entries
     WHERE batch_id = _batch_id ORDER BY capability LOOP
    IF expected_applicability = 'NA' AND (payloads->cap->>'text') IS NOT NULL THEN
      RAISE EXCEPTION 'CF10_LIFECYCLE_CONFLICT: NA capability % carries a payload', cap
        USING ERRCODE = '23514';
    END IF;
    IF (SELECT count(*) FROM public.lesson_capability_lifecycle
         WHERE lesson_id = lesson_row.id AND capability = lifecycle_cap) > 1 THEN
      RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lesson_capability_lifecycle %', lifecycle_cap
        USING ERRCODE = '23514';
    END IF;
    SELECT status, applicability::text, draft_hash
      INTO existing_status, existing_applicability, existing_draft_hash
      FROM public.lesson_capability_lifecycle
     WHERE lesson_id = lesson_row.id AND capability = lifecycle_cap;
    IF existing_status IS NOT NULL AND (
         existing_status IS DISTINCT FROM 'DRAFT'
      OR existing_applicability IS DISTINCT FROM expected_applicability
      OR existing_draft_hash IS DISTINCT FROM (payloads->cap->>'sha256')) THEN
      RAISE EXCEPTION 'CF10_LIFECYCLE_CONFLICT: %', lifecycle_cap USING ERRCODE = '23514';
    END IF;
    IF existing_status IS NULL THEN
      INSERT INTO public.lesson_capability_lifecycle(lesson_id, capability, status, applicability,
                                                     draft_hash, draft_updated_at)
      VALUES (lesson_row.id, lifecycle_cap, 'DRAFT', expected_applicability::public.capability_applicability,
              payloads->cap->>'sha256', now());
      GET DIAGNOSTICS rc = ROW_COUNT;
      lifecycle_written := lifecycle_written + rc;
      domain_writes := domain_writes + rc;
    END IF;
  END LOOP;

  -- The exact staged capability set (7 for the golden profiles) must all carry a DRAFT lifecycle
  -- row for this lesson. This pins the staged set, NOT an applicability distribution.
  IF (SELECT count(*) FROM public.lesson_capability_lifecycle l
       JOIN public.golden_lesson_domain_stage_entries e
         ON e.lifecycle_capability = l.capability AND e.batch_id = _batch_id
      WHERE l.lesson_id = lesson_row.id AND l.status = 'DRAFT')
     <> (SELECT count(*) FROM public.golden_lesson_domain_stage_entries WHERE batch_id = _batch_id) THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_STAGED_SET_INVALID' USING ERRCODE = '23514';
  END IF;

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
  IF EXISTS (
    SELECT 1 FROM public.question_revisions r
      JOIN public.questions q ON q.id = r.question_id
     WHERE q.lesson_id = lesson_row.id AND r.status <> 'DRAFT') THEN
    RAISE EXCEPTION 'CF10_REVISION_MUST_STAY_DRAFT' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.questions
              WHERE lesson_id = lesson_row.id AND current_published_revision_id IS NOT NULL) THEN
    RAISE EXCEPTION 'CF10_PUBLISHED_POINTER_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle
              WHERE lesson_id = lesson_row.id AND status <> 'DRAFT') THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_MUST_STAY_DRAFT' USING ERRCODE = '23514';
  END IF;
  -- R4: the materialized lesson must be invisible to students at the end of EXECUTE.
  IF public.lesson_student_visible(lesson_row.id) THEN
    RAISE EXCEPTION 'CF10_STUDENT_VISIBILITY_LEAK' USING ERRCODE = '23514';
  END IF;

  -- R4c: CF10 stages the mindMap / simulation HTML only TEMPORARILY. Until CF11 publishes the
  -- HTML asset, CF10 must not claim those capabilities are READY nor that their V3 snapshot is
  -- valid. The staged body must exist and be internally addressable (so nothing is invented and
  -- nothing is lost), but the capability stays DRAFT + pending.
  FOREACH cap IN ARRAY ARRAY['mindMap','simulation'] LOOP
    IF EXISTS (SELECT 1 FROM public.lesson_resources r
                WHERE r.lesson_id = lesson_row.id
                  AND r.resource_code IN (external_lesson_code || '-MINDMAP',
                                          external_lesson_code || '-EXPERIMENT')
                  AND ((cap = 'mindMap' AND r.resource_type::text = 'mindmap')
                    OR (cap = 'simulation' AND r.resource_type::text = 'experiment'))) THEN
      -- the staged body must be non-empty and addressed through the internal (unpublished) path
      IF NOT EXISTS (SELECT 1 FROM public.lesson_resources r
                      WHERE r.lesson_id = lesson_row.id
                        AND ((cap = 'mindMap' AND r.resource_type::text = 'mindmap')
                          OR (cap = 'simulation' AND r.resource_type::text = 'experiment'))
                        AND r.html_resource_type IS NOT NULL
                        AND coalesce(btrim(r.description),'') <> ''
                        AND r.url LIKE 'lesson-internal://html/%') THEN
        RAISE EXCEPTION 'CF10_HTML_STAGE_INVALID: %', cap USING ERRCODE = '23514';
      END IF;
      -- and it must still be pending CF11 publication: CF10 never stamps cf11_published_at
      IF NOT public.cf10_html_publication_pending(lesson_row.id, cap) THEN
        RAISE EXCEPTION 'CF10_HTML_PUBLICATION_CLAIMED: %', cap USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle lc
                  WHERE lc.lesson_id = lesson_row.id AND lc.capability = cap
                    AND lc.status <> 'DRAFT') THEN
        RAISE EXCEPTION 'CF10_HTML_CAPABILITY_READY_TOO_EARLY: %', cap USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  seed_state_sha := public.cf10_seed_state_sha256(lesson_row.id);

  INSERT INTO public.golden_lesson_domain_materializations(
    batch_id, binding_id, subject_id, lesson_id, lesson_created, idempotency_key,
    write_plan, write_plan_sha256, result, materialized_by)
  VALUES (_batch_id, binding.id, subject_row.id, lesson_row.id, lesson_created,
          btrim(_idempotency_key), plan, plan_sha,
          jsonb_build_object('mode','EXECUTE','lesson_id',lesson_row.id,'subject_id',subject_row.id,
            'lesson_created',lesson_created,'questions',questions_written,'options',options_written,
            'answers',answers_written,
            'rationales',rationales_written,'targets',targets_written,'lifecycle_rows',lifecycle_written,
            'revision_status','DRAFT','assessment_membership_deferred',true,
            'write_plan_sha256',plan_sha,'answer_leak',0,'published',false,'ready',false,
            'student_visible',false,'seed_sha256',seed_state_sha,
            'attested_scope','immutable_seed',
            'html_publication_pending', jsonb_build_object(
              'mindMap', public.cf10_html_publication_pending(lesson_row.id,'mindMap'),
              'simulation', public.cf10_html_publication_pending(lesson_row.id,'simulation'))),
          _actor_id)
  RETURNING * INTO replay;
  GET DIAGNOSTICS rc = ROW_COUNT;
  ledger_writes := ledger_writes + rc;

  RETURN replay.result || jsonb_build_object('idempotent',false,
    'writes_performed',domain_writes,
    'domain_writes_performed',domain_writes,
    'payload_hash_updates',hash_updates,
    'ledger_writes',ledger_writes);
END;
$$;

REVOKE ALL ON FUNCTION public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.cf10_assert_no_answer_leak(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_assert_no_answer_leak(text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cf10_text_sha256(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_text_sha256(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cf10_inline_html_url(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_inline_html_url(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cf10_seed_state_sha256(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cf10_seed_state_sha256(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cf10_html_publication_pending(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_html_publication_pending(uuid,text) TO authenticated, service_role;

-- CF10-R4c: mindMap / simulation can never reach READY while their HTML is still the temporary
-- CF10 stage. Only CF11 (which stamps metadata->>'cf11_published_at') unlocks that transition.
CREATE OR REPLACE FUNCTION public.cf10_block_ready_before_html_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'READY' AND NEW.capability IN ('mindMap','simulation')
     AND public.cf10_html_publication_pending(NEW.lesson_id, NEW.capability) THEN
    RAISE EXCEPTION 'CF10_HTML_CAPABILITY_READY_TOO_EARLY: %', NEW.capability USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cf10_block_ready_before_html_publication
  ON public.lesson_capability_lifecycle;
CREATE TRIGGER trg_cf10_block_ready_before_html_publication
  BEFORE INSERT OR UPDATE ON public.lesson_capability_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.cf10_block_ready_before_html_publication();
REVOKE ALL ON FUNCTION public.cf10_required_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_required_capabilities() TO authenticated, service_role;

COMMENT ON TABLE public.golden_lesson_domain_materializations IS
  'Immutable CF10 ledger: one atomic DRAFT-only materialization per verified staged batch; never publishes, never deletes, never creates subjects.';

-- ---------------------------------------------------------------------------
-- CF10-R4 — server-side student visibility gate (all-REQUIRED-READY).
-- A lesson becomes "editorially managed" the moment CF10 (or the 20C workflow)
-- creates lifecycle rows or a materialization ledger row for it. A managed lesson
-- stays completely invisible to students until EVERY REQUIRED capability is READY.
-- NA / OPTIONAL rows never block. Legacy lessons with no lifecycle/ledger evidence
-- keep their pre-CF10 behaviour: nothing is silently hidden.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lesson_is_editorially_managed(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle l WHERE l.lesson_id = _lesson_id)
      OR EXISTS (SELECT 1 FROM public.golden_lesson_domain_materializations m WHERE m.lesson_id = _lesson_id);
$$;

CREATE OR REPLACE FUNCTION public.lesson_student_visible(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN NOT public.lesson_is_editorially_managed(_lesson_id) THEN true
    ELSE EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle l
                  WHERE l.lesson_id = _lesson_id AND l.applicability = 'REQUIRED')
     AND NOT EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle l
                      WHERE l.lesson_id = _lesson_id
                        AND l.applicability = 'REQUIRED'
                        AND l.status IS DISTINCT FROM 'READY')
  END;
$$;

-- Single-lesson gate for the lesson page (never exposes draft content itself).
CREATE OR REPLACE FUNCTION public.lesson_student_content_gate(_lesson_id uuid)
RETURNS TABLE(lesson_id uuid, managed boolean, visible boolean, ready_capabilities text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _lesson_id,
         public.lesson_is_editorially_managed(_lesson_id),
         public.lesson_student_visible(_lesson_id),
         CASE WHEN public.lesson_student_visible(_lesson_id)
              THEN COALESCE((SELECT array_agg(l.capability ORDER BY l.capability)
                               FROM public.lesson_capability_lifecycle l
                              WHERE l.lesson_id = _lesson_id AND l.status = 'READY'), ARRAY[]::text[])
              ELSE ARRAY[]::text[] END;
$$;

-- Batch gate for subject lesson lists.
CREATE OR REPLACE FUNCTION public.lessons_student_visible(_lesson_ids uuid[])
RETURNS TABLE(lesson_id uuid, managed boolean, visible boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT x.id,
         public.lesson_is_editorially_managed(x.id),
         public.lesson_student_visible(x.id)
    FROM unnest(coalesce(_lesson_ids, ARRAY[]::uuid[])) AS x(id);
$$;

-- RLS enforcement: every lesson-scoped read policy already routes through
-- can_access_lesson, so the gate is applied once, server-side, for everybody
-- except content staff (who must still see their drafts).
CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lessons l
       WHERE l.id = _lesson_id AND public.can_access_subject(l.subject_id)
    )
    AND (public.is_content_staff(auth.uid()) OR public.lesson_student_visible(_lesson_id))
$$;

REVOKE ALL ON FUNCTION public.lesson_is_editorially_managed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lesson_student_visible(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lesson_student_content_gate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lessons_student_visible(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_is_editorially_managed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lesson_student_visible(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lesson_student_content_gate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lessons_student_visible(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.lesson_student_content_gate(uuid) IS
  'CF10-R4 student visibility gate: a managed lesson stays hidden until every REQUIRED capability is READY.';
