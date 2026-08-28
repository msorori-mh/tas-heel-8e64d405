-- LESSON_COMPONENT_INDEPENDENT_PUBLISHING_03
--
-- Publishing the FIRST component of a lesson works. Publishing a SECOND one later
-- fails outright, so content staff are still forced to upload everything at once —
-- the exact complaint LCIP-02 was supposed to end.
--
-- Why:
--   golden_lesson_publish_cf11 moves every one of the seven lifecycle rows to REVIEW:
--
--     FOREACH cap IN ARRAY lifecycle_caps LOOP
--       PERFORM public.lesson_capability_transition(lesson_row.id, cap, 'REVIEW', NULL, NULL);
--     END LOOP;
--
--   After the first component is published its row is READY, so the second publish asks
--   for READY -> REVIEW. cf11_assert_demotion_allowed refuses exactly that:
--
--     CF11_DIRECT_TRANSITION_FORBIDDEN: ... READY -> REVIEW ... must go through
--     golden_lesson_revoke_cf11_ready
--
--   That guard is correct and stays. Un-publishing a live component still requires an
--   explicit revocation. What changes is that publishing a NEW component no longer
--   pretends to re-publish the whole lesson.
--
-- Three edits, all of them "REVIEW" -> "REVIEW or already READY":
--   1. publish: skip a capability that is already READY instead of demoting it.
--   2. publish: CF11_LIFECYCLE_REVIEW_NOT_EXACTLY_SEVEN counts REVIEW + READY.
--   3. attest:  CF11_READY_REQUIRES_REVIEW_FOR_ALL counts REVIEW + READY.
--
-- WHY A PATCH AND NOT A REPLACEMENT
--   golden_lesson_publish_cf11 is 38,861 characters and the deployed body has drifted
--   from this repository. Shipping a full CREATE OR REPLACE would silently discard
--   whatever hardening was applied out-of-band, and hand-transcribing 38KB to avoid
--   that is a worse risk than the defect. So this reads the live body, replaces only
--   the anchored fragments, and re-creates the function from the result.
--
--   Every anchor is verified before use: a fragment that does not appear exactly once
--   aborts the migration. It cannot half-apply, and it cannot match the wrong place.
--
-- Not changed: the demotion guard, the exact-seven lifecycle ROW set, replay state
-- validation, asset attestation, answer-leak scanning, separation of duties, evidence.

BEGIN;

DO $migration$
DECLARE
  src text;
  patched text;
  anchor text;
  replacement text;
  hits integer;

  PROCEDURE_MISSING constant text := 'LCIP03_FUNCTION_MISSING';
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1 + 2) golden_lesson_publish_cf11
  -- ---------------------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_publish_cf11';
  IF src IS NULL THEN
    RAISE EXCEPTION '%: golden_lesson_publish_cf11', PROCEDURE_MISSING USING ERRCODE = 'P0002';
  END IF;
  patched := src;

  -- (1) do not demote a component that is already published.
  anchor :=
    E'  FOREACH cap IN ARRAY lifecycle_caps LOOP\n' ||
    E'    PERFORM public.lesson_capability_transition(lesson_row.id, cap, ''REVIEW'', NULL, NULL);\n' ||
    E'  END LOOP;';
  replacement :=
    E'  FOREACH cap IN ARRAY lifecycle_caps LOOP\n' ||
    E'    -- LCIP-03: a component that is already READY stays published. Asking for\n' ||
    E'    -- READY -> REVIEW here is a demotion, which cf11_assert_demotion_allowed\n' ||
    E'    -- refuses, and that is why publishing a second component used to fail.\n' ||
    E'    IF (SELECT status FROM public.lesson_capability_lifecycle\n' ||
    E'         WHERE lesson_id = lesson_row.id AND capability = cap)\n' ||
    E'       IS DISTINCT FROM ''READY'' THEN\n' ||
    E'      PERFORM public.lesson_capability_transition(lesson_row.id, cap, ''REVIEW'', NULL, NULL);\n' ||
    E'    END IF;\n' ||
    E'  END LOOP;';
  hits := (length(patched) - length(replace(patched, anchor, ''))) / length(anchor);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP03_ANCHOR_NOT_UNIQUE: publish transition loop matched % times', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, anchor, replacement);

  -- (2) the staged set is complete when every capability is REVIEW *or* already READY.
  anchor :=
    E'   WHERE lesson_id = lesson_row.id AND status = ''REVIEW'';\n' ||
    E'  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN\n' ||
    E'    RAISE EXCEPTION ''CF11_LIFECYCLE_REVIEW_NOT_EXACTLY_SEVEN: %'', array_to_string(live_caps, '','')';
  replacement :=
    E'   WHERE lesson_id = lesson_row.id AND status IN (''REVIEW'', ''READY'');\n' ||
    E'  -- LCIP-03: READY counts as staged. A component published earlier is not missing.\n' ||
    E'  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN\n' ||
    E'    RAISE EXCEPTION ''CF11_LIFECYCLE_REVIEW_NOT_EXACTLY_SEVEN: %'', array_to_string(live_caps, '','')';
  hits := (length(patched) - length(replace(patched, anchor, ''))) / length(anchor);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP03_ANCHOR_NOT_UNIQUE: publish review-set assertion matched % times', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, anchor, replacement);

  EXECUTE patched;

  -- ---------------------------------------------------------------------------
  -- 3) golden_lesson_attest_cf11_ready
  -- ---------------------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_attest_cf11_ready';
  IF src IS NULL THEN
    RAISE EXCEPTION '%: golden_lesson_attest_cf11_ready', PROCEDURE_MISSING USING ERRCODE = 'P0002';
  END IF;
  patched := src;

  anchor :=
    E'   WHERE lesson_id = lesson_row.id AND status = ''REVIEW'';\n' ||
    E'  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN\n' ||
    E'    RAISE EXCEPTION ''CF11_READY_REQUIRES_REVIEW_FOR_ALL: review=[%]'',';
  replacement :=
    E'   WHERE lesson_id = lesson_row.id AND status IN (''REVIEW'', ''READY'');\n' ||
    E'  -- LCIP-03: a mixed REVIEW/READY lesson is now the normal shape of a lesson whose\n' ||
    E'  -- components were published one at a time, not evidence of an out-of-band change.\n' ||
    E'  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN\n' ||
    E'    RAISE EXCEPTION ''CF11_READY_REQUIRES_REVIEW_FOR_ALL: review=[%]'',';
  hits := (length(patched) - length(replace(patched, anchor, ''))) / length(anchor);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP03_ANCHOR_NOT_UNIQUE: attest review-set assertion matched % times', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, anchor, replacement);

  EXECUTE patched;

  RAISE NOTICE 'LCIP-03 applied: a second component can be published without demoting the first.';
END
$migration$;

COMMIT;

-- Rollback:
--   Re-apply the same technique in reverse, or restore both functions from
--   20260824000000_content_factory_11_publication.sql and
--   20260831020000_cf11_ready_scoped_to_authored_components.sql. NOTE that the
--   repository copy of publish_cf11 has drifted from production; prefer the reverse
--   patch. No data changes to undo.
