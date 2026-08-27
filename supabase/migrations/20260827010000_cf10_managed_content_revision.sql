-- CF10 managed revision support for the three non-versioned authored targets.
--
-- A verified package version is explicitly presented as a "new version" in the
-- admin UI, but CF10 previously rejected every changed lesson-book, explanation,
-- or summary payload. This forward migration keeps the conflict guard while
-- turning it into an explicit, hash-pinned replacement:
--   * DRY_RUN pins the live target hashes and lifecycle state in the reviewed plan.
--   * EXECUTE re-opens matching lifecycle rows as DRAFT while preserving READY evidence.
--   * only an authoritative CF09-bound batch may replace a target.
--   * the update is compare-and-swap; drift aborts the whole transaction.
--   * questions and answer-layer rows remain versioned and fail closed unchanged.

DO $migration$
DECLARE
  src text;
  old_plan text;
  new_plan text;
  old_gate text;
  new_gate text;
  old_book text;
  new_book text;
  old_explanation text;
  new_explanation text;
  old_summary text;
  new_summary text;
  occurrences integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';

  IF src IS NULL THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_FUNCTION_NOT_FOUND';
  END IF;
  IF position('CF10_MANAGED_REVISION_TARGET_DRIFT' in src) > 0 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_ALREADY_APPLIED';
  END IF;

  old_plan := $old$  plan_sha := public.cf10_text_sha256(plan::text);$old$;
  new_plan := $new$  -- Pin the live rows and lifecycle state that the operator is reviewing. Any
  -- change after DRY_RUN produces a different plan hash and fails before writes.
  plan := plan || jsonb_build_object(
    'managedRevision', jsonb_build_object(
      'policy', 'HASH_PINNED_COMPARE_AND_SWAP',
      'targets', jsonb_build_object(
        'lesson_book_contents', jsonb_build_object(
          'existingHash', (SELECT public.cf10_text_sha256(content)
                             FROM public.lesson_book_contents
                            WHERE lesson_id = lesson_row.id),
          'incomingHash', payloads->'officialBookContent'->>'sha256'),
        'lesson_explanations', jsonb_build_object(
          'existingHash', (SELECT public.cf10_text_sha256(content)
                             FROM public.lesson_explanations
                            WHERE lesson_id = lesson_row.id
                              AND explanation_code IN (
                                external_lesson_code || '-EXP',
                                lower(external_lesson_code || '-EXP'))
                            LIMIT 1),
          'incomingHash', payloads->'tamkeenExplanationHtml'->>'sha256'),
        'lesson_summaries', jsonb_build_object(
          'existingHash', (SELECT public.cf10_text_sha256(summary)
                             FROM public.lesson_summaries
                            WHERE lesson_id = lesson_row.id),
          'incomingHash', payloads->'lessonSummaryHtml'->>'sha256')),
      'lifecycle', coalesce((
        SELECT jsonb_object_agg(
                 e.lifecycle_capability,
                 jsonb_build_object(
                   'status', l.status,
                   'applicability', l.applicability,
                   'draftHash', l.draft_hash,
                   'incomingHash', e.source_sha256))
          FROM public.golden_lesson_domain_stage_entries e
          LEFT JOIN public.lesson_capability_lifecycle l
            ON l.lesson_id = lesson_row.id
           AND l.capability = e.lifecycle_capability
         WHERE e.batch_id = _batch_id
      ), '{}'::jsonb)));

  plan_sha := public.cf10_text_sha256(plan::text);$new$;

  old_gate := $old$  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF10_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;$old$;
  new_gate := $new$  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF10_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  -- Lock every pre-existing lifecycle target and prove that it still matches the
  -- reviewed plan before any row is re-opened as a new draft.
  PERFORM 1
    FROM public.lesson_capability_lifecycle l
    JOIN public.golden_lesson_domain_stage_entries e
      ON e.lifecycle_capability = l.capability
     AND e.batch_id = _batch_id
   WHERE l.lesson_id = lesson_row.id
   FOR UPDATE OF l;
  IF EXISTS (
    SELECT 1
      FROM public.golden_lesson_domain_stage_entries e
     WHERE e.batch_id = _batch_id
       AND (plan #>> ARRAY['managedRevision','lifecycle',e.lifecycle_capability,'status'])
           IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.lesson_capability_lifecycle l
          WHERE l.lesson_id = lesson_row.id
            AND l.capability = e.lifecycle_capability
            AND l.status::text IS NOT DISTINCT FROM
                (plan #>> ARRAY['managedRevision','lifecycle',e.lifecycle_capability,'status'])
            AND l.applicability::text IS NOT DISTINCT FROM
                (plan #>> ARRAY['managedRevision','lifecycle',e.lifecycle_capability,'applicability'])
            AND l.draft_hash IS NOT DISTINCT FROM
                (plan #>> ARRAY['managedRevision','lifecycle',e.lifecycle_capability,'draftHash'])))
  THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_LIFECYCLE_DRIFT' USING ERRCODE = '23514';
  END IF;

  -- A new, reviewed package version starts a new draft for the exact staged set.
  -- READY evidence is deliberately preserved for audit/rollback; it is never served
  -- while status is DRAFT. Applicability changes remain a hard conflict below.
  UPDATE public.lesson_capability_lifecycle l
     SET status = 'DRAFT',
         draft_hash = e.source_sha256,
         draft_updated_at = now(),
         reviewed_by = NULL,
         reviewed_at = NULL,
         updated_at = now()
    FROM public.golden_lesson_domain_stage_entries e
   WHERE e.batch_id = _batch_id
     AND l.lesson_id = lesson_row.id
     AND l.capability = e.lifecycle_capability
     AND l.applicability::text = e.applicability
     AND (
       l.status IS DISTINCT FROM 'DRAFT'
       OR l.draft_hash IS DISTINCT FROM e.source_sha256
       OR l.reviewed_by IS NOT NULL
       OR l.reviewed_at IS NOT NULL
     );
  GET DIAGNOSTICS rc = ROW_COUNT;
  lifecycle_written := lifecycle_written + rc;
  domain_writes := domain_writes + rc;$new$;

  old_book := $old$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_book_contents' USING ERRCODE = '23514';
  END IF;$old$;
  new_book := $new$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    IF binding_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_book_contents' USING ERRCODE = '23514';
    END IF;
    UPDATE public.lesson_book_contents
       SET content = payload_text
     WHERE lesson_id = lesson_row.id
       AND public.cf10_text_sha256(content) =
           (plan #>> ARRAY['managedRevision','targets','lesson_book_contents','existingHash']);
    GET DIAGNOSTICS rc = ROW_COUNT;
    IF rc <> 1 THEN
      RAISE EXCEPTION 'CF10_MANAGED_REVISION_TARGET_DRIFT: lesson_book_contents'
        USING ERRCODE = '23514';
    END IF;
    domain_writes := domain_writes + rc;
  END IF;$new$;

  old_explanation := $old$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_explanations' USING ERRCODE = '23514';
  END IF;$old$;
  new_explanation := $new$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    IF binding_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_explanations' USING ERRCODE = '23514';
    END IF;
    UPDATE public.lesson_explanations
       SET content = payload_text
     WHERE lesson_id = lesson_row.id
       AND explanation_code IN (
         external_lesson_code || '-EXP',
         lower(external_lesson_code || '-EXP'))
       AND public.cf10_text_sha256(content) =
           (plan #>> ARRAY['managedRevision','targets','lesson_explanations','existingHash']);
    GET DIAGNOSTICS rc = ROW_COUNT;
    IF rc <> 1 THEN
      RAISE EXCEPTION 'CF10_MANAGED_REVISION_TARGET_DRIFT: lesson_explanations'
        USING ERRCODE = '23514';
    END IF;
    domain_writes := domain_writes + rc;
  END IF;$new$;

  old_summary := $old$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_summaries' USING ERRCODE = '23514';
  END IF;$old$;
  new_summary := $new$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    IF binding_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_summaries' USING ERRCODE = '23514';
    END IF;
    UPDATE public.lesson_summaries
       SET summary = payload_text
     WHERE lesson_id = lesson_row.id
       AND public.cf10_text_sha256(summary) =
           (plan #>> ARRAY['managedRevision','targets','lesson_summaries','existingHash']);
    GET DIAGNOSTICS rc = ROW_COUNT;
    IF rc <> 1 THEN
      RAISE EXCEPTION 'CF10_MANAGED_REVISION_TARGET_DRIFT: lesson_summaries'
        USING ERRCODE = '23514';
    END IF;
    domain_writes := domain_writes + rc;
  END IF;$new$;

  occurrences := (length(src) - length(replace(src, old_plan, ''))) / length(old_plan);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_PLAN_PRECONDITION: %', occurrences;
  END IF;
  occurrences := (length(src) - length(replace(src, old_gate, ''))) / length(old_gate);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_GATE_PRECONDITION: %', occurrences;
  END IF;
  occurrences := (length(src) - length(replace(src, old_book, ''))) / length(old_book);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_BOOK_PRECONDITION: %', occurrences;
  END IF;
  occurrences := (length(src) - length(replace(src, old_explanation, ''))) /
    length(old_explanation);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_EXPLANATION_PRECONDITION: %', occurrences;
  END IF;
  occurrences := (length(src) - length(replace(src, old_summary, ''))) / length(old_summary);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_SUMMARY_PRECONDITION: %', occurrences;
  END IF;

  src := replace(src, old_plan, new_plan);
  src := replace(src, old_gate, new_gate);
  src := replace(src, old_book, new_book);
  src := replace(src, old_explanation, new_explanation);
  src := replace(src, old_summary, new_summary);
  EXECUTE src;

  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';

  occurrences := (length(src) - length(replace(src,
    'CF10_MANAGED_REVISION_TARGET_DRIFT', ''))) /
    length('CF10_MANAGED_REVISION_TARGET_DRIFT');
  IF occurrences <> 3 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_POSTVERIFY_TARGETS: %', occurrences;
  END IF;
  IF position('HASH_PINNED_COMPARE_AND_SWAP' in src) = 0 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_POSTVERIFY_PLAN_MISSING';
  END IF;
  IF position('CF10_CONTENT_HASH_CONFLICT: questions' in src) = 0 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_POSTVERIFY_QUESTION_GUARD_LOST';
  END IF;
  IF position('UPDATE public.lesson_capability_lifecycle l' in src) = 0 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_POSTVERIFY_LIFECYCLE_MISSING';
  END IF;
END
$migration$;

-- Rollback: restore the immediately preceding function definition from the
-- migration backup or repository source. No domain row is written while this
-- migration is applied; replacements happen only inside later CF10 EXECUTEs.
