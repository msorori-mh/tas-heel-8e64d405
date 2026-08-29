CREATE OR REPLACE FUNCTION public.golden_lesson_publish_component(
  _batch_id uuid,
  _capability text,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid            uuid := auth.uid();
  entry          public.golden_lesson_domain_stage_entries;
  batch          public.golden_lesson_domain_stage_batches;
  binding        public.golden_lesson_identity_bindings;
  lesson_row     public.lessons;
  ext_code       text;
  lifecycle_cap  text;
  payload        text;
  contract       jsonb;
  v_resource_code text;
  v_assessment_id uuid;
  expected_codes text[];
  actual_codes   text[];
  publication_id uuid := gen_random_uuid();
  writes         integer := 0;
  rc             integer;
  q              record;
  snapshot       jsonb;
  snapshot_hash  text;
BEGIN
  -- 1) الصلاحية ----------------------------------------------------------------
  IF uid IS NULL OR NOT public.is_content_staff(uid) THEN
    RAISE EXCEPTION 'LCP_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO batch FROM public.golden_lesson_domain_stage_batches WHERE id = _batch_id;
  IF batch.id IS NULL THEN
    RAISE EXCEPTION 'LCP_BATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO entry
    FROM public.golden_lesson_domain_stage_entries
   WHERE batch_id = _batch_id AND capability = _capability;
  IF entry.id IS NULL THEN
    RAISE EXCEPTION 'LCP_CAPABILITY_UNKNOWN: %', _capability USING ERRCODE = '22023';
  END IF;
  IF entry.source_path IS NULL OR entry.source_payload IS NULL THEN
    RAISE EXCEPTION 'LCP_COMPONENT_NOT_IN_BATCH: %', _capability USING ERRCODE = '22023';
  END IF;
  lifecycle_cap := entry.lifecycle_capability;
  SELECT * INTO binding FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
  IF binding.id IS NULL OR binding.lesson_id IS NULL THEN
    RAISE EXCEPTION 'LCP_IDENTITY_BINDING_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO lesson_row FROM public.lessons WHERE id = binding.lesson_id;
  IF lesson_row.id IS NULL THEN
    RAISE EXCEPTION 'LCP_LESSON_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  ext_code := binding.external_lesson_code;
  IF NOT EXISTS (SELECT 1 FROM public.golden_lesson_domain_materializations
                  WHERE batch_id = _batch_id) THEN
    RAISE EXCEPTION 'LCP_NOT_MATERIALIZED' USING ERRCODE = '23514';
  END IF;
  payload := convert_from(entry.source_payload, 'UTF8');
  -- 2) السلامة ------------------------------------------------------------------
  PERFORM public.cf10_assert_no_answer_leak(_capability, payload);
  -- 3) ما يحتاجه الطالب لرؤية هذا المكوّن ----------------------------------------
  IF _capability = 'officialBookContent' THEN
    IF NOT EXISTS (SELECT 1 FROM public.lesson_book_contents WHERE lesson_id = lesson_row.id) THEN
      RAISE EXCEPTION 'LCP_DOMAIN_ROW_MISSING: lesson_book_contents' USING ERRCODE = '23514';
    END IF;
  ELSIF _capability = 'tamkeenExplanationHtml' THEN
    IF NOT EXISTS (SELECT 1 FROM public.lesson_explanations WHERE lesson_id = lesson_row.id) THEN
      RAISE EXCEPTION 'LCP_DOMAIN_ROW_MISSING: lesson_explanations' USING ERRCODE = '23514';
    END IF;
  ELSIF _capability = 'lessonSummaryHtml' THEN
    IF NOT EXISTS (SELECT 1 FROM public.lesson_summaries WHERE lesson_id = lesson_row.id) THEN
      RAISE EXCEPTION 'LCP_DOMAIN_ROW_MISSING: lesson_summaries' USING ERRCODE = '23514';
    END IF;
  ELSIF _capability IN ('mindMapHtml', 'labExperimentHtml') THEN
    contract := public.cf11_assert_interactive_contract(_capability, payload);
    v_resource_code := public.normalize_content_code(
      CASE _capability WHEN 'mindMapHtml' THEN ext_code || '-MINDMAP'
                       ELSE ext_code || '-EXPERIMENT' END);
    UPDATE public.lesson_resources
       SET description = payload,
           url = public.cf10_inline_html_url(v_resource_code),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'cf11_publication_id', publication_id,
             'cf11_published_at', now(),
             'cf11_published_by', uid,
             'cf11_body_sha256', public.cf11_text_sha256(payload),
             'cf11_render_mode', 'INTERACTIVE',
             'cf11_verified_bundle_sha256', batch.verified_bundle_sha256,
             'cf11_csp', contract)
     WHERE lesson_id = lesson_row.id AND resource_code = v_resource_code;
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
    IF rc = 0 THEN
      INSERT INTO public.lesson_resources(
        lesson_id, resource_type, title, url, description, sort_order,
        resource_code, html_resource_type, metadata, is_primary)
      VALUES (
        lesson_row.id,
        (CASE _capability WHEN 'mindMapHtml' THEN 'mindmap' ELSE 'experiment' END)
          ::public.lesson_resource_type,
        CASE _capability WHEN 'mindMapHtml' THEN 'الخريطة الذهنية' ELSE 'التجربة العملية' END,
        public.cf10_inline_html_url(v_resource_code),
        payload,
        CASE _capability WHEN 'mindMapHtml' THEN 4 ELSE 5 END,
        v_resource_code,
        'INTERACTIVE',
        jsonb_build_object(
          'cf11_publication_id', publication_id,
          'cf11_published_at', now(),
          'cf11_published_by', uid,
          'cf11_body_sha256', public.cf11_text_sha256(payload),
          'cf11_render_mode', 'INTERACTIVE',
          'cf11_verified_bundle_sha256', batch.verified_bundle_sha256,
          'cf11_csp', contract),
        false);
      GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
    END IF;
  ELSIF _capability IN ('officialBookQuestions', 'selfTest') THEN
    SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO expected_codes
      FROM (
        SELECT CASE _capability
                 WHEN 'officialBookQuestions'
                   THEN ext_code || '-OFFQ-' ||
                        coalesce(item->>'question_number', item->>'id')
                 ELSE ext_code || '-SELF-' || (item->>'id') END AS code
          FROM jsonb_array_elements(coalesce((payload::jsonb)->'questions', '[]'::jsonb)) AS item
      ) s;
    IF coalesce(array_length(expected_codes, 1), 0) = 0
       OR array_position(expected_codes, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'LCP_QUESTION_SET_INVALID: %', _capability USING ERRCODE = '23514';
    END IF;
    IF cardinality(expected_codes) <>
       cardinality(ARRAY(SELECT DISTINCT unnest(expected_codes))) THEN
      RAISE EXCEPTION 'LCP_QUESTION_CODES_DUPLICATED: %', _capability USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO actual_codes
      FROM public.questions
     WHERE lesson_id = lesson_row.id AND code = ANY (expected_codes);
    IF actual_codes IS DISTINCT FROM expected_codes THEN
      RAISE EXCEPTION 'LCP_QUESTION_SET_MISMATCH %: expected=[%] actual=[%]',
        _capability, array_to_string(expected_codes, ','), array_to_string(actual_codes, ',')
        USING ERRCODE = '23514';
    END IF;
    FOR q IN
      SELECT qq.id AS question_id, qq.code,
             (SELECT rv.id FROM public.question_revisions rv
               WHERE rv.question_id = qq.id
               ORDER BY rv.revision_number DESC LIMIT 1) AS revision_id
        FROM public.questions qq
       WHERE qq.lesson_id = lesson_row.id AND qq.code = ANY (expected_codes)
       ORDER BY qq.code
    LOOP
      IF q.revision_id IS NULL THEN
        RAISE EXCEPTION 'LCP_QUESTION_REVISION_MISSING: %', q.code USING ERRCODE = '23514';
      END IF;
      UPDATE public.question_revisions
         SET status = 'SUPERSEDED', superseded_at = coalesce(superseded_at, now())
       WHERE question_id = q.question_id AND id <> q.revision_id AND status = 'PUBLISHED';
      GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
      UPDATE public.question_revisions
         SET status = 'APPROVED',
             reviewed_at = coalesce(reviewed_at, now()),
             reviewed_by = coalesce(reviewed_by, uid)
       WHERE id = q.revision_id AND status IN ('DRAFT', 'READY_FOR_REVIEW');
      GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
      UPDATE public.question_revisions
         SET status = 'PUBLISHED',
             published_at = coalesce(published_at, now()),
             published_by = coalesce(published_by, uid)
       WHERE id = q.revision_id AND status = 'APPROVED';
      GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
      IF (SELECT status FROM public.question_revisions WHERE id = q.revision_id)
         <> 'PUBLISHED' THEN
        RAISE EXCEPTION 'LCP_QUESTION_NOT_PUBLISHED: %', q.code USING ERRCODE = '23514';
      END IF;
      UPDATE public.questions
         SET current_published_revision_id = q.revision_id
       WHERE id = q.question_id
         AND current_published_revision_id IS DISTINCT FROM q.revision_id;
      GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
    END LOOP;
    IF _capability = 'selfTest' THEN
      SELECT id INTO v_assessment_id FROM public.lesson_assessments
       WHERE lesson_id = lesson_row.id
         AND assessment_code = public.normalize_content_code(ext_code || '-SELFTEST');
      IF v_assessment_id IS NULL THEN
        RAISE EXCEPTION 'LCP_ASSESSMENT_SHELL_MISSING' USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.assessment_questions(assessment_id, question_id, sort_order, points)
      SELECT v_assessment_id, qq.id,
             row_number() OVER (ORDER BY qq.code) - 1, 1
        FROM public.questions qq
       WHERE qq.lesson_id = lesson_row.id AND qq.code = ANY (expected_codes)
         AND NOT EXISTS (SELECT 1 FROM public.assessment_questions aq
                          WHERE aq.assessment_id = v_assessment_id AND aq.question_id = qq.id);
      GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
    END IF;
  ELSE
    RAISE EXCEPTION 'LCP_CAPABILITY_UNKNOWN: %', _capability USING ERRCODE = '22023';
  END IF;
  -- 4) هذا المكوّن وحده يصبح مرئيًا -----------------------------------------------
  snapshot := jsonb_build_object(
    'capability', lifecycle_cap,
    'packageCapability', _capability,
    'batchId', _batch_id,
    'sourcePath', entry.source_path,
    'sourceSha256', entry.source_sha256,
    'publishedAt', now(),
    'publishedBy', uid);
  snapshot_hash := coalesce(entry.source_sha256, public.cf11_text_sha256(snapshot::text));
  UPDATE public.lesson_capability_lifecycle
     SET status = 'READY',
         draft_hash = NULL,
         reviewed_by = coalesce(reviewed_by, uid),
         reviewed_at = coalesce(reviewed_at, now()),
         ready_snapshot = snapshot,
         ready_hash = snapshot_hash,
         ready_by = uid,
         ready_at = now(),
         updated_at = now()
   WHERE lesson_id = lesson_row.id AND capability = lifecycle_cap;
  GET DIAGNOSTICS rc = ROW_COUNT;
  IF rc <> 1 THEN
    RAISE EXCEPTION 'LCP_LIFECYCLE_ROW_MISSING: %', lifecycle_cap USING ERRCODE = '23514';
  END IF;
  writes := writes + rc;
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'golden_lesson_publish_component', 'lesson_capability', lesson_row.id,
          jsonb_build_object('batchId', _batch_id, 'capability', _capability,
                             'lifecycleCapability', lifecycle_cap,
                             'idempotencyKey', btrim(coalesce(_idempotency_key, '')),
                             'writes', writes));
  RETURN jsonb_build_object(
    'lesson_id', lesson_row.id,
    'capability', _capability,
    'lifecycle_capability', lifecycle_cap,
    'status', 'READY',
    'writes_performed', writes,
    'student_can_see_this_component',
      public.lesson_capability_ready(lesson_row.id, lifecycle_cap));
END;
$function$;

COMMENT ON FUNCTION public.golden_lesson_publish_component(uuid, text, text) IS
'Publishes exactly one lesson component and makes it visible to students immediately. '
'Reads nothing and asserts nothing about the other six. Keeps the answer-leak and '
'interactive-HTML contracts, the CF09 identity binding and the verified byte hashes.';

REVOKE EXECUTE ON FUNCTION public.golden_lesson_publish_component(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golden_lesson_publish_component(uuid, text, text) TO authenticated;

DO $proof$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_publish_component';
  IF d IS NULL THEN
    RAISE EXCEPTION 'LCP_PROOF_FUNCTION_MISSING';
  END IF;
  IF position(E'''REVIEW''' in d) > 0 THEN
    RAISE EXCEPTION 'LCP_PROOF_STILL_HAS_REVIEW_STEP';
  END IF;
  IF position('SEPARATION_OF_DUTIES' in d) > 0 THEN
    RAISE EXCEPTION 'LCP_PROOF_STILL_SEPARATES_DUTIES';
  END IF;
  IF position('cf11_lifecycle_capabilities' in d) > 0
     OR position('EXACTLY_SEVEN' in d) > 0 THEN
    RAISE EXCEPTION 'LCP_PROOF_STILL_WHOLE_LESSON';
  END IF;
  IF position('cf10_assert_no_answer_leak' in d) = 0 THEN
    RAISE EXCEPTION 'LCP_PROOF_ANSWER_LEAK_GUARD_MISSING';
  END IF;
  IF position('cf11_assert_interactive_contract' in d) = 0 THEN
    RAISE EXCEPTION 'LCP_PROOF_HTML_CONTRACT_MISSING';
  END IF;
  IF position('LCP_IDENTITY_BINDING_REQUIRED' in d) = 0 THEN
    RAISE EXCEPTION 'LCP_PROOF_IDENTITY_BINDING_MISSING';
  END IF;
  IF position('LCP_COMPONENT_NOT_IN_BATCH' in d) = 0 THEN
    RAISE EXCEPTION 'LCP_PROOF_ACCEPTS_EMPTY_COMPONENT';
  END IF;
  IF has_function_privilege('anon',
       'public.golden_lesson_publish_component(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'LCP_PROOF_GRANTED_TO_ANON';
  END IF;
  RAISE NOTICE 'LCP proof passed: one component, one step, visible to students.';
END
$proof$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260907010000', 'publish_one_component_in_one_step')
ON CONFLICT (version) DO NOTHING;