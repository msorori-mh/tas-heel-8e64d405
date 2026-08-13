CREATE OR REPLACE FUNCTION public.qb_e2e_purge_questions(p_prefix text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids uuid[];
  v_count integer := 0;
  v_target_rows integer := 0;
  v_foreign integer := 0;
BEGIN
  -- Guard 1: prefix must be exactly the e2e namespace, with no wildcards that
  -- could widen the LIKE pattern into a mass delete.
  IF p_prefix IS NULL
     OR length(p_prefix) < 4
     OR left(p_prefix, 4) <> 'e2e-'
     OR p_prefix LIKE '%\%%' ESCAPE '\'
     OR p_prefix LIKE '%\_%' ESCAPE '\'
  THEN
    RAISE EXCEPTION 'E2E_PREFIX_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(id), count(*) INTO v_ids, v_target_rows
  FROM public.questions WHERE code LIKE p_prefix || '%';

  -- Guard 2: never touch a row outside the e2e namespace.
  SELECT count(*) INTO v_foreign
  FROM public.questions
  WHERE id = ANY(COALESCE(v_ids, ARRAY[]::uuid[]))
    AND (code IS NULL OR left(code, 4) <> 'e2e-');

  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'E2E_PURGE_SCOPE_VIOLATION: % non-e2e row(s) in target set', v_foreign
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, metadata)
  VALUES (
    auth.uid(),
    'qb_e2e_purge_questions.begin',
    'questions',
    jsonb_build_object('prefix', p_prefix, 'target_rows', v_target_rows, 'at', now())
  );

  IF v_ids IS NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, metadata)
    VALUES (
      auth.uid(),
      'qb_e2e_purge_questions.end',
      'questions',
      jsonb_build_object('prefix', p_prefix, 'deleted', 0, 'at', now())
    );
    RETURN 0;
  END IF;

  SET CONSTRAINTS ALL IMMEDIATE;
  ALTER TABLE public.question_revisions DISABLE TRIGGER USER;
  ALTER TABLE public.questions DISABLE TRIGGER USER;
  ALTER TABLE public.question_targets DISABLE TRIGGER USER;

  UPDATE public.questions SET current_published_revision_id = NULL WHERE id = ANY(v_ids);
  DELETE FROM public.question_targets WHERE question_id = ANY(v_ids);
  DELETE FROM public.assessment_questions WHERE question_id = ANY(v_ids);
  DELETE FROM public.question_revisions WHERE question_id = ANY(v_ids);
  DELETE FROM public.questions WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  ALTER TABLE public.question_targets ENABLE TRIGGER USER;
  ALTER TABLE public.question_revisions ENABLE TRIGGER USER;
  ALTER TABLE public.questions ENABLE TRIGGER USER;

  INSERT INTO public.audit_logs (actor_id, action, target_type, metadata)
  VALUES (
    auth.uid(),
    'qb_e2e_purge_questions.end',
    'questions',
    jsonb_build_object('prefix', p_prefix, 'deleted', v_count, 'at', now())
  );

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.qb_e2e_purge_questions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qb_e2e_purge_questions(text) FROM anon;
REVOKE ALL ON FUNCTION public.qb_e2e_purge_questions(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.qb_e2e_purge_questions(text) TO service_role;