-- CF10 retry idempotency: normalize explanation_code lookups/insert to match
-- normalize_lesson_explanation_code() trigger (lowercase). Forward-only, no data writes.
CREATE OR REPLACE FUNCTION public.golden_lesson_materialize_domain_batch(_batch_id uuid, _actor_id uuid, _mode text DEFAULT 'DRY_RUN'::text, _expected_plan_sha256 text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  semester_raw text;
  semester_status text;
  semester_resolved boolean := false;
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
  html_deferred jsonb := '{}'::jsonb;
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
  -- R5: identity is never invented. Fields CF10 writes verbatim must be present; the
  -- semester is honoured as DECLARED by the manifest, including an explicit unresolved state.
  IF coalesce(btrim(ident->>'subjectCode'),'') = ''
     OR coalesce(btrim(ident->>'lessonSlug'),'') = ''
     OR coalesce(btrim(ident->>'lessonCode'),'') = '' THEN
    RAISE EXCEPTION 'CF10_IDENTITY_MANIFEST_INCOMPLETE' USING ERRCODE = '22023';
  END IF;
  external_lesson_code := btrim(ident->>'lessonCode');
  expected_title := coalesce(nullif(btrim(coalesce(ident->>'lessonTitle','')),''), btrim(ident->>'lessonSlug'));

  -- Semester contract (R5.1):
  --   * pinned 1|2                      -> lessons.semester must equal it
  --   * PENDING / UNRESOLVED / absent   -> lessons.semester must be NULL (never invented)
  --   * a declared status contradicting a pinned value -> hard failure
  semester_raw := nullif(btrim(coalesce(ident->>'semester','')),'');
  semester_status := upper(nullif(btrim(coalesce(ident->>'semesterStatus','')),''));
  IF semester_raw IS NOT NULL AND upper(semester_raw) IN ('PENDING','UNRESOLVED','NULL','NONE') THEN
    semester_status := coalesce(semester_status, upper(semester_raw));
    semester_raw := NULL;
  END IF;
  IF semester_status IS NOT NULL AND semester_status NOT IN ('PENDING','UNRESOLVED','RESOLVED','PINNED') THEN
    RAISE EXCEPTION 'CF10_IDENTITY_SEMESTER_STATUS_INVALID: %', semester_status USING ERRCODE = '22023';
  END IF;
  IF semester_raw IS NULL THEN
    IF semester_status IN ('RESOLVED','PINNED') THEN
      RAISE EXCEPTION 'CF10_IDENTITY_SEMESTER_CONFLICT: resolved status without value' USING ERRCODE = '23514';
    END IF;
    semester_resolved := false;
    expected_semester := NULL;
  ELSE
    IF semester_raw !~ '^[12]$' THEN
      RAISE EXCEPTION 'CF10_IDENTITY_SEMESTER_INVALID: %', semester_raw USING ERRCODE = '22023';
    END IF;
    IF semester_status IN ('PENDING','UNRESOLVED') THEN
      RAISE EXCEPTION 'CF10_IDENTITY_SEMESTER_CONFLICT: % declared pending', semester_raw USING ERRCODE = '23514';
    END IF;
    semester_resolved := true;
    expected_semester := semester_raw::integer;
  END IF;
  expected_sort := coalesce((ident->>'sortOrder')::integer, 0);

  -- R5.2 / R5.4: binding resolution first. CF10 runs AFTER CF09, so in EXECUTE there must be
  -- exactly one authoritative binding for this batch; subject identity comes from that binding.
  SELECT count(*) INTO binding_count
    FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
  IF binding_count > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_BINDING_AMBIGUOUS' USING ERRCODE = '23514';
  END IF;
  IF binding_count = 0 AND _mode = 'EXECUTE' THEN
    RAISE EXCEPTION 'CF10_IDENTITY_BINDING_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF binding_count = 1 THEN
    SELECT * INTO binding FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
    -- Subject is authoritative from the binding; the manifest code must still match the CURRENT
    -- subject code (a stale code in the manifest is a conflict, never a silent remap).
    SELECT * INTO subject_row FROM public.subjects WHERE id = binding.subject_id;
    IF subject_row.id IS NULL THEN
      RAISE EXCEPTION 'CF10_IDENTITY_BINDING_SUBJECT_MISSING' USING ERRCODE = '23514';
    END IF;
    IF lower(btrim(subject_row.code)) IS DISTINCT FROM lower(btrim(ident->>'subjectCode')) THEN
      RAISE EXCEPTION 'CF10_IDENTITY_BINDING_SUBJECT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF btrim(binding.external_lesson_code) IS DISTINCT FROM external_lesson_code THEN
      RAISE EXCEPTION 'CF10_IDENTITY_BINDING_CODE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- DRY_RUN / fixture path only: resolve the subject by its current code, exactly one row.
    IF (SELECT count(*) FROM public.subjects
         WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'))) <> 1 THEN
      RAISE EXCEPTION 'CF10_SUBJECT_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO subject_row FROM public.subjects
     WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'));
  END IF;

  IF (SELECT count(*) FROM public.lessons
       WHERE subject_id = subject_row.id
         AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'))) > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lessons for slug %', ident->>'lessonSlug'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO lesson_row FROM public.lessons
   WHERE subject_id = subject_row.id AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'));
  IF binding_count = 1 THEN
    IF binding.lesson_id IS NULL THEN
      RAISE EXCEPTION 'CF10_IDENTITY_BINDING_LESSON_MISSING' USING ERRCODE = '23514';
    END IF;
    IF lesson_row.id IS NOT NULL AND binding.lesson_id IS DISTINCT FROM lesson_row.id THEN
      RAISE EXCEPTION 'CF10_IDENTITY_BINDING_LESSON_MISMATCH' USING ERRCODE = '23514';
    END IF;
    -- R5.3: CF09 binds an EXISTING lesson shell. A bound EXECUTE never creates a lesson.
    IF lesson_row.id IS NULL AND _mode = 'EXECUTE' THEN
      RAISE EXCEPTION 'CF10_IDENTITY_BINDING_LESSON_MISMATCH: bound lesson not resolvable by identity'
        USING ERRCODE = '23514';
    END IF;
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
       AND encode(extensions.digest(entry.source_payload,'sha256'),'hex') IS DISTINCT FROM entry.source_sha256 THEN
      RAISE EXCEPTION 'CF10_PAYLOAD_HASH_MISMATCH: %', entry.capability USING ERRCODE = '23514';
    END IF;
    PERFORM public.cf10_assert_no_answer_leak(entry.capability, payload_text);
    payloads := payloads || jsonb_build_object(entry.capability,
      jsonb_build_object('sha256', entry.source_sha256, 'text', payload_text,
                         'applicability', entry.applicability));
    plan := plan || jsonb_build_array(jsonb_build_object(
      'capability', entry.capability, 'targetPlan', entry.target_plan,
      'lifecycleCapability', entry.lifecycle_capability,
      'applicability', entry.applicability, 'sha256', entry.source_sha256,
      -- R6: HTML capabilities are staged only; CF11 owns their domain artefacts.
      'deferredToCf11', entry.capability IN ('mindMapHtml','labExperimentHtml')));
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
    'semester', to_jsonb(expected_semester),
    'semesterResolved', semester_resolved,
    'verifiedBundleSha256', batch.verified_bundle_sha256,
    'answerCompanionSha256', companion->>'companion_sha256',
    'entries', plan,
    'lifecycleTarget', jsonb_build_object('status','DRAFT','applicability','AS_STAGED','capabilities',7),
    'revisionTarget', jsonb_build_object('status','DRAFT','payloadHashVersion','canonical_payload_v1',
                                         'publishedPointer',false,'assessmentMembership',false),
    'visibilityTarget', jsonb_build_object('studentVisible',false,'requiresAllRequiredReady',true,
                                           'hiddenWhileAnyPayloadCapabilityNotReady',true),
    'htmlTarget', jsonb_build_object('mindMap','DEFERRED_TO_CF11','simulation','DEFERRED_TO_CF11',
                                     'legacyLessonResourceWrite',false,'snapshot',false,'ready',false),
    'forbidden', jsonb_build_object('subjectCreate',false,'delete',false,'storage',false,
                                    'publish',false,'ready',false,'htmlResourceWrite',false));

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
       OR replay.binding_id IS NULL
       OR replay.binding_id IS DISTINCT FROM binding.id
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
    -- Visibility stays fail-closed on replay: any capability that carries a materialized payload
    -- (draft_hash) and is not READY must keep the lesson hidden, REQUIRED or OPTIONAL alike.
    IF public.lesson_student_visible(replay.lesson_id)
       AND EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle lc
                    WHERE lc.lesson_id = replay.lesson_id
                      AND (lc.applicability = 'REQUIRED' OR lc.draft_hash IS NOT NULL)
                      AND lc.status IS DISTINCT FROM 'READY') THEN
      RAISE EXCEPTION 'CF10_STUDENT_VISIBILITY_LEAK' USING ERRCODE = '23514';
    END IF;

    RETURN replay.result || jsonb_build_object('idempotent',true,'writes_performed',0,
      'domain_writes_performed',0,'payload_hash_updates',0,'ledger_writes',0,
      'ledger_attested',true,
      -- R6: a ledger shortcut never claims the whole live state was attested. Only the
      -- immutable seed is re-hashed here; mutable workflow fields are explicitly out of scope.
      'live_attested',false,
      'seed_attested',true,
      'attested_scope','immutable_seed',
      'mutable_fields_allowed', jsonb_build_array(
        'lesson_capability_lifecycle.status','lesson_capability_lifecycle.draft_hash',
        'question_revisions.status','question_revisions(additional)',
        'questions.current_published_revision_id',
        'lesson_resources(entire table, CF11-owned)',
        'lessons.unit_id','lessons.is_free','lessons.sort_order',
        'assessment_questions(membership)'),
      'html_publication_pending', jsonb_build_object(
        'mindMap', public.cf10_html_publication_pending(replay.lesson_id,'mindMap'),
        'simulation', public.cf10_html_publication_pending(replay.lesson_id,'simulation')));
  END IF;

  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF10_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  -- Lesson identity is authoritative from the CF09 binding. A bound EXECUTE targets an
  -- existing lesson shell and must never overwrite or reject its operational metadata
  -- (title, unit placement, free flag, semester or sort order). Identity remains strict:
  -- binding.lesson_id, subject_id and slug were all verified above.
  IF lesson_row.id IS NULL THEN
    INSERT INTO public.lessons(subject_id, slug, title, unit_id, is_free, semester, sort_order)
    VALUES (subject_row.id, btrim(ident->>'lessonSlug'), expected_title,
            NULL, true, expected_semester, expected_sort)
    RETURNING * INTO lesson_row;
    GET DIAGNOSTICS rc = ROW_COUNT;
    lesson_created := true;
    domain_writes := domain_writes + rc;
  ELSIF binding_count = 0 THEN
    -- Unbound DRY_RUN / fixture compatibility keeps the legacy exact-match assertion.
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
       WHERE lesson_id = lesson_row.id AND explanation_code = public.normalize_content_code(external_lesson_code || '-EXP')) > 1 THEN
    RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: duplicate lesson_explanations' USING ERRCODE = '23514';
  END IF;
  SELECT public.cf10_text_sha256(content) INTO existing_hash
    FROM public.lesson_explanations
   WHERE lesson_id = lesson_row.id AND explanation_code = public.normalize_content_code(external_lesson_code || '-EXP');
  IF existing_hash IS NULL THEN
    INSERT INTO public.lesson_explanations(lesson_id, title, content, sort_order, explanation_code)
    VALUES (lesson_row.id, 'شرح تمكين', payload_text, 0, public.normalize_content_code(external_lesson_code || '-EXP'));
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

  -- 4/5) mindMapHtml + labExperimentHtml -> DEFERRED TO CF11 (R6).
  --      CF10 writes NOTHING for them: no lesson_resources row, no inline body, no url.
  --      The bytes / sha256 / provenance already live in the staff-only stage entries and are
  --      re-verified above; here we only prove that no legacy row was (or is being) created and
  --      record deferred_to_cf11 = true. CF11 owns version + private storage + preview + publish.
  FOREACH cap IN ARRAY ARRAY['mindMapHtml','labExperimentHtml'] LOOP
    payload_text := payloads->cap->>'text';
    CONTINUE WHEN payload_text IS NULL;
    option_code := CASE cap WHEN 'mindMapHtml' THEN external_lesson_code || '-MINDMAP'
                            ELSE external_lesson_code || '-EXPERIMENT' END;
    expected_resource_type := CASE cap WHEN 'mindMapHtml' THEN 'mindmap' ELSE 'experiment' END;
    -- Legacy inline rows are forbidden: an unpublished HTML body must never sit in
    -- lesson_resources.description. R7: no metadata marker can exempt such a row.
    IF EXISTS (SELECT 1 FROM public.lesson_resources r
                WHERE r.lesson_id = lesson_row.id
                  AND (r.resource_code = option_code
                    OR r.resource_type::text = expected_resource_type)) THEN
      RAISE EXCEPTION 'CF10_HTML_LEGACY_ROW_FORBIDDEN: %', cap USING ERRCODE = '23514';
    END IF;
    -- The staged bytes must still be intact and staff-only in CF08 staging.
    IF NOT EXISTS (SELECT 1 FROM public.golden_lesson_domain_stage_entries e
                    WHERE e.batch_id = _batch_id AND e.capability = cap
                      AND e.source_payload IS NOT NULL
                      AND e.source_sha256 = (payloads->cap->>'sha256')) THEN
      RAISE EXCEPTION 'CF10_HTML_STAGE_INVALID: %', cap USING ERRCODE = '23514';
    END IF;
    html_deferred := html_deferred || jsonb_build_object(
      CASE cap WHEN 'mindMapHtml' THEN 'mindMap' ELSE 'simulation' END,
      jsonb_build_object('deferred_to_cf11',true,'owner','CF11',
                         'sha256', payloads->cap->>'sha256',
                         'resourceCode', option_code,
                         'domainRowsWritten',0,'snapshot',null,'ready',false));
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
      VALUES (lesson_row.id, subject_row.id, public.cf10_question_text(item),
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
              expected_grading, public.cf10_question_text(item), 1, false, false, true,
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
         OR question_row.question_text IS DISTINCT FROM public.cf10_question_text(item) THEN
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
         OR revision_row.question_text IS DISTINCT FROM public.cf10_question_text(item)
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
      VALUES (lesson_row.id, subject_row.id, public.cf10_question_text(item),
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
              public.cf10_question_text(item), 1, false, false, false, 'canonical_payload_v1',
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
            IS DISTINCT FROM public.cf10_text_sha256(public.cf10_question_text(item)) THEN
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
         OR revision_row.question_text IS DISTINCT FROM public.cf10_question_text(item)
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

  -- R6 postcondition: CF10 leaves NO legacy lesson_resources row for mindMap / simulation,
  -- claims no snapshot and no READY for them; CF11 is the only producer of those artefacts.
  FOREACH cap IN ARRAY ARRAY['mindMap','simulation'] LOOP
    -- R7: ANY mindmap/experiment resource row is forbidden at the end of a CF10 batch — a
    -- `cf11_published_at` marker is not a trust signal while the CF11 schema does not exist.
    IF EXISTS (SELECT 1 FROM public.lesson_resources r
                WHERE r.lesson_id = lesson_row.id
                  AND ((cap = 'mindMap' AND r.resource_type::text = 'mindmap')
                    OR (cap = 'simulation' AND r.resource_type::text = 'experiment'))) THEN
      RAISE EXCEPTION 'CF10_HTML_LEGACY_ROW_FORBIDDEN: %', cap USING ERRCODE = '23514';
    END IF;
    IF NOT public.cf10_html_publication_pending(lesson_row.id, cap) THEN
      RAISE EXCEPTION 'CF10_HTML_PUBLICATION_CLAIMED: %', cap USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle lc
                WHERE lc.lesson_id = lesson_row.id AND lc.capability = cap
                  AND lc.status <> 'DRAFT') THEN
      RAISE EXCEPTION 'CF10_HTML_CAPABILITY_READY_TOO_EARLY: %', cap USING ERRCODE = '23514';
    END IF;
  END LOOP;
  -- and the lesson must still be invisible to students after the HTML deferral.
  IF public.lesson_student_visible(lesson_row.id) THEN
    RAISE EXCEPTION 'CF10_STUDENT_VISIBILITY_LEAK' USING ERRCODE = '23514';
  END IF;

  -- R5.2: the ledger never records a zero-binding EXECUTE.
  IF binding.id IS NULL THEN
    RAISE EXCEPTION 'CF10_IDENTITY_BINDING_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF lesson_created THEN
    RAISE EXCEPTION 'CF10_IDENTITY_BINDING_LESSON_MISMATCH: bound EXECUTE created a lesson'
      USING ERRCODE = '23514';
  END IF;

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
            'html_deferred_to_cf11', html_deferred,
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
$function$
