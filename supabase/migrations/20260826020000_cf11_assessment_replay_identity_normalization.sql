-- CF11 assessment replay identity normalization.
-- Production evidence: lesson_assessments normalizes assessment_code to lowercase, while
-- the persisted CF11 publication plan retains the canonical uppercase source code.
-- Scope: patch the replay comparator only. No row mutation, no lifecycle transition.
BEGIN;

DO $patch$
DECLARE
  src text;
  fixed text;
  old_block text := $old$  SELECT id INTO v_assessment FROM public.lesson_assessments
   WHERE lesson_id = v_lesson AND assessment_code = _plan->'assessment'->>'code';
  IF v_assessment IS NULL THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: assessment' USING ERRCODE = '23505';
  END IF;$old$;
  new_block text := $new$  SELECT count(*), min(id::text)::uuid
    INTO v_count, v_assessment
    FROM public.lesson_assessments
   WHERE lesson_id = v_lesson
     AND lower(btrim(assessment_code)) =
         lower(btrim(_plan->'assessment'->>'code'));
  IF v_count <> 1 OR v_assessment IS NULL THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: assessment' USING ERRCODE = '23505';
  END IF;$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'cf11_assert_replay_state'
     AND pg_get_function_identity_arguments(p.oid) = '_plan jsonb';

  IF src IS NULL THEN
    RAISE EXCEPTION 'CF11_ASSESSMENT_REPLAY_FIX_GUARD: cf11_assert_replay_state not found';
  END IF;

  IF position('lower(btrim(assessment_code))' in src) > 0 THEN
    RETURN;
  END IF;

  IF position(old_block in src) = 0 THEN
    RAISE EXCEPTION 'CF11_ASSESSMENT_REPLAY_FIX_GUARD: expected replay block not found';
  END IF;

  fixed := replace(src, old_block, new_block);
  EXECUTE fixed;
END
$patch$;

COMMENT ON FUNCTION public.cf11_assert_replay_state(jsonb) IS
  'Revalidates every persisted CF11 publication category; assessment identity is compared in the same trimmed, case-normalized form stored by the domain table.';

COMMIT;
